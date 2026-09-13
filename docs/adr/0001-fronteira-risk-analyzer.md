# ADR 0001 — Corte da fronteira `RiskAnalyzer` (analyzer × núcleo)

- **Status:** aceito (MVP / Fase 1)
- **Data:** 2026-09-13
- **Contexto:** primeira entrega do núcleo de background (`app-diana-monitoring`).
- **Relacionados:** [`docs/contracts.md`](../contracts.md), [`docs/regras-de-negocio.md`](../regras-de-negocio.md)
  (P2), [`docs/analise-tecnica-fase1.md`](../analise-tecnica-fase1.md) §4.1 e §11.

## Problema

A documentação tem uma tensão conhecida sobre o **corte exato** da interface `RiskAnalyzer`:

- [`docs/contracts.md`](../contracts.md) define a fronteira **congelada** como
  `analyzeConversation(conversation): Promise<AnalysisResult>` — o analyzer devolve o `AnalysisResult`
  **inteiro**.
- A **divisão de responsabilidade** do mesmo documento e o princípio **P2**
  ([`regras-de-negocio.md`](../regras-de-negocio.md)) dizem que a **LLM interpreta** (sinais, categorias,
  confiança) e o **Risk Engine consolida** (score/prioridade, determinístico) — o que sugeriria uma
  interface mais estreita (analyzer devolve apenas `signals`/`features`, o núcleo consolida).

A análise técnica (§4.1, §11) pede explicitamente que a **sessão de Desenvolvimento** decida e registre
como ADR.

## Decisão

Para o MVP mantemos a **assinatura canônica de `contracts.md`**:

```ts
interface RiskAnalyzer {
  analyzeConversation(conversation: Conversation): Promise<AnalysisResult>;
}
```

E honramos P2 pela **arquitetura de módulos**, não pela assinatura:

1. O **Risk Engine** (`src/risk-engine/`) e a **explicabilidade** (`src/pipeline/explainability.ts`) são
   módulos **separados e determinísticos**. O `MockRiskAnalyzer` os invoca internamente — detecção
   (interpretação) e consolidação continuam sendo responsabilidades distintas no código.
2. O **orquestrador do pipeline** (`src/pipeline/index.ts`) é a **autoridade** sobre as preocupações de
   batch que não pertencem ao analyzer:
   - a **trilha de auditoria** da máquina de estados (`RECEIVED → … → ALERTED|DISCARDED`);
   - o **`PrivacyReport`** do batch (normalização/pseudonimização acontecem uma vez, antes da análise).
   O orquestrador **sobrescreve** `result.privacy` e `result.audit` com os valores do batch.
3. A troca por `OciGenAiRiskAnalyzer` (repo `app-diana-llm-analyzer`, futuro) é **uma linha de composição**
   em `main.ts`, selecionada por `ANALYZER_MODE` — sem mudança no resto do núcleo.

## Consequências

- **Prós:** contrato canônico preservado; troca mock→real trivial; separação interpretação/consolidação
  presente no código; sem duplicidade de auditoria/privacidade (o orquestrador tem a palavra final).
- **Contras / dívida:** a interface ainda devolve o `AnalysisResult` inteiro. Quando o analyzer real morar
  em outro repositório, ele não poderá invocar o Risk Engine do núcleo. Nesse momento reavaliaremos o corte
  recomendado por §4.1 — **analyzer devolve `signals` + `categories` + `confidence`; o núcleo consolida** —
  em um novo ADR. O `OciGenAiRiskAnalyzer` do MVP pode, no limite, embutir sua própria consolidação ou
  depender de um pacote `@diana/contracts` + risk-engine compartilhado.

## Alternativa considerada (adiada)

Estreitar já agora a interface para `analyze(conversation): Promise<{ signals, features }>` e mover a
consolidação para o orquestrador. Rejeitada para o MVP por divergir da assinatura **congelada** em
`contracts.md`; fica registrada como a evolução provável.
