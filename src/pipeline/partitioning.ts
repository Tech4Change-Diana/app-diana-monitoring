/**
 * DIANA — Particionamento temporal e reconstrução da janela.
 *
 * A cada disparo, o serviço recupera as últimas N partições (~6h) e as
 * reconstrói cronologicamente. `BATCH` e `N` são configuráveis, então a janela
 * cresce sem mudança estrutural. Ver `docs/regras-de-negocio.md` §10 e
 * `docs/analise-tecnica-fase1.md` §6.1.
 */
import type { ConversationMessage } from "../contracts/index.js";

export interface Partition {
  /** 0 = partição mais recente. */
  index: number;
  /** Início do intervalo (ISO 8601, inclusivo). */
  start: string;
  /** Fim do intervalo (ISO 8601, exclusivo). */
  end: string;
  messages: ConversationMessage[];
}

const HOUR_MS = 60 * 60 * 1000;

function tsMs(message: ConversationMessage): number {
  return new Date(message.timestamp).getTime();
}

/**
 * Particiona as mensagens em N janelas de `batchHours` horas terminando em
 * `now`. A partição 0 cobre `[now - batchHours, now)`, a 1 o batch anterior, etc.
 * Mensagens fora da janela `N × batchHours` são descartadas. Retorna as
 * partições da mais recente para a mais antiga.
 */
export function partitionMessages(
  messages: ConversationMessage[],
  now: Date,
  batchHours: number,
  partitions: number,
): Partition[] {
  const batchMs = batchHours * HOUR_MS;
  const nowMs = now.getTime();

  const buckets: Partition[] = [];
  for (let i = 0; i < partitions; i += 1) {
    const end = nowMs - i * batchMs;
    const start = end - batchMs;
    buckets.push({
      index: i,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      messages: [],
    });
  }

  const windowStartMs = nowMs - partitions * batchMs;
  for (const message of messages) {
    const t = tsMs(message);
    if (Number.isNaN(t)) continue;
    if (t < windowStartMs || t >= nowMs) continue;
    const offset = Math.floor((nowMs - t) / batchMs);
    const bucket = buckets[offset];
    if (bucket) bucket.messages.push(message);
  }

  return buckets;
}

/**
 * Recupera as últimas N partições e reconstrói a janela em ordem cronológica
 * (asc por timestamp). Passos 7 (recuperação) e 10 (reconstrução) do pipeline.
 */
export function reconstructWindow(partitions: Partition[]): ConversationMessage[] {
  return partitions
    .flatMap((p) => p.messages)
    .slice()
    .sort((a, b) => tsMs(a) - tsMs(b));
}
