/**
 * DIANA — Entry point do núcleo de background.
 *
 * Modos:
 *   node dist/main.js --once   → roda 1 batch e sai (recomendado; OCI Resource
 *                                Scheduler dispara a cada 2h).
 *   node dist/main.js          → daemon: cron interno de BATCH_HOURS (fallback).
 *
 * Por padrão roda em MODO MOCK (INGEST_MODE=mock, ANALYZER_MODE=mock),
 * consumindo os cenários e produzindo `AnalysisResult` ponta a ponta.
 */
import { loadConfig } from "./config/index.js";
import { createLogger } from "./logger.js";
import { createStateStore } from "./state/index.js";
import { createIngestSource } from "./ingestor/index.js";
import { MockRiskAnalyzer } from "./analyzer/MockRiskAnalyzer.js";
import type { RiskAnalyzer } from "./analyzer/RiskAnalyzer.js";
import type { AppConfig } from "./config/index.js";
import { runBatch, type RunBatchDeps } from "./scheduler/runBatch.js";
import { startLoop } from "./scheduler/loop.js";

function createAnalyzer(config: AppConfig): RiskAnalyzer {
  switch (config.analyzerMode) {
    case "mock":
      return new MockRiskAnalyzer();
    case "oci":
      // Bloqueado na validação de config; o OciGenAiRiskAnalyzer nasce em
      // app-diana-llm-analyzer e plugará aqui via ANALYZER_MODE=oci.
      throw new Error("ANALYZER_MODE=oci ainda não disponível. Use ANALYZER_MODE=mock.");
    default:
      return new MockRiskAnalyzer();
  }
}

async function main(): Promise<void> {
  const runOnce = process.argv.includes("--once");

  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info(
    `DIANA monitoring · INGEST_MODE=${config.ingestMode} · ANALYZER_MODE=${config.analyzerMode} · ` +
      `STATE_BACKEND=${config.stateBackend} · batch=${config.batchHours}h · N=${config.windowPartitions}`,
  );

  const store = createStateStore(config);
  const analyzer = createAnalyzer(config);
  const source = createIngestSource({ config, store, logger });

  const deps: RunBatchDeps = { config, source, analyzer, store, logger };

  if (runOnce) {
    const summary = await runBatch(deps);
    logger.info(
      `Resumo: ${summary.conversations} conversa(s), ${summary.alerted} alerta(s), ${summary.discarded} descarte(s).`,
    );
    return;
  }

  const handle = startLoop(deps);
  const shutdown = () => {
    handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // Logger pode não existir se a config falhar; usa console diretamente.
  console.error(
    "Falha fatal no núcleo de monitoramento:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
