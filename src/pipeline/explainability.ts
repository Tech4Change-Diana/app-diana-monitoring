/**
 * DIANA — Explainability Engine.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/explainability.ts`.
 *
 * Converte o resultado do Risk Engine em uma explicação legível para o
 * responsável: resumo, sinais de maior relevância, fatores contextuais e ações
 * recomendadas. Ver `docs/regras-de-negocio.md` §7.
 */
import type {
  ContextualFactor,
  DetectedSignal,
  ExplanationResult,
  RiskAssessment,
} from "../contracts/index.js";
import { riskCategoryLabels } from "../contracts/index.js";

export function buildExplanation(
  assessment: RiskAssessment,
  signals: DetectedSignal[],
  factors: ContextualFactor[],
): ExplanationResult {
  const sorted = [...signals].sort(
    (a, b) => b.severity.localeCompare(a.severity) || b.confidence - a.confidence,
  );

  const topSignals = sorted.slice(0, 3);

  const topCategory = assessment.categories[0];

  let summary: string;
  if (signals.length === 0) {
    summary = "A análise desta conversa não identificou sinais relevantes de risco.";
  } else {
    const categoryPhrase = topCategory
      ? riskCategoryLabels[topCategory.category].toLowerCase()
      : "um padrão potencialmente preocupante";
    summary = `A DIANA identificou ${signals.length} padrões na conversa que podem indicar ${categoryPhrase}.`;
    if (assessment.level === "high" || assessment.level === "critical") {
      summary += " A conversa apresenta um padrão de escalada de sinais ao longo do tempo.";
    }
  }

  const recommendedActions = buildRecommendedActions(assessment);

  return {
    summary,
    topSignals,
    contextualFactors: factors,
    recommendedActions,
  };
}

function buildRecommendedActions(assessment: RiskAssessment): string[] {
  const actions = [
    "Converse com a criança com calma, sem culpá-la ou assustá-la.",
    "Procure entender o contexto: o alerta é um ponto de partida para uma conversa.",
    "Avalie a situação considerando o histórico e o contexto da interação.",
  ];

  if (assessment.level === "high" || assessment.level === "critical") {
    actions.push(
      "Tome medidas de proteção quando necessário — bloqueio, denúncia ou busca de ajuda especializada.",
    );
  } else {
    actions.push(
      "Fique atento a novas conversas e, se necessário, ajuste as configurações de proteção.",
    );
  }

  return actions;
}
