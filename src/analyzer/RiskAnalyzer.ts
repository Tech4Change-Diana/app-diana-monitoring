/**
 * DIANA — Fronteira de troca `RiskAnalyzer`.
 *
 * Este é o ponto único onde o mock vira modelo real. O núcleo depende **apenas**
 * desta interface; trocar `MockRiskAnalyzer` por `OciGenAiRiskAnalyzer`
 * (repo `app-diana-llm-analyzer`, futuro) é uma linha de composição em `main.ts`.
 *
 * A assinatura segue o contrato canônico (`docs/contracts.md`): recebe uma
 * `Conversation` e devolve um `AnalysisResult`. A decisão sobre o corte exato
 * da interface (o analyzer interpreta / o núcleo consolida) está registrada em
 * `docs/adr/0001-fronteira-risk-analyzer.md`.
 */
import type { AnalysisResult, Conversation } from "../contracts/index.js";

export interface RiskAnalyzer {
  analyzeConversation(conversation: Conversation): Promise<AnalysisResult>;
}
