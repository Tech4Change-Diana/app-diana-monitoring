/**
 * DIANA — Mock Risk Analyzer (implementação DEFAULT da interface `RiskAnalyzer`).
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/mockAnalyzer.ts`, com as
 * adaptações de porte para o serviço de background:
 *  - sem latência simulada;
 *  - carimbos de tempo em ISO 8601 (`Date`), não `toLocaleTimeString("pt-BR")`;
 *  - a trilha de auditoria cobre apenas as etapas de ANÁLISE; as etapas da
 *    máquina de estados do batch (RECEIVED -> ... -> ALERTED|DISCARDED) são
 *    responsabilidade do orquestrador (`scheduler/runBatch.ts`).
 *
 * ⚠️ MOCK / PROTOTYPE — o restante do sistema depende da interface
 * `RiskAnalyzer`, nunca deste mock diretamente.
 */
import type {
  AnalysisResult,
  AuditEntry,
  Conversation,
  ConversationFeatures,
  DetectedSignal,
  ModelMetadata,
  SignalSeverity,
} from "../contracts/index.js";
import { preprocessConversation } from "../pipeline/preprocess.js";
import { extractFeatures } from "../pipeline/featureExtractor.js";
import { analyzeContext } from "../pipeline/contextualAnalyzer.js";
import { buildExplanation } from "../pipeline/explainability.js";
import { evaluateRisk } from "../risk-engine/index.js";
import {
  CONFIDENCE_FLOOR,
  CONFIDENCE_CEILING,
  CONFIDENCE_STEP,
} from "../risk-engine/thresholds.js";
import type { RiskAnalyzer } from "./RiskAnalyzer.js";

export interface ModelPrediction {
  signals: DetectedSignal[];
  features: ConversationFeatures;
}

interface SignalCatalogEntry {
  title: string;
  description: string;
  severity: SignalSeverity;
}

const SIGNAL_CATALOG: Record<string, SignalCatalogEntry> = {
  secrecy_request: {
    title: "Pedido de segredo",
    description:
      "A outra pessoa pediu que a criança mantivesse a conversa escondida dos responsáveis.",
    severity: "high",
  },
  image_request: {
    title: "Solicitação de imagem",
    description: "Foi identificada uma solicitação para que a criança envie uma foto pessoal.",
    severity: "high",
  },
  isolation_attempt: {
    title: "Tentativa de isolamento",
    description:
      "A conversa contém linguagem que pode desencorajar a criança de conversar com os responsáveis.",
    severity: "high",
  },
  personal_information_request: {
    title: "Solicitação de dados pessoais",
    description: "Perguntas por informações que permitem identificar ou localizar a criança.",
    severity: "medium",
  },
  personal_information_shared: {
    title: "Dados pessoais compartilhados",
    description: "A criança compartilhou informações pessoais na conversa.",
    severity: "low",
  },
  threat: {
    title: "Ameaça",
    description: "Mensagens com tom de intimidação ou ameaça.",
    severity: "medium",
  },
  insult: {
    title: "Insulto / agressão verbal",
    description: "Linguagem depreciativa ou hostil direcionada à criança.",
    severity: "medium",
  },
  blackmail: {
    title: "Chantagem",
    description: "Tentativa de pressionar a criança usando segredos ou informações.",
    severity: "high",
  },
  sexual_language: {
    title: "Linguagem de conotação sexual",
    description: "Conteúdo ou linguagem sexualizada inadequada para a faixa etária.",
    severity: "high",
  },
  emotional_distress: {
    title: "Sinais de sofrimento emocional",
    description: "A criança demonstra desconforto, tristeza ou angústia.",
    severity: "low",
  },
  self_harm: {
    title: "Linguagem de automutilação",
    description: "Menções a automutilação ou desesperança.",
    severity: "high",
  },
};

export const MODEL_METADATA: ModelMetadata = {
  modelName: "DIANA Risk Analyzer",
  version: "v0.1.0",
  environment: "mock",
};

export class MockRiskAnalyzer implements RiskAnalyzer {
  /** Predição do "modelo": sinais + features (sem explicação). */
  predict(conversation: Conversation): ModelPrediction {
    const { features, matches } = extractFeatures(conversation);

    const signals: DetectedSignal[] = Object.entries(SIGNAL_CATALOG)
      .map(([key, entry]) => {
        const messageIds = matches
          .filter((m) => m.signalKeys.includes(key))
          .map((m) => m.messageId);
        if (messageIds.length === 0) return null;

        const confidence = Math.min(
          CONFIDENCE_CEILING,
          CONFIDENCE_FLOOR + CONFIDENCE_STEP * (messageIds.length - 1),
        );

        return {
          id: `sig-${key}`,
          type: key,
          confidence: Math.round(confidence * 100) / 100,
          messageIds,
          title: entry.title,
          description: entry.description,
          severity: entry.severity,
        } satisfies DetectedSignal;
      })
      .filter((s): s is DetectedSignal => s !== null);

    return { signals, features };
  }

  /** Implementação da interface `RiskAnalyzer` — análise completa, sem latência. */
  async analyzeConversation(conversation: Conversation): Promise<AnalysisResult> {
    const { conversation: prepared, privacy, piiFindings } = preprocessConversation(conversation);
    const { features, matches } = extractFeatures(prepared);
    const { signals } = this.predict(prepared);

    const factors = analyzeContext(features, signals);
    const assessment = evaluateRisk(features, signals, factors);
    const explanation = buildExplanation(assessment, signals, factors);

    return {
      conversationId: conversation.id,
      assessment,
      signals,
      explanation,
      features,
      model: MODEL_METADATA,
      privacy,
      audit: buildAnalysisAudit(matches.length, piiFindings.length, assessment.priority),
      processedAt: new Date().toISOString(),
    };
  }
}

/** Trilha das etapas de ANÁLISE (carimbos ISO 8601). */
function buildAnalysisAudit(
  messageCount: number,
  piiCount: number,
  priority: string,
): AuditEntry[] {
  const at = () => new Date().toISOString();
  return [
    { timestamp: at(), stage: "received", description: "Conversa recebida para análise" },
    {
      timestamp: at(),
      stage: "preprocessing",
      description: `Dados preparados${piiCount ? ` · ${piiCount} PII minimizada(s)` : ""}`,
    },
    {
      timestamp: at(),
      stage: "feature_extraction",
      description: `${messageCount} mensagens analisadas`,
    },
    { timestamp: at(), stage: "ml_analysis", description: "Modelo mock avaliou padrões" },
    { timestamp: at(), stage: "context_analysis", description: "Contexto relacionado" },
    { timestamp: at(), stage: "risk_engine", description: `Prioridade: ${priority}` },
    { timestamp: at(), stage: "explainability", description: "Explicação gerada" },
  ];
}
