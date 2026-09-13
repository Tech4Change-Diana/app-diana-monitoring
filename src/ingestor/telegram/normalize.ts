/**
 * DIANA — Normalização `Update` do Telegram → `ConversationMessage`.
 *
 * Mapeamento (doc 03 §5.5 / análise §5.5):
 *   id            <- message_id (prefixado "MSG-")
 *   timestamp     <- date (epoch → ISO 8601)
 *   author        <- from.id via DIANA_CHILD_MEMBER_MAP (child | other)
 *   text          <- text
 *   conversation  <- chat.id (prefixado "CONV-")
 *
 * A pseudonimização de PII NÃO ocorre aqui — ocorre na etapa `preprocess` do
 * pipeline. O ingestor só padroniza IDs/timestamps/ordem (RF-04).
 */
import type { ConversationMessage, MessageAuthor } from "../../contracts/index.js";
import type { TelegramMessage } from "./client.js";

export interface NormalizedMessage {
  chatId: number;
  conversationId: string;
  message: ConversationMessage;
}

export const conversationIdForChat = (chatId: number): string => `CONV-${chatId}`;
export const messageIdFor = (messageId: number): string => `MSG-${messageId}`;

/**
 * Determina o autor: `child` se `from.id` corresponder ao mapeado para o chat
 * em `DIANA_CHILD_MEMBER_MAP`; caso contrário `other`.
 */
export function resolveAuthor(
  message: TelegramMessage,
  childMemberMap: Record<string, string>,
): MessageAuthor {
  const childId = childMemberMap[String(message.chat.id)];
  if (childId && message.from && String(message.from.id) === childId) return "child";
  return "other";
}

/**
 * Normaliza uma mensagem do Telegram. Retorna `null` para mensagens sem texto
 * (mídia/edições/callbacks são ignorados no MVP — minimização na borda).
 */
export function normalizeMessage(
  message: TelegramMessage,
  childMemberMap: Record<string, string>,
): NormalizedMessage | null {
  if (!message.text || message.text.trim() === "") return null;

  return {
    chatId: message.chat.id,
    conversationId: conversationIdForChat(message.chat.id),
    message: {
      id: messageIdFor(message.message_id),
      author: resolveAuthor(message, childMemberMap),
      text: message.text,
      timestamp: new Date(message.date * 1000).toISOString(),
    },
  };
}
