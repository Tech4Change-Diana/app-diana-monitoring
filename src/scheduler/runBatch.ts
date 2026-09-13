/**
 * DIANA — Um ciclo de batch completo.
 *
 * Coleta as conversas da fonte, roda o pipeline (máquina de estados) em cada
 * uma, persiste alertas (quando ALERTED) e checkpoints por conversa e, ao final,
 * confirma o checkpoint da fonte (offset do Telegram). Ver
 * `docs/regras-de-negocio.md` §10 e `docs/analise-tecnica-fase1.md` §6.
 */
import type { AppConfig } from "../config/index.js";
import type { IngestSource } from "../ingestor/index.js";
import type { RiskAnalyzer } from "../analyzer/RiskAnalyzer.js";
import type { StateStore, Checkpoint, AlertRecord } from "../state/index.js";
import type { Logger } from "../logger.js";
import { runPipeline } from "../pipeline/index.js";

export interface RunBatchDeps {
  config: AppConfig;
  source: IngestSource;
  analyzer: RiskAnalyzer;
  store: StateStore;
  logger: Logger;
}

export interface BatchSummary {
  conversations: number;
  alerted: number;
  discarded: number;
  startedAt: string;
  finishedAt: string;
}

export async function runBatch(deps: RunBatchDeps, now: Date = new Date()): Promise<BatchSummary> {
  const { config, source, analyzer, store, logger } = deps;
  const startedAt = new Date().toISOString();

  const conversations = await source.collect(now);
  logger.info(`Batch iniciado: ${conversations.length} conversa(s) coletada(s)`);

  let alerted = 0;
  let discarded = 0;

  for (const conversation of conversations) {
    const { result, finalState } = await runPipeline(
      conversation,
      { analyzer },
      {
        now,
        batchHours: config.batchHours,
        windowPartitions: config.windowPartitions,
      },
    );

    if (finalState === "ALERTED") {
      alerted += 1;
      const alert: AlertRecord = {
        conversationId: result.conversationId,
        processedAt: result.processedAt,
        result,
      };
      await store.putAlert(alert);
      logger.info(
        `ALERTA · ${conversation.id} · score ${result.assessment.score} · ${result.assessment.priority} · ${result.assessment.level}`,
      );
    } else {
      discarded += 1;
      logger.debug(`Descartado · ${conversation.id} · score ${result.assessment.score}`);
    }

    await store.putCheckpoint(buildCheckpoint(conversation));
  }

  // Confirma o checkpoint da fonte (ex.: offset do Telegram) só após concluir.
  await source.commit?.();

  const summary: BatchSummary = {
    conversations: conversations.length,
    alerted,
    discarded,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  logger.info(`Batch concluído: ${alerted} alerta(s), ${discarded} descarte(s)`);
  return summary;
}

function buildCheckpoint(conversation: {
  id: string;
  messages: { id: string; timestamp: string }[];
  startedAt: string;
}): Checkpoint {
  const messages = conversation.messages;
  const last = messages[messages.length - 1];
  const first = messages[0];
  return {
    conversation_id: conversation.id,
    last_message_id: last?.id ?? "",
    period_start: first?.timestamp ?? conversation.startedAt,
    period_end: last?.timestamp ?? conversation.startedAt,
    message_count: messages.length,
    status: "done",
  };
}
