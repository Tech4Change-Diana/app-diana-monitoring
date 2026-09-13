/**
 * DIANA — Fonte composta (`INGEST_MODE=both`).
 *
 * Concatena o resultado de várias fontes (mesmo tipo `Conversation`).
 * `commit()` é propagado a todas as fontes que o suportam.
 */
import type { Conversation } from "../contracts/index.js";
import type { IngestSource } from "./index.js";

export class CompositeSource implements IngestSource {
  constructor(private readonly sources: IngestSource[]) {}

  async collect(now: Date): Promise<Conversation[]> {
    const batches = await Promise.all(this.sources.map((s) => s.collect(now)));
    return batches.flat();
  }

  async commit(): Promise<void> {
    await Promise.all(this.sources.map((s) => s.commit?.()));
  }
}
