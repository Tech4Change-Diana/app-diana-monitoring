/**
 * DIANA — Daemon opcional (fallback ao OCI Resource Scheduler).
 *
 * Executa `runBatch` a cada `BATCH_HOURS` horas via timer interno. É o caminho
 * de FALLBACK (§6.4 da análise): o modo recomendado no MVP é `--once` disparado
 * pelo Resource Scheduler. Útil se preferível a manter um container ocioso ou se
 * o modo daemon do ingestor for adotado no futuro.
 */
import type { RunBatchDeps } from "./runBatch.js";
import { runBatch } from "./runBatch.js";

const HOUR_MS = 60 * 60 * 1000;

export interface LoopHandle {
  stop(): void;
}

export function startLoop(deps: RunBatchDeps): LoopHandle {
  const intervalMs = deps.config.batchHours * HOUR_MS;
  let running = false;

  const tick = async () => {
    if (running) {
      deps.logger.warn("Batch anterior ainda em execução; pulando este disparo.");
      return;
    }
    running = true;
    try {
      await runBatch(deps);
    } catch (err) {
      deps.logger.error("Falha no batch (loop)", err);
    } finally {
      running = false;
    }
  };

  deps.logger.info(`Daemon iniciado: batch a cada ${deps.config.batchHours}h`);
  // Primeiro disparo imediato, depois a cada intervalo.
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);

  return {
    stop() {
      clearInterval(timer);
      deps.logger.info("Daemon parado.");
    },
  };
}
