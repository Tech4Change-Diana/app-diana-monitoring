/**
 * DIANA — Máquina de estados da análise (batch).
 *
 * RECEIVED → NORMALIZING → COMPRESSED → PARTITIONED → ENCRYPTED → PUBLISHED
 *   → CONTEXT_BUILDING → ANALYZING → RISK_EVALUATION → (ALERTED | DISCARDED)
 *
 * Cada transição adiciona um `AuditEntry` à trilha (RF-14). Ver
 * `docs/regras-de-negocio.md` §10 e `docs/analise-tecnica-fase1.md` §6.3.
 */
import type { AuditEntry } from "../contracts/index.js";

export type AnalysisState =
  | "RECEIVED"
  | "NORMALIZING"
  | "COMPRESSED"
  | "PARTITIONED"
  | "ENCRYPTED"
  | "PUBLISHED"
  | "CONTEXT_BUILDING"
  | "ANALYZING"
  | "RISK_EVALUATION"
  | "ALERTED"
  | "DISCARDED";

export type TerminalState = "ALERTED" | "DISCARDED";

/** Acumula a trilha de auditoria da máquina de estados (carimbos ISO 8601). */
export class AuditTrail {
  private readonly entries: AuditEntry[] = [];

  record(state: AnalysisState, description: string): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      stage: state,
      description,
    });
  }

  toArray(): AuditEntry[] {
    return [...this.entries];
  }
}
