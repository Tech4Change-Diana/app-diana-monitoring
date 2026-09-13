/**
 * Contrato de domínio compartilhado da DIANA.
 *
 * Ponto único de importação dos tipos canônicos (`Conversation`,
 * `AnalysisResult`, ...). Enquanto `@diana/contracts` não existe, o resto do
 * serviço importa daqui: `import type { Conversation } from "../contracts";`.
 */
export * from "./types.js";
