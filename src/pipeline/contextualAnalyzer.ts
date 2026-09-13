/**
 * DIANA — Análise contextual.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/contextualAnalyzer.ts`.
 *
 * Mensagens isoladas nem sempre bastam. O contexto avalia conteúdo, sequência,
 * frequência, escalada e combinação de sinais. Ver `docs/regras-de-negocio.md` §5.
 */
import type { ContextualFactor, ConversationFeatures, DetectedSignal } from "../contracts/index.js";

/**
 * @param orderedMessageIds ids das mensagens em ordem cronológica — usado para
 *   verificar a ORDEM temporal do fator "sequência" (progressão). Se omitido, o
 *   fator sequência recai na simples co-ocorrência (compatibilidade).
 */
export function analyzeContext(
  features: ConversationFeatures,
  signals: DetectedSignal[],
  orderedMessageIds?: string[],
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

  // Sequência: sigilo/isolamento PRECEDENDO pedidos pessoais/imagem (progressão).
  // §5 define o fator pela ORDEM temporal, não só pela co-ocorrência — por isso
  // comparamos a posição da 1ª ocorrência de cada grupo.
  const secrecyGroup = ["secrecy_request", "isolation_attempt"];
  const personalGroup = ["image_request", "personal_information_request"];
  const hasSecrecy = secrecyGroup.some((t) => distinctTypes.has(t));
  const hasPersonal = personalGroup.some((t) => distinctTypes.has(t));

  if (hasSecrecy && hasPersonal) {
    const secrecyPos = firstPosition(signals, secrecyGroup, orderedMessageIds);
    const personalPos = firstPosition(signals, personalGroup, orderedMessageIds);
    // Sem ordem conhecida (orderedMessageIds ausente), recai na co-ocorrência.
    const precedes = orderedMessageIds === undefined || secrecyPos <= personalPos;
    if (precedes) {
      factors.push({
        type: "sequence",
        label: "Sequência",
        description:
          "Pedidos de sigilo/isolamento precederam solicitações pessoais, um padrão de progressão relevante.",
        contribution: "high",
      });
    }
  }

  return factors;
}

/**
 * Posição (índice em `orderedMessageIds`) da 1ª mensagem que dispara qualquer
 * sinal dos `types`. Retorna `Infinity` se não houver ordem ou ocorrência.
 */
function firstPosition(
  signals: DetectedSignal[],
  types: string[],
  orderedMessageIds?: string[],
): number {
  if (!orderedMessageIds) return Infinity;
  let best = Infinity;
  for (const signal of signals) {
    if (!types.includes(signal.type)) continue;
    for (const messageId of signal.messageIds) {
      const pos = orderedMessageIds.indexOf(messageId);
      if (pos !== -1 && pos < best) best = pos;
    }
  }
  return best;
}
