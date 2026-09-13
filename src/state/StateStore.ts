/**
 * DIANA — Interface de persistência mínima.
 *
 * Estado = arquivos JSON (sem DB gerenciado no MVP). Dois adaptadores:
 *  - `FileStateStore` (JSON em disco) para dev/CI/local;
 *  - `OciObjectStorageStore` (OCI Object Storage) para produção — próximo PR.
 * Selecionado por `STATE_BACKEND`. Ver `docs/analise-tecnica-fase1.md` §8.
 */
import type { AlertRecord, Checkpoint, TelegramOffset } from "./checkpoint.js";

export interface StateStore {
  /** Checkpoint por conversa. */
  getCheckpoint(conversationId: string): Promise<Checkpoint | null>;
  putCheckpoint(checkpoint: Checkpoint): Promise<void>;

  /** Offset global do long-polling do Telegram. */
  getTelegramOffset(): Promise<TelegramOffset | null>;
  putTelegramOffset(offset: TelegramOffset): Promise<void>;

  /** Registro de alerta (AnalysisResult agregado). */
  putAlert(alert: AlertRecord): Promise<void>;
}
