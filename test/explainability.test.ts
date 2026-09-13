import { describe, it, expect } from "vitest";
import { buildExplanation } from "../src/pipeline/explainability.js";
import type { DetectedSignal, RiskAssessment } from "../src/contracts/index.js";

const signal = (
  id: string,
  severity: DetectedSignal["severity"],
  confidence: number,
): DetectedSignal => ({
  id,
  type: id,
  confidence,
  messageIds: [id],
  title: id,
  description: "",
  severity,
});

const assessment: RiskAssessment = {
  level: "high",
  priority: "high",
  categories: [{ category: "grooming", probability: 0.9, level: "high" }],
  requiresGuardianAttention: true,
  rationale: "",
  score: 60,
};

describe("buildExplanation — ordenação por severidade (regressão do achado B)", () => {
  it("prioriza sinais de severidade alta no top-3, não ordem alfabética", () => {
    const signals = [
      signal("low1", "low", 0.9),
      signal("high1", "high", 0.6),
      signal("medium1", "medium", 0.9),
      signal("high2", "high", 0.7),
    ];
    const { topSignals } = buildExplanation(assessment, signals, []);
    // Os dois high devem liderar (por confiança: high2 antes de high1).
    expect(topSignals.map((s) => s.id)).toEqual(["high2", "high1", "medium1"]);
    expect(topSignals.every((s) => s.severity !== "low")).toBe(true);
  });
});
