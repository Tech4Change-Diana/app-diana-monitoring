/**
 * DIANA — Tipos de checkpoint e alerta persistidos pelo `StateStore`.
 *
 * Dois níveis de checkpoint (ver `docs/analise-tecnica-fase1.md` §5.3):
 *  1. offset do Telegram (por bot): `last_update_id` — a próxima chamada usa
 *     `offset = last_update_id + 1` (RF-02).
 *  2. checkpoint por conversa: `last_message_id` + janela processada.
 */
import type { AnalysisResult } from "../contracts/index.js";

/** Checkpoint por conversa (contrato do doc 02). */
export interface Checkpoint {
  conversation_id: string;
  last_message_id: string;
  /** ISO 8601. */
  period_start: string;
  /** ISO 8601. */
  period_end: string;
  message_count: number;
  status: "ready" | "processing" | "done";
}

/** Offset global do long-polling do Telegram (por bot). */
export interface TelegramOffset {
  last_update_id: number;
}

/**
 * Alerta persistido para consumo pelo futuro `app-diana-guardian-api`.
 * Nunca contém a conversa integral (RF-16 / privacy by design): apenas o
 * `AnalysisResult` agregado.
 */
export interface AlertRecord {
  conversationId: string;
  /** ISO 8601. */
  processedAt: string;
  result: AnalysisResult;
}
