/**
 * DIANA — `StateStore` em disco (JSON), para dev/CI/local.
 *
 * Layout sob `STATE_DIR` (espelha o layout de Object Storage do doc 02):
 *   <dir>/checkpoints/<conversationId>.json
 *   <dir>/telegram/offset.json
 *   <dir>/alerts/<conversationId>/<processedAt>.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StateStore } from "./StateStore.js";
import type { AlertRecord, Checkpoint, TelegramOffset } from "./checkpoint.js";

/** Sanitiza um id para uso seguro como nome de arquivo/pasta. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class FileStateStore implements StateStore {
  constructor(private readonly baseDir: string) {}

  private checkpointPath(conversationId: string): string {
    return path.join(this.baseDir, "checkpoints", `${safeId(conversationId)}.json`);
  }

  private offsetPath(): string {
    return path.join(this.baseDir, "telegram", "offset.json");
  }

  private alertPath(alert: AlertRecord): string {
    return path.join(
      this.baseDir,
      "alerts",
      safeId(alert.conversationId),
      `${safeId(alert.processedAt)}.json`,
    );
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  }

  async getCheckpoint(conversationId: string): Promise<Checkpoint | null> {
    return this.readJson<Checkpoint>(this.checkpointPath(conversationId));
  }

  async putCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.writeJson(this.checkpointPath(checkpoint.conversation_id), checkpoint);
  }

  async getTelegramOffset(): Promise<TelegramOffset | null> {
    return this.readJson<TelegramOffset>(this.offsetPath());
  }

  async putTelegramOffset(offset: TelegramOffset): Promise<void> {
    await this.writeJson(this.offsetPath(), offset);
  }

  async putAlert(alert: AlertRecord): Promise<void> {
    await this.writeJson(this.alertPath(alert), alert);
  }
}
