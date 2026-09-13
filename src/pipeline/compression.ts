/**
 * DIANA — Compactação (PLACEHOLDER de MVP).
 *
 * Ordem do pipeline (congelada): normaliza -> COMPACTA -> particiona ->
 * criptografa (ver `docs/regras-de-negocio.md` §9). No MVP a compactação é a
 * identidade (no-op explícito), sinalizada para não dar falsa sensação de
 * proteção/otimização. Substituível por gzip leve sem mudança de contrato.
 */
import type { ConversationMessage } from "../contracts/index.js";

/** Bloco compactado (placeholder: mantém as mensagens em memória). */
export interface CompressedBlock {
  algorithm: "identity";
  messages: ConversationMessage[];
}

export function compress(messages: ConversationMessage[]): CompressedBlock {
  return { algorithm: "identity", messages };
}

export function decompress(block: CompressedBlock): ConversationMessage[] {
  return block.messages;
}
