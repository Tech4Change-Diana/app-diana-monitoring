/**
 * DIANA — Fonte de ingestão via Telegram (`INGEST_MODE=real`).
 *
 * Estratégia "drain" (análise §5.4-A): a cada execução, faz `getUpdates` em
 * loop até esvaziar a fila, coleta tudo desde o offset e sai — compatível com
 * `--once` + Resource Scheduler.
 *
 * Checkpoint (RF-02): o offset (`last_update_id`) só é persistido em `commit()`,
 * chamado pelo orquestrador APÓS o batch concluir — evita perder mensagens se o
 * batch falhar no meio. Ver `docs/analise-tecnica-fase1.md` §5.3.
 */
import type { Conversation, ConversationMessage } from "../../contracts/index.js";
import type { StateStore } from "../../state/StateStore.js";
import type { Logger } from "../../logger.js";
import type { IngestSource } from "../index.js";
import type { TelegramClient } from "./client.js";
import { normalizeMessage } from "./normalize.js";

export interface TelegramSourceOptions {
  allowedChatIds: string[];
  childMemberMap: Record<string, string>;
  pollTimeoutSeconds: number;
  store: StateStore;
  logger: Logger;
}

/** Trava de segurança: nº máx. de chamadas getUpdates por batch. */
const MAX_DRAIN_ITERATIONS = 100;

interface ChatBucket {
  chatId: number;
  title: string;
  messages: ConversationMessage[];
}

export class TelegramSource implements IngestSource {
  private pendingOffset: number | null = null;

  constructor(
    private readonly client: TelegramClient,
    private readonly options: TelegramSourceOptions,
  ) {}

  async collect(_now: Date): Promise<Conversation[]> {
    const { allowedChatIds, childMemberMap, pollTimeoutSeconds, store, logger } = this.options;
    const allowed = new Set(allowedChatIds);

    const stored = await store.getTelegramOffset();
    let offset = stored ? stored.last_update_id + 1 : undefined;
    let maxUpdateId = stored ? stored.last_update_id : 0;

    const buckets = new Map<string, ChatBucket>();

    for (let iteration = 0; iteration < MAX_DRAIN_ITERATIONS; iteration += 1) {
      const updates = await this.client.getUpdates(offset, pollTimeoutSeconds);
      if (updates.length === 0) break;

      for (const update of updates) {
        maxUpdateId = Math.max(maxUpdateId, update.update_id);

        const message = update.message;
        if (!message) continue;
        if (allowed.size > 0 && !allowed.has(String(message.chat.id))) continue;

        const normalized = normalizeMessage(message, childMemberMap);
        if (!normalized) continue;

        const key = normalized.conversationId;
        const bucket =
          buckets.get(key) ??
          ({
            chatId: message.chat.id,
            title: message.chat.title ?? `Chat ${message.chat.id}`,
            messages: [],
          } satisfies ChatBucket);
        bucket.messages.push(normalized.message);
        buckets.set(key, bucket);
      }

      offset = maxUpdateId + 1;
    }

    this.pendingOffset = maxUpdateId;

    const conversations = Array.from(buckets.entries()).map(([conversationId, bucket]) =>
      this.toConversation(conversationId, bucket, childMemberMap),
    );
    logger.info(
      `Telegram: ${conversations.length} conversa(s) coletada(s) até update_id ${maxUpdateId}`,
    );
    return conversations;
  }

  /** Persiste o offset — chamado pelo orquestrador após o batch concluir. */
  async commit(): Promise<void> {
    if (this.pendingOffset === null) return;
    await this.options.store.putTelegramOffset({ last_update_id: this.pendingOffset });
    this.options.logger.debug(`Telegram offset persistido: ${this.pendingOffset}`);
    this.pendingOffset = null;
  }

  private toConversation(
    conversationId: string,
    bucket: ChatBucket,
    childMemberMap: Record<string, string>,
  ): Conversation {
    const messages = [...bucket.messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const childId = childMemberMap[String(bucket.chatId)] ?? "unknown";
    return {
      id: conversationId,
      childId,
      childName: childId,
      contactId: String(bucket.chatId),
      contactName: bucket.title,
      startedAt: messages[0]?.timestamp ?? new Date().toISOString(),
      messages,
    };
  }
}
