# Contrato de Domínio Compartilhado

> A "linguagem comum" entre todos os repositórios da DIANA. Esta página é a **descrição canônica** do
> contrato; a **implementação TypeScript** vive no módulo `contracts/` de `app-diana-llm-analyzer` e o
> **JSON Schema** é gerado a partir dela. Em caso de divergência, **esta pasta `docs/` prevalece**.

← [Voltar ao índice](README.md)

---

## Por que existe um contrato

Todos os serviços conversam em torno de duas travessias de dados:

```text
Conversation  ──(pipeline + LLM)──▶  AnalysisResult  ──▶  Alerta ao responsável
```

Se todos concordam sobre o formato de `Conversation` e `AnalysisResult`, então **mock e real, LLM e Risk
Engine, backend e frontend** encaixam sem adaptações. Por isso o contrato é a **única dependência comum**
a todos os repositórios (ver o grafo em [`01-repositorios.md`](01-repositorios.md#grafo-de-dependências)).

A origem já validada está no protótipo: `app-diana-monitoring-lading-page/src/ml/types.ts`. O MVP porta
esses tipos para `contracts/`.

---

## Entrada: `Conversation`

O que a captura produz e a pipeline/LLM consomem (idêntico para mock e Telegram):

```ts
type MessageAuthor = "child" | "other";

interface ConversationMessage {
  id: string;            // ex.: "MSG-1291"
  author: MessageAuthor;
  text: string;
  timestamp: string;     // ISO 8601
}

interface Conversation {
  id: string;            // ex.: "CONV-019"
  childId: string;
  childName: string;
  contactId: string;
  contactName: string;
  messages: ConversationMessage[];
  startedAt: string;
}
```

---

## Fronteira de troca: `RiskAnalyzer`

O ponto único onde o mock vira modelo real (ver [`04-llm-inteligencia.md`](04-llm-inteligencia.md)):

```ts
interface RiskAnalyzer {
  analyzeConversation(conversation: Conversation): Promise<AnalysisResult>;
}
```

Implementações: `MockRiskAnalyzer` (protótipo) · `OciGenAiRiskAnalyzer` (MVP) · modelo self-hosted (futuro).

---

## Saída: `AnalysisResult`

O que a pipeline entrega e o guardião consome (nunca a conversa integral):

```ts
type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
type RiskPriority = "low" | "medium" | "high";
type RiskCategory =
  | "grooming" | "image_request" | "cyberbullying" | "blackmail" | "threat"
  | "personal_information" | "isolation" | "sexual_content"
  | "emotional_distress" | "self_harm";

interface DetectedSignal {
  id: string;
  type: string;          // ex.: "secrecy_request" (taxonomia — ver doc 04)
  confidence: number;    // 0–1
  messageIds: string[];
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface RiskPrediction { category: RiskCategory; probability: number; level: RiskLevel; }

interface RiskAssessment {
  level: RiskLevel;
  priority: RiskPriority;
  categories: RiskPrediction[];
  requiresGuardianAttention: boolean;
  rationale: string;
  score: number;         // 0–100 (indicador técnico)
}

interface ContextualFactor {
  type: "content" | "sequence" | "frequency" | "escalation" | "combination";
  label: string;
  description: string;
  contribution: "low" | "medium" | "high";
}

interface ExplanationResult {
  summary: string;
  topSignals: DetectedSignal[];
  contextualFactors: ContextualFactor[];
  recommendedActions: string[];
}

interface ModelMetadata {
  modelName: string;
  version: string;
  environment: "mock" | "development" | "production";
}

interface AuditEntry { timestamp: string; stage: string; description: string; }

interface AnalysisResult {
  conversationId: string;
  assessment: RiskAssessment;
  signals: DetectedSignal[];
  explanation: ExplanationResult;
  features: unknown;        // ConversationFeatures (detalhado no protótipo)
  model: ModelMetadata;
  privacy: unknown;         // PrivacyReport
  audit: AuditEntry[];
  processedAt: string;
}
```

> O tipo completo (incl. `ConversationFeatures`, `PrivacyReport`, `PiiFinding`, `PipelineStage`) está em
> `src/ml/types.ts` do protótipo e será portado integralmente para `contracts/`.

---

## Divisão de responsabilidade sobre o contrato

| Parte do contrato | Quem produz | Quem consome |
| --- | --- | --- |
| `Conversation` / `ConversationMessage` | `app-diana-monitoring` (ingestor) | pipeline, LLM |
| `DetectedSignal[]`, `RiskPrediction[]` | `app-diana-llm-analyzer` (LLM) | Risk Engine |
| `RiskAssessment` (score/prioridade) | `app-diana-monitoring` (risk-engine) | guardian |
| `AnalysisResult` (agregado) | pipeline | `app-diana-guardian-api` / `-web` |

---

## Como cada repositório usa o contrato

- **Implementação TS:** módulo `contracts/` em `app-diana-llm-analyzer`, **sem dependências de runtime**
  (nada de SDK da OCI), publicável como `@diana/contracts`.
- **Serviços não-TS:** consomem o **JSON Schema** (gerado do `contracts/` e espelhado aqui em
  `docs/`).
- **Regra:** ninguém importa o *runtime* de `app-diana-llm-analyzer` só para pegar tipos — importa-se o
  contrato. Isso mantém as dependências apontando para o contrato, e o contrato não dependendo de ninguém.

---

← [Índice](README.md)
