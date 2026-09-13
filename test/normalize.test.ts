import { describe, it, expect } from "vitest";
import {
  normalizeMessage,
  resolveAuthor,
  conversationIdForChat,
  messageIdFor,
} from "../src/ingestor/telegram/normalize.js";
import type { TelegramMessage } from "../src/ingestor/telegram/client.js";

const baseMessage = (over: Partial<TelegramMessage> = {}): TelegramMessage => ({
  message_id: 1291,
  from: { id: 55 },
  chat: { id: -1002, type: "group", title: "Grupo Teste" },
  date: 1_757_760_000, // epoch seg
  text: "olá",
  ...over,
});

describe("normalize Update → ConversationMessage", () => {
  it("mapeia ids, timestamp e texto", () => {
    const normalized = normalizeMessage(baseMessage(), {});
    expect(normalized).not.toBeNull();
    expect(normalized!.message.id).toBe(messageIdFor(1291));
    expect(normalized!.conversationId).toBe(conversationIdForChat(-1002));
    expect(normalized!.message.text).toBe("olá");
    expect(normalized!.message.timestamp).toBe(new Date(1_757_760_000 * 1000).toISOString());
  });

  it("resolve autor 'child' via DIANA_CHILD_MEMBER_MAP", () => {
    const map = { "-1002": "55" };
    expect(resolveAuthor(baseMessage({ from: { id: 55 } }), map)).toBe("child");
    expect(resolveAuthor(baseMessage({ from: { id: 99 } }), map)).toBe("other");
    expect(resolveAuthor(baseMessage({ from: { id: 55 } }), {})).toBe("other");
  });

  it("ignora mensagens sem texto (mídia/edições)", () => {
    expect(normalizeMessage(baseMessage({ text: undefined }), {})).toBeNull();
    expect(normalizeMessage(baseMessage({ text: "   " }), {})).toBeNull();
  });
});
