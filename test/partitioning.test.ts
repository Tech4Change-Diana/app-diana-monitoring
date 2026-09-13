import { describe, it, expect } from "vitest";
import { partitionMessages, reconstructWindow } from "../src/pipeline/partitioning.js";
import type { ConversationMessage } from "../src/contracts/index.js";

const now = new Date("2026-09-13T12:00:00Z");
const msg = (id: string, minutesAgo: number): ConversationMessage => ({
  id,
  author: "other",
  text: id,
  timestamp: new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString(),
});

describe("partitionMessages", () => {
  it("distribui mensagens em N partições de BATCH horas", () => {
    const messages = [
      msg("recent", 30), // partição 0 (0–2h)
      msg("mid", 150), // partição 1 (2–4h)
      msg("old", 300), // partição 2 (4–6h)
      msg("tooOld", 500), // fora da janela (>6h)
    ];
    const parts = partitionMessages(messages, now, 2, 3);
    expect(parts).toHaveLength(3);
    expect(parts[0]!.messages.map((m) => m.id)).toEqual(["recent"]);
    expect(parts[1]!.messages.map((m) => m.id)).toEqual(["mid"]);
    expect(parts[2]!.messages.map((m) => m.id)).toEqual(["old"]);
    // "tooOld" foi descartada.
    const all = parts.flatMap((p) => p.messages.map((m) => m.id));
    expect(all).not.toContain("tooOld");
  });

  it("reconstrói a janela em ordem cronológica", () => {
    const parts = partitionMessages([msg("a", 300), msg("b", 30), msg("c", 150)], now, 2, 3);
    const window = reconstructWindow(parts);
    expect(window.map((m) => m.id)).toEqual(["a", "c", "b"]);
  });
});
