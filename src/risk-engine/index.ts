/**
 * DIANA — Risk Engine.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/riskEngine.ts`.
 *
 * Consolida, de forma DETERMINÍSTICA, os sinais detectados, os fatores
 * contextuais e a severidade em um `RiskAssessment` (frequência, sequência,
 * escalada, combinação, severidade, confiança -> score/prioridade).
 * Ver `docs/regras-de-negocio.md` §§5–6 e o princípio P2 (a LLM interpreta,
 * o Risk Engine consolida).
 *
 * ⚠️ MOCK / PROTOTYPE — o cálculo de pontuação é uma heurística de demonstração
 * e NÃO é apresentado como fórmula cientificamente validada.
 */
import type {
  ContextualFactor,
  ConversationFeatures,
  DetectedSignal,
  RiskAssessment,
  RiskCategory,
  RiskLevel,
  RiskPrediction,
  RiskPriority,
} from "../contracts/index.js";
import {
  RISK_LEVEL_THRESHOLDS,
  SEVERITY_WEIGHTS,
  SCORE_FACTOR_PER_SIGNAL,
  ESCALATION_WEIGHT,
  COMBINATION_WEIGHT,
  FREQUENCY_WEIGHT,
  MOCK_CALIBRATION,
} from "./thresholds.js";

/** Mapeamento sinal -> categoria (conhecimento do modelo, mock). */
export const SIGNAL_CATEGORY: Record<string, RiskCategory> = {
  secrecy_request: "grooming",
  image_request: "image_request",
  isolation_attempt: "grooming",
  personal_information_request: "personal_information",
  personal_information_shared: "personal_information",
  threat: "threat",
  insult: "cyberbullying",
  blackmail: "blackmail",
  sexual_language: "sexual_content",
  emotional_distress: "emotional_distress",
  self_harm: "self_harm",
};

export const CATEGORY_ORDER: RiskCategory[] = [
  "grooming",
  "image_request",
  "cyberbullying",
  "blackmail",
  "threat",
  "personal_information",
  "isolation",
  "sexual_content",
  "emotional_distress",
  "self_harm",
];

export function levelFromScore(score: number): RiskLevel {
  if (score < RISK_LEVEL_THRESHOLDS.low) return "none";
  if (score < RISK_LEVEL_THRESHOLDS.medium) return "low";
  if (score < RISK_LEVEL_THRESHOLDS.high) return "medium";
  if (score < RISK_LEVEL_THRESHOLDS.critical) return "high";
  return "critical";
}

export function evaluateRisk(
  features: ConversationFeatures,
  signals: DetectedSignal[],
  factors: ContextualFactor[],
): RiskAssessment {
  // Pontuação por categoria.
  const categoryScores = new Map<RiskCategory, number>();
  CATEGORY_ORDER.forEach((c) => categoryScores.set(c, 0));

  for (const signal of signals) {
    const category = SIGNAL_CATEGORY[signal.type] ?? "grooming";
    const weight = SEVERITY_WEIGHTS[signal.severity];
    const contribution = weight * signal.confidence + (MOCK_CALIBRATION[signal.type] ?? 0);
    categoryScores.set(category, (categoryScores.get(category) ?? 0) + contribution);
  }

  // Score técnico geral (0–100).
  let score = signals.reduce(
    (acc, s) => acc + SEVERITY_WEIGHTS[s.severity] * s.confidence * SCORE_FACTOR_PER_SIGNAL,
    0,
  );
  score += features.conversationEscalation * ESCALATION_WEIGHT;
  if (factors.some((f) => f.type === "combination")) score += COMBINATION_WEIGHT;
  if (features.suspiciousMessageCount >= 2) score += FREQUENCY_WEIGHT;
  score = Math.round(Math.min(100, Math.max(0, score)));

  const level = levelFromScore(score);

  const priority: RiskPriority =
    level === "high" || level === "critical" ? "high" : level === "medium" ? "medium" : "low";

  const maxCategoryScore = Math.max(...Array.from(categoryScores.values()), 0.01);

  const categories: RiskPrediction[] = CATEGORY_ORDER.map((category) => {
    const raw = categoryScores.get(category) ?? 0;
    return {
      category,
      probability: raw <= 0 ? 0 : Math.min(0.95, Math.max(0.12, (raw / maxCategoryScore) * 0.9)),
      level: levelFromScore(raw * 12),
    };
  })
    .filter((p) => p.probability > 0)
    .sort((a, b) => b.probability - a.probability);

  const requiresGuardianAttention =
    level === "medium" ||
    level === "high" ||
    level === "critical" ||
    signals.some((s) => s.severity === "high");

  const distinctTypes = Array.from(new Set(signals.map((s) => s.title.toLowerCase()))).slice(0, 3);
  const rationale =
    signals.length === 0
      ? "Nenhum sinal relevante identificado nesta conversa."
      : `Foram identificados ${signals.length} sinais relevantes (${distinctTypes.join(", ")}), ` +
        `com escalada de ${Math.round(features.conversationEscalation * 100)}% na conversa. ` +
        "Valores técnicos simulados (MOCK).";

  return {
    level,
    priority,
    categories,
    requiresGuardianAttention,
    rationale,
    score,
  };
}
