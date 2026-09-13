import { describe, it, expect } from "vitest";
import { analyzeContext } from "../src/pipeline/contextualAnalyzer.js";
import type { ConversationFeatures, DetectedSignal } from "../src/contracts/index.js";

const features = (over: Partial<ConversationFeatures> = {}): ConversationFeatures => ({
  secrecyRequests: 1,
  imageRequests: 1,
  personalInfoRequests: 0,
  isolationAttempts: 0,
  threats: 0,
  insults: 0,
  blackmailAttempts: 0,
  sexualContentSignals: 0,
  emotionalDistressSignals: 0,
  selfHarmSignals: 0,
  messageCount: 4,
  suspiciousMessageCount: 2,
  conversationEscalation: 0,
  ...over,
});

const sig = (type: string, messageId: string): DetectedSignal => ({
  id: `sig-${type}`,
  type,
  confidence: 0.7,
  messageIds: [messageId],
  title: type,
  description: "",
  severity: "high",
});

const order = ["m0", "m1", "m2", "m3"];

describe("analyzeContext — fator sequência verifica ordem temporal (regressão do achado D)", () => {
  it("ativa quando sigilo PRECEDE o pedido pessoal", () => {
    const signals = [sig("secrecy_request", "m1"), sig("image_request", "m3")];
    const factors = analyzeContext(features(), signals, order);
    expect(factors.some((f) => f.type === "sequence")).toBe(true);
  });

  it("NÃO ativa quando o pedido pessoal vem ANTES do sigilo", () => {
    const signals = [sig("image_request", "m1"), sig("secrecy_request", "m3")];
    const factors = analyzeContext(features(), signals, order);
    expect(factors.some((f) => f.type === "sequence")).toBe(false);
  });

  it("sem ordem conhecida, recai na co-ocorrência (compatibilidade)", () => {
    const signals = [sig("image_request", "m1"), sig("secrecy_request", "m3")];
    const factors = analyzeContext(features(), signals);
    expect(factors.some((f) => f.type === "sequence")).toBe(true);
  });
});
