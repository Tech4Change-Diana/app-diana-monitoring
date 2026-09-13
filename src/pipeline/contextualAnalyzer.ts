/**
 * DIANA — Análise contextual.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/contextualAnalyzer.ts`.
 *
 * Mensagens isoladas nem sempre bastam. O contexto avalia conteúdo, sequência,
 * frequência, escalada e combinação de sinais. Ver `docs/regras-de-negocio.md` §5.
 */
import type { ContextualFactor, ConversationFeatures, DetectedSignal } from "../contracts/index.js";

export function analyzeContext(
  features: ConversationFeatures,
  signals: DetectedSignal[],
): ContextualFactor[] {
  const factors: ContextualFactor[] = [];
  if (signals.length === 0) return factors;

  const hasHigh = signals.some((s) => s.severity === "high");
  const distinctTypes = new Set(signals.map((s) => s.type));
  const signalTitles = Array.from(distinctTypes);

  // Conteúdo
  if (signals.length > 0) {
    factors.push({
      type: "content",
      label: "Conteúdo",
      description: signalTitles.length
        ? `Foram identificados padrões como: ${signalTitles.slice(0, 3).join(", ")}.`
        : "O conteúdo da conversa foi avaliado.",
      contribution: hasHigh ? "high" : "medium",
    });
  }

  // Frequência
  if (features.suspiciousMessageCount >= 2) {
    factors.push({
      type: "frequency",
      label: "Frequência",
      description: `Sinais apareceram em ${features.suspiciousMessageCount} mensagens, indicando recorrência, e não um caso isolado.`,
      contribution: features.suspiciousMessageCount >= 3 ? "high" : "medium",
    });
  }

  // Escalada
  if (features.conversationEscalation > 0.4) {
    factors.push({
      type: "escalation",
      label: "Escalada",
      description: "A conversa passou de um tom normal para um tom potencialmente preocupante.",
      contribution: features.conversationEscalation > 0.6 ? "high" : "medium",
    });
  }

  // Combinação
  if (distinctTypes.size >= 2) {
    factors.push({
      type: "combination",
      label: "Combinação de sinais",
      description: `${distinctTypes.size} tipos de sinais diferentes ocorreram simultaneamente, reforçando o padrão.`,
      contribution: distinctTypes.size >= 3 ? "high" : "medium",
    });
  }

  // Sequência (pedidos de segredo/isolamento antes de pedidos pessoais)
  if (
    (distinctTypes.has("secrecy_request") || distinctTypes.has("isolation_attempt")) &&
    (distinctTypes.has("image_request") || distinctTypes.has("personal_information_request"))
  ) {
    factors.push({
      type: "sequence",
      label: "Sequência",
      description:
        "Pedidos de sigilo/isolamento precederam solicitações pessoais, um padrão de progressão relevante.",
      contribution: "high",
    });
  }

  return factors;
}
