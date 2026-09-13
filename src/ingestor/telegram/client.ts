/**
 * DIANA — Cliente da Telegram Bot API (long-polling `getUpdates`).
 *
 * Usa o `fetch` global do Node 22 (sem dependência extra). Bot API (não
 * MTProto); apenas `allowed_updates=["message"]`. Ver
 * `docs/03-telegram-captura.md` e `docs/analise-tecnica-fase1.md` §5.2.
 */
import type { Logger } from "../../logger.js";

export interface TelegramChat {
  id: number;
  type?: string;
  title?: string;
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  /** epoch (segundos). */
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface GetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

const API_BASE = "https://api.telegram.org";

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly logger: Logger,
    private readonly baseUrl: string = API_BASE,
  ) {}

  /**
   * Uma chamada `getUpdates`. `offset` = próximo update_id esperado
   * (last_update_id + 1). `timeoutSeconds` = long-polling (0 = retorno imediato).
   */
  async getUpdates(offset: number | undefined, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.baseUrl}/bot${this.token}/getUpdates`);
    if (offset !== undefined) url.searchParams.set("offset", String(offset));
    url.searchParams.set("timeout", String(timeoutSeconds));
    url.searchParams.set("allowed_updates", JSON.stringify(["message"]));

    const response = await fetch(url, {
      // Margem sobre o long-polling para não abortar antes do servidor responder.
      signal: AbortSignal.timeout((timeoutSeconds + 10) * 1000),
    });

    if (!response.ok) {
      throw new Error(`Telegram getUpdates HTTP ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as GetUpdatesResponse;
    if (!body.ok) {
      throw new Error(`Telegram getUpdates falhou: ${body.description ?? "resposta não-ok"}`);
    }

    const updates = body.result ?? [];
    this.logger.debug(`Telegram getUpdates: ${updates.length} update(s) (offset=${offset ?? "-"})`);
    return updates;
  }
}
