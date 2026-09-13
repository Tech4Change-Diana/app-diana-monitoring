import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config/index.js";

const env = (over: Record<string, string>): NodeJS.ProcessEnv => over as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("usa defaults mock-first quando o ambiente está vazio", () => {
    const c = loadConfig(env({}));
    expect(c.ingestMode).toBe("mock");
    expect(c.analyzerMode).toBe("mock");
    expect(c.stateBackend).toBe("file");
    expect(c.batchHours).toBe(2);
    expect(c.windowPartitions).toBe(3);
  });

  it("parseia CSV de chat ids e o JSON do child member map", () => {
    const c = loadConfig(
      env({
        INGEST_MODE: "real",
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_ALLOWED_CHAT_IDS: "-100, -200 ,-300",
        DIANA_CHILD_MEMBER_MAP: '{"-100":"55"}',
      }),
    );
    expect(c.telegram.allowedChatIds).toEqual(["-100", "-200", "-300"]);
    expect(c.telegram.childMemberMap).toEqual({ "-100": "55" });
  });

  it("falha se INGEST_MODE=real sem TELEGRAM_BOT_TOKEN", () => {
    expect(() =>
      loadConfig(env({ INGEST_MODE: "real", TELEGRAM_ALLOWED_CHAT_IDS: "-100" })),
    ).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("falha se INGEST_MODE=real sem chats permitidos", () => {
    expect(() => loadConfig(env({ INGEST_MODE: "real", TELEGRAM_BOT_TOKEN: "t" }))).toThrow(
      /TELEGRAM_ALLOWED_CHAT_IDS/,
    );
  });

  it("bloqueia ANALYZER_MODE=oci no MVP", () => {
    expect(() => loadConfig(env({ ANALYZER_MODE: "oci" }))).toThrow(/oci/i);
  });

  it("rejeita DIANA_CHILD_MEMBER_MAP com JSON inválido", () => {
    expect(() => loadConfig(env({ DIANA_CHILD_MEMBER_MAP: "não é json" }))).toThrow(/JSON/);
  });
});
