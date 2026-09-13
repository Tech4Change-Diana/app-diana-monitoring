/**
 * DIANA — Criptografia (PLACEHOLDER de MVP).
 *
 * No MVP é um no-op explícito (campo "protegido" em memória). O hardening real
 * (OCI Vault/KMS) é Fase 2 — ver `docs/regras-de-negocio.md` §9 e
 * `docs/analise-tecnica-fase1.md` §6.2. O placeholder é assinalado para não dar
 * falsa sensação de proteção.
 *
 * Princípio congelado (plaintext efêmero): o conteúdo bruto só existe em texto
 * aberto em memória durante a análise e é descartado depois; nada persiste a
 * conversa em claro.
 */
import type { CompressedBlock } from "./compression.js";

/** Envelope "criptografado" (placeholder: no-op, marcado como protegido). */
export interface EncryptedEnvelope {
  scheme: "noop";
  protected: true;
  payload: CompressedBlock;
}

export function encrypt(block: CompressedBlock): EncryptedEnvelope {
  return { scheme: "noop", protected: true, payload: block };
}

export function decrypt(envelope: EncryptedEnvelope): CompressedBlock {
  return envelope.payload;
}
