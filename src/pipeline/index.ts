/**
 * DIANA — Pipeline orquestrador (uma conversa, ponta a ponta).
 *
 * Percorre a máquina de estados do batch sobre UMA conversa, aplicando as 12
 * etapas do doc 02 (captura fica no ingestor; aqui começa em RECEIVED):
 *
 *   normaliza → compacta → particiona → (cripto) → publica →
 *   recupera N → (descripto) → (descompacta) → reconstrói (~6h) →
 *   analisa (RiskAnalyzer) → risk-engine → ALERTED|DISCARDED
 *
 * Placeholders de MVP: compactação/criptografia são no-op assinalados; as
 * partições vivem em memória entre as etapas de um mesmo batch (§8 do doc de
 * análise). Plaintext efêmero: o conteúdo bruto só existe em memória durante a
 * análise e é descartado depois.
 *
 * O orquestrador é a AUTORIDADE sobre a trilha de auditoria (máquina de estados)
 * e sobre o `PrivacyReport` do batch; o `RiskAnalyzer` fornece
 * sinais/assessment/explicação/features. Ver `docs/adr/0001-fronteira-risk-analyzer.md`.
 */
import type { AnalysisResult, Conversation } from "../contracts/index.js";
import type { RiskAnalyzer } from "../analyzer/RiskAnalyzer.js";
import { detectPii } from "./preprocess.js";
import { compress, decompress, type CompressedBlock } from "./compression.js";
import { encrypt, decrypt, type EncryptedEnvelope } from "./crypto.js";
import { partitionMessages, reconstructWindow } from "./partitioning.js";
import { AuditTrail, type TerminalState } from "./stateMachine.js";

export interface PipelineDeps {
  analyzer: RiskAnalyzer;
}

export interface PipelineOptions {
  now?: Date;
  batchHours: number;
  windowPartitions: number;
}

export interface PipelineOutcome {
  result: AnalysisResult;
  finalState: TerminalState;
}

interface ProtectedPartition {
  index: number;
  start: string;
  end: string;
  envelope: EncryptedEnvelope;
}

export async function runPipeline(
  conversation: Conversation,
  deps: PipelineDeps,
  options: PipelineOptions,
): Promise<PipelineOutcome> {
  const now = options.now ?? new Date();
  const audit = new AuditTrail();

  // 1 · RECEIVED
  audit.record(
    "RECEIVED",
    `Conversa ${conversation.id} recebida (${conversation.messages.length} mensagens)`,
  );

  // 2 · NORMALIZING — detecção de PII (privacy autoritativo do batch). NÃO
  // mascara o texto usado na detecção de sinais (§9): a extração roda sobre o
  // texto original em memória; a pseudonimização vale só para o que sai da
  // memória. Ver ADR-0001 e o comentário em `preprocess.ts`.
  const { privacy, piiFindings } = detectPii(conversation);
  audit.record(
    "NORMALIZING",
    piiFindings.length ? `Normalizado · ${piiFindings.length} PII detectada(s)` : "Normalizado",
  );

  // 3 · COMPRESSED (placeholder: identidade). Opera sobre o texto original.
  const compressed: CompressedBlock = compress(conversation.messages);
  audit.record("COMPRESSED", `Compactado (${compressed.algorithm})`);

  // 4 · PARTITIONED (partições temporais P1..Pn — janela N × BATCH).
  const partitions = partitionMessages(
    compressed.messages,
    now,
    options.batchHours,
    options.windowPartitions,
  );
  audit.record(
    "PARTITIONED",
    `${partitions.length} partição(ões) de ${options.batchHours}h (janela ≈ ${options.batchHours * options.windowPartitions}h)`,
  );

  // 5 · ENCRYPTED (placeholder: no-op, marcado como protegido).
  const protectedPartitions: ProtectedPartition[] = partitions.map((p) => ({
    index: p.index,
    start: p.start,
    end: p.end,
    envelope: encrypt({ algorithm: "identity", messages: p.messages }),
  }));
  audit.record(
    "ENCRYPTED",
    `${protectedPartitions.length} partição(ões) protegida(s) (placeholder)`,
  );

  // 6 · PUBLISHED (marca partições prontas para recuperação).
  audit.record("PUBLISHED", "Partições publicadas (prontas para análise)");

  // 7–9 · Recuperação (N), descriptografia, descompressão (em memória).
  const recovered = protectedPartitions
    .slice(0, options.windowPartitions)
    .map((p) => decompress(decrypt(p.envelope)));

  // 10 · CONTEXT_BUILDING — reconstrução cronológica da janela (~6h).
  const windowMessages = reconstructWindow(
    recovered.map((messages, index) => ({
      index,
      start: protectedPartitions[index]?.start ?? now.toISOString(),
      end: protectedPartitions[index]?.end ?? now.toISOString(),
      messages,
    })),
  );
  const reconstructed: Conversation = { ...conversation, messages: windowMessages };
  audit.record("CONTEXT_BUILDING", `Janela reconstruída com ${windowMessages.length} mensagens`);

  // 11 · ANALYZING — interpretação via RiskAnalyzer (mock por padrão).
  const analysis = await deps.analyzer.analyzeConversation(reconstructed);
  audit.record("ANALYZING", `${analysis.signals.length} sinais interpretados`);

  // 12 · RISK_EVALUATION — consolidação já feita pelo risk-engine dentro do analyzer.
  audit.record(
    "RISK_EVALUATION",
    `Score ${analysis.assessment.score} · nível ${analysis.assessment.level} · prioridade ${analysis.assessment.priority}`,
  );

  const finalState: TerminalState = analysis.assessment.requiresGuardianAttention
    ? "ALERTED"
    : "DISCARDED";
  audit.record(
    finalState,
    finalState === "ALERTED"
      ? "Requer atenção do responsável — alerta gerado"
      : "Risco baixo — descartado (conversa não persistida)",
  );

  // O orquestrador tem a palavra final sobre privacy (batch) e audit (máquina de estados).
  const result: AnalysisResult = {
    ...analysis,
    privacy,
    audit: audit.toArray(),
  };

  return { result, finalState };
}
