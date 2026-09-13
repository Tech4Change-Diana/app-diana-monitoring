import { describe, it, expect } from "vitest";
import { extractFeatures, SIGNAL_KEYS } from "../src/pipeline/featureExtractor.js";
import { scenarioToConversation } from "../src/ingestor/mockSource.js";
import { mockScenarios } from "../src/ingestor/fixtures/scenarios.js";
import type { Conversation } from "../src/contracts/index.js";

const conv = (texts: ["child" | "other", string][]): Conversation => ({
  id: "c1",
  childId: "child",
  childName: "X",
  contactId: "contact",
  contactName: "Y",
  startedAt: "2026-09-13T10:00:00Z",
  messages: texts.map(([author, text], i) => ({
    id: `m${i}`,
    author,
    text,
    timestamp: new Date(Date.parse("2026-09-13T10:00:00Z") + i * 60000).toISOString(),
  })),
});

describe("extractFeatures", () => {
  it("detecta pedido de segredo e solicitação de imagem", () => {
    const { features } = extractFeatures(
      conv([
        ["other", "Oi, tudo bem?"],
        ["other", "não conta pra ninguém que a gente conversa"],
        ["other", "me manda uma foto sua"],
      ]),
    );
    expect(features.secrecyRequests).toBe(1);
    expect(features.imageRequests).toBe(1);
    expect(features.suspiciousMessageCount).toBe(2);
    expect(features.messageCount).toBe(3);
  });

  it("mede escalada quando os sinais estão na segunda metade", () => {
    const { features } = extractFeatures(
      conv([
        ["other", "oi"],
        ["child", "oi"],
        ["other", "tudo bem?"],
        ["other", "me manda uma foto sua"],
        ["other", "não conta pra ninguém"],
      ]),
    );
    expect(features.conversationEscalation).toBeGreaterThan(0);
  });

  it("conversa neutra não gera sinais", () => {
    const { features } = extractFeatures(
      conv([
        ["other", "bom dia"],
        ["child", "bom dia, tudo bem?"],
      ]),
    );
    expect(features.suspiciousMessageCount).toBe(0);
    expect(features.conversationEscalation).toBe(0);
  });

  it("cenário grooming portado dispara múltiplos sinais", () => {
    const grooming = mockScenarios.find((s) => s.id === "grooming")!;
    const { features } = extractFeatures(scenarioToConversation(grooming, new Date()));
    expect(features.secrecyRequests).toBeGreaterThanOrEqual(1);
    expect(features.imageRequests).toBeGreaterThanOrEqual(1);
    expect(features.suspiciousMessageCount).toBeGreaterThanOrEqual(2);
  });

  it("expõe as chaves de sinal esperadas", () => {
    expect(SIGNAL_KEYS).toContain("secrecy_request");
    expect(SIGNAL_KEYS).toContain("image_request");
    expect(SIGNAL_KEYS).toContain("self_harm");
  });
});
