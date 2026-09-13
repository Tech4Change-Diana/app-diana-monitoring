/**
 * DIANA — Abstração de ingestão (`IngestSource`).
 *
 * O ingestor expõe uma interface única; a fonte concreta é escolhida por
 * `INGEST_MODE` (mock | real | both). Mock e real produzem o MESMO tipo
 * `Conversation` — tudo a jusante é idêntico (princípio P8). Ver
 * `docs/analise-tecnica-fase1.md` §5.1.
 */
import type { Conversation } from "../contracts/index.js";
import type { AppConfig } from "../config/index.js";
import type { StateStore } from "../state/StateStore.js";
import type { Logger } from "../logger.js";
import { MockSource } from "./mockSource.js";
import { TelegramSource } from "./telegram/telegramSource.js";
import { TelegramClient } from "./telegram/client.js";
import { CompositeSource } from "./compositeSource.js";

export interface IngestSource {
  /** Produz as conversas (novas desde o checkpoint) a analisar neste batch. */
  collect(now: Date): Promise<Conversation[]>;
  /**
   * Confirma o checkpoint da fonte (ex.: offset do Telegram) — chamado pelo
   * orquestrador APÓS o batch concluir com sucesso. Opcional (o mock não usa).
   */
  commit?(): Promise<void>;
}

export interface IngestDeps {
  config: AppConfig;
  store: StateStore;
  logger: Logger;
}

/** Monta a `IngestSource` conforme `INGEST_MODE`. */
export function createIngestSource(deps: IngestDeps): IngestSource {
  const { config } = deps;

  const mock = () => new MockSource();
  const telegram = () => {
    const token = config.telegram.botToken;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN ausente para INGEST_MODE=real|both.");
    }
    const client = new TelegramClient(token, deps.logger);
    return new TelegramSource(client, {
      allowedChatIds: config.telegram.allowedChatIds,
      childMemberMap: config.telegram.childMemberMap,
      pollTimeoutSeconds: config.telegram.pollTimeoutSeconds,
      store: deps.store,
      logger: deps.logger,
    });
  };

  switch (config.ingestMode) {
    case "mock":
      return mock();
    case "real":
      return telegram();
    case "both":
      return new CompositeSource([mock(), telegram()]);
    default:
      return mock();
  }
}

export { MockSource } from "./mockSource.js";
export { CompositeSource } from "./compositeSource.js";
export { TelegramSource } from "./telegram/telegramSource.js";
export { TelegramClient } from "./telegram/client.js";
