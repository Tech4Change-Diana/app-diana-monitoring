import { describe, it, expect } from "vitest";
import { evaluateRisk, levelFromScore, SIGNAL_CATEGORY } from "../src/risk-engine/index.js";
import type {
  ContextualFactor,
  ConversationFeatures,
  DetectedSignal,
} from "../src/contracts/index.js";

const emptyFeatures = (over: Partial<ConversationFeatures> = {}): ConversationFeatures => ({
  secrecyRequests: 0,
  imageRequests: 0,
  personalInfoRequests: 0,
  isolationAttempts: 0,
  threats: 0,
  insults: 0,
  blackmailAttempts: 0,
  sexualContentSignals: 0,
  emotionalDistressSignals: 0,
  selfHarmSignals: 0,
  messageCount: 0,
  suspiciousMessageCount: 0,
  conversationEscalation: 0,
  ...over,
});

const signal = (over: Partial<DetectedSignal> = {}): DetectedSignal => ({
  id: "sig-x",
  type: "image_request",
  confidence: 0.7,
  messageIds: ["m1"],
  title: "Solicitação de imagem",
  description: "",
  severity: "high",
  ...over,
});

describe("levelFromScore", () => {
  it("mapeia as faixas dos thresholds do protótipo", () => {
    expect(levelFromScore(0)).toBe("none");
    expect(levelFromScore(4)).toBe("none");
    expect(levelFromScore(5)).toBe("low");
    expect(levelFromScore(19)).toBe("low");
    expect(levelFromScore(20)).toBe("medium");
    expect(levelFromScore(54)).toBe("medium");
    expect(levelFromScore(55)).toBe("high");
    expect(levelFromScore(79)).toBe("high");
    expect(levelFromScore(80)).toBe("critical");
    expect(levelFromScore(100)).toBe("critical");
  });
});

describe("evaluateRisk", () => {
  it("sem sinais → none, prioridade baixa, sem atenção do responsável", () => {
    const a = evaluateRisk(emptyFeatures(), [], []);
    expect(a.score).toBe(0);
    expect(a.level).toBe("none");
    expect(a.priority).toBe("low");
    expect(a.requiresGuardianAttention).toBe(false);
    expect(a.categories).toHaveLength(0);
    expect(a.rationale).toContain("Nenhum sinal");
  });

  it("qualquer sinal de severidade alta aciona atenção do responsável (salvaguarda §6.6)", () => {
    // Um único sinal high com features neutras: mesmo que o score não alcance
    // medium, requiresGuardianAttention deve ser true.
    const a = evaluateRisk(
      emptyFeatures({ messageCount: 1, suspiciousMessageCount: 1 }),
      [signal()],
      [],
    );
    expect(a.requiresGuardianAttention).toBe(true);
  });

  it("é determinístico: mesma entrada → mesma saída", () => {
    const features = emptyFeatures({
      messageCount: 8,
      suspiciousMessageCount: 3,
      conversationEscalation: 0.7,
    });
    const signals = [
      signal({ id: "a", type: "secrecy_request", severity: "high", confidence: 0.6 }),
      signal({ id: "b", type: "image_request", severity: "high", confidence: 0.7 }),
    ];
    const factors: ContextualFactor[] = [
      { type: "combination", label: "Combinação", description: "", contribution: "high" },
    ];
    const first = evaluateRisk(features, signals, factors);
    const second = evaluateRisk(features, signals, factors);
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(0);
    expect(first.categories[0]?.probability).toBeGreaterThan(0);
  });

  it("mapa sinal→categoria: sinal desconhecido cai em grooming (fallback §4-a)", () => {
    expect(SIGNAL_CATEGORY.image_request).toBe("image_request");
    const a = evaluateRisk(
      emptyFeatures({ messageCount: 1, suspiciousMessageCount: 1 }),
      [signal({ type: "tipo_inexistente", severity: "low", confidence: 0.5 })],
      [],
    );
    expect(a.categories.some((c) => c.category === "grooming")).toBe(true);
  });
});
