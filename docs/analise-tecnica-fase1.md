# Análise Técnica — Fase 1: Núcleo de Background

> **Documento de planejamento** para a primeira tarefa do MVP: transformar o protótipo *mock* (que vive em
> `app-diana-monitoring-lading-page/src/ml/` e `src/data/`) no **núcleo de background** deste repositório
> (`app-diana-monitoring`) = **ingestor do Telegram + pipeline + risk-engine**.
>
> **Escopo desta entrega:** apenas o PLANO técnico. O código do serviço é executado pela sessão de
> **Desenvolvimento**, seguindo o [checklist de PRs](#10-checklist-de-implementação-prs-ordenados) no fim
> deste documento.

← [Voltar ao índice](README.md) · Base: [`01`](01-repositorios.md), [`02`](02-pipeline-background.md), [`03`](03-telegram-captura.md), [`04`](04-llm-inteligencia.md), [`06`](06-mapeamento-oci.md), [`contracts.md`](contracts.md)

---

## 1. Objetivo e princípios de porte

A Fase 1 **porta** os módulos já validados do protótipo para um **serviço de background Node + TypeScript**
que roda em uma única **OCI Container Instance**, acionado por um **agendamento de 2h**. Os princípios que
guiam o porte:

1. **Portar, não reescrever.** Os módulos `src/ml/*` do protótipo são, na sua maioria, **puros e agnósticos
   de framework** (sem React, sem DOM). Eles migram quase intactos. Só trocamos **a fonte de dados** (React
   demo → mock/Telegram) e **o orquestrador** (loop de demonstração com latência → pipeline de batch).
2. **Contrato congelado.** `Conversation` → `AnalysisResult` é a única linguagem comum. Mock e real produzem
   o mesmo tipo; a jusante nada muda. Ver [`contracts.md`](contracts.md).
3. **`RiskAnalyzer` como fronteira de troca.** O núcleo depende **apenas da interface**. O `MockRiskAnalyzer`
   permanece como implementação **default** até `app-diana-llm-analyzer` existir; trocá-lo por
   `OciGenAiRiskAnalyzer` não altera o resto do sistema.
4. **Mock-first.** A fonte padrão é mock (`INGEST_MODE=mock`); o Telegram é a exceção ocasional.
5. **Simplicidade deliberada.** Sem DB, sem broker, sem KMS completo, sem auth no MVP — apenas Object Storage
   (JSON) para checkpoint e alertas, e cripto/compressão/particionamento como **placeholder**. Ver [`06`](06-mapeamento-oci.md).

> **Nota sobre o protótipo.** O código-fonte a portar está no branch `feature/init` do repositório
> `app-diana-monitoring-lading-page` (o `main` está vazio). Os trechos citados neste documento têm valor de
> **referência de leitura** — foram lidos, não copiados.

---

## 2. Stack e scaffolding do serviço

### 2.1 Escolhas de stack

| Item | Escolha (MVP) | Justificativa |
| --- | --- | --- |
| Linguagem | **TypeScript** (ESM, `"type": "module"`) | Reaproveita 100% dos tipos e módulos `src/ml/*`. |
| Runtime | **Node.js 22 LTS** | LTS estável; `fetch` global (dispensa `axios` no ingestor); compatível com container OCI. |
| Build | **`tsc`** (emite para `dist/`) | Zero-config suficiente para um serviço de background. `tsup`/`esbuild` opcional se o cold start incomodar. |
| Execução | `node dist/main.js` | Um único entrypoint; sem servidor HTTP no núcleo (o guardian-api é outro repo). |
| Lint/format | **ESLint 9 (flat config) + Prettier** | Alinha com o protótipo, que usa ESLint 9 flat (`eslint.config.js`). |
| Testes | **Vitest** | Rápido, ESM-nativo, mesma família do ecossistema Vite do protótipo; permite portar/validar a lógica determinística do risk-engine. |
| SDK OCI | **`oci-sdk`** (Object Storage) | Apenas no adaptador de persistência; abstraído atrás de uma interface `StateStore`. |
| Validação | **`zod`** (opcional, recomendado) | Valida env vars e o `AnalysisResult` do futuro gateway LLM contra o contrato. |

> **Sem dependência de runtime da OCI onde não precisa.** O SDK da OCI entra **apenas** no adaptador de
> Object Storage (`src/state/ociObjectStorageStore.ts`). Em desenvolvimento/CI usa-se um `FileStateStore`
> (JSON em disco) — o serviço roda localmente sem credenciais OCI.

### 2.2 `package.json` (esboço)

```jsonc
{
  "name": "app-diana-monitoring",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "main": "dist/main.js",
  "scripts": {
    "dev": "node --watch --experimental-strip-types src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "start:once": "node dist/main.js --once",   // roda 1 batch e sai (útil p/ Resource Scheduler)
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "npm run lint && npm run typecheck && npm run test"
  },
  "dependencies": {
    "oci-sdk": "^2",           // só usado no adaptador OCI Object Storage
    "zod": "^3"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2",
    "eslint": "^9",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "prettier": "^3",
    "@types/node": "^22"
  }
}
```

### 2.3 `tsconfig.json` (esboço)

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.4 ESLint (flat config)

Reaproveitar a base do protótipo (`eslint.config.js`, ESLint 9 flat), **removendo** as regras de React/JSX
(este é um serviço Node). Núcleo: `@typescript-eslint` recomendado + Prettier como formatador.

### 2.5 Runtime na OCI Container Instances

- **Dockerfile multi-stage** (build com devDeps → imagem final só com `dist/` + `node_modules` de produção,
  base `node:22-slim`).
- **Dois modos de execução** (config por env/flag):
  - **`--once` (recomendado):** o container roda **um batch e sai**. O **OCI Resource Scheduler** agenda a
    execução a cada 2h. Container efêmero, custo mínimo, sem processo ocioso.
  - **`daemon` (fallback):** um único processo de longa duração com um `setInterval`/cron interno de 2h
    (`node-cron` ou timer). Necessário se o long-polling do Telegram precisar ser contínuo (ver §5.4).
- **Imagem publicada em OCIR**; deploy por script (`build → push → deploy`). Sem CI/CD elaborado no MVP
  (ver [`06`](06-mapeamento-oci.md)).
- **Segredos** (`TELEGRAM_BOT_TOKEN`) via variável de ambiente da Container Instance ou OCI Vault (mínimo);
  nunca versionados. `.env` no `.gitignore`.

---

## 3. Layout de pastas do serviço

```text
app-diana-monitoring/
├── docs/                         # documentação compartilhada (já existe)
├── src/
│   ├── main.ts                   # entrypoint: parse de flags, monta deps, dispara 1 batch (ou loop)
│   ├── config/
│   │   ├── env.ts                # leitura + validação (zod) das env vars; INGEST_MODE, BATCH, N, etc.
│   │   └── index.ts
│   ├── contracts/                # tipos LOCAIS de domínio (até existir @diana/contracts)
│   │   ├── types.ts              # portado de app-diana-monitoring-lading-page/src/ml/types.ts
│   │   └── index.ts              # re-exporta Conversation, AnalysisResult, RiskAnalyzer, ...
│   ├── ingestor/
│   │   ├── index.ts              # IngestSource: produz Conversation[] a analisar neste batch
│   │   ├── mockSource.ts         # cenários mock → Conversation (porta adapter.ts + scenarios.ts)
│   │   ├── telegram/
│   │   │   ├── client.ts         # wrapper getUpdates (long-polling) da Bot API
│   │   │   ├── normalize.ts      # Update do Telegram → ConversationMessage
│   │   │   └── telegramSource.ts # agrupa updates por chat → Conversation + atualiza checkpoint
│   │   └── compositeSource.ts    # INGEST_MODE=both → mescla mock + real
│   ├── pipeline/
│   │   ├── index.ts              # orquestra: normaliza → compacta → particiona → (cripto) →
│   │   │                         #            publica → recupera N → reconstrói → analisa → risco
│   │   ├── preprocess.ts         # portado de src/ml/preprocess.ts (PII/pseudonimização)
│   │   ├── featureExtractor.ts   # portado de src/ml/featureExtractor.ts
│   │   ├── contextualAnalyzer.ts # portado de src/ml/contextualAnalyzer.ts
│   │   ├── explainability.ts     # portado de src/ml/explainability.ts
│   │   ├── partitioning.ts       # particionamento temporal (P1..Pn) — janela N×BATCH
│   │   ├── compression.ts        # PLACEHOLDER (identidade / gzip leve)
│   │   └── crypto.ts             # PLACEHOLDER (no-op / chave simétrica local)
│   ├── risk-engine/
│   │   ├── index.ts              # portado de src/ml/riskEngine.ts (evaluateRisk)
│   │   └── thresholds.ts         # portado de src/ml/thresholds.ts
│   ├── analyzer/
│   │   ├── RiskAnalyzer.ts       # a interface (fronteira de troca)
│   │   └── MockRiskAnalyzer.ts   # portado de src/ml/mockAnalyzer.ts — implementação DEFAULT
│   ├── state/
│   │   ├── StateStore.ts         # interface: getCheckpoint/putCheckpoint, putAlert, ...
│   │   ├── fileStateStore.ts     # JSON em disco (dev/CI/local)
│   │   ├── ociObjectStorageStore.ts # JSON em OCI Object Storage (MVP em produção)
│   │   └── checkpoint.ts         # tipo Checkpoint + helpers
│   └── scheduler/
│       ├── runBatch.ts           # 1 ciclo completo: máquina de estados RECEIVED→…→ALERTED|DISCARDED
│       └── loop.ts               # daemon opcional (cron interno de 2h) — fallback ao Resource Scheduler
├── test/                         # Vitest (foco em risk-engine e normalização — lógica determinística)
├── Dockerfile
├── .dockerignore
├── .env.example
├── eslint.config.js
├── tsconfig.json
├── package.json
└── README.md                     # aponta para docs/
```

> **Nota sobre `src/analyzer/` vs. `src/risk-engine/`.** No protótipo, `mockAnalyzer.ts` **contém** a
> interface `RiskAnalyzer` e orquestra preprocess→features→context→risk→explain. No alvo separamos:
> `risk-engine/` fica com a **consolidação determinística** (`evaluateRisk` + `thresholds`), coerente com
> [`04`](04-llm-inteligencia.md) ("a LLM interpreta, o Risk Engine consolida"), e `analyzer/` fica com a
> **fronteira `RiskAnalyzer`** e o `MockRiskAnalyzer`. Isso torna explícito onde o gateway OCI GenAI vai
> plugar mais tarde.

---

## 4. Mapa protótipo → alvo

Cada arquivo `src/ml/*` (e `src/data/*`) do protótipo tem um destino claro. "Porte" = mover o código para o
serviço Node; "Adaptar" = mudar comportamento (fonte de dados, orquestração, remoção de latência de demo).

| Protótipo (`app-diana-monitoring-lading-page`) | Alvo (`app-diana-monitoring`) | Ação | Observações |
| --- | --- | --- | --- |
| `src/ml/types.ts` | `src/contracts/types.ts` | **Porte quase literal** | Já é o contrato canônico. Fica local até publicar `@diana/contracts` (repo llm-analyzer). |
| `src/ml/mockAnalyzer.ts` | `src/analyzer/RiskAnalyzer.ts` (interface) + `src/analyzer/MockRiskAnalyzer.ts` | **Porte + split** | A `interface RiskAnalyzer` sai para arquivo próprio. `MockRiskAnalyzer` permanece como **default**. Remover o `buildAudit` com locale `pt-BR` de browser → usar ISO/`Date` no servidor. |
| `src/ml/preprocess.ts` | `src/pipeline/preprocess.ts` | **Porte literal** | Puro; sem mudança. PII/pseudonimização acontece aqui, logo após a captura ([`03`](03-telegram-captura.md)). |
| `src/ml/featureExtractor.ts` | `src/pipeline/featureExtractor.ts` | **Porte literal** | Puro; regex de sinais. Boa cobertura de testes recomendada. |
| `src/ml/contextualAnalyzer.ts` | `src/pipeline/contextualAnalyzer.ts` | **Porte literal** | Puro. |
| `src/ml/riskEngine.ts` | `src/risk-engine/index.ts` | **Porte literal** | `evaluateRisk` é determinístico → alvo prioritário de testes. |
| `src/ml/thresholds.ts` | `src/risk-engine/thresholds.ts` | **Porte literal** | Constantes/calibração. |
| `src/ml/explainability.ts` | `src/pipeline/explainability.ts` | **Porte literal** | Puro. |
| `src/ml/pipeline.ts` | `src/pipeline/index.ts` | **Adaptar** | Remover latência simulada (`sleep`, `DEFAULT_LATENCY`, `onStep`), `toLocaleTimeString`. Inserir etapas ausentes (compactação, particionamento, cripto, recuperação N=3, reconstrução) — hoje o protótipo pula direto de preprocess a features. |
| `src/ml/adapter.ts` | `src/ingestor/mockSource.ts` | **Adaptar** | `scenarioToConversation` porta direto; empacotar como um `IngestSource`. |
| `src/data/scenarios.ts` | `src/ingestor/fixtures/scenarios.ts` | **Porte de dados** | Copiar os cenários (dados, não lógica). Remove-se apenas os campos de UI (`icon`, `signals` de UI, `excerpts`); o que a pipeline usa é `messages`, `childName`, `contactName`. |
| `src/data/types.ts` (`DemoScenario`, `Message`) | `src/ingestor/fixtures/types.ts` | **Porte parcial** | Só os tipos necessários para o mock source. |
| `src/data/riskCategories.ts`, `dashboard.ts` | — | **Não portar** | São dados de UI da landing/guardian; fora do escopo do núcleo. |

### 4.1 Onde entra a interface `RiskAnalyzer`

```ts
// src/analyzer/RiskAnalyzer.ts  (a fronteira congelada — ver contracts.md e doc 04)
import type { Conversation, AnalysisResult } from "../contracts";

export interface RiskAnalyzer {
  analyzeConversation(conversation: Conversation): Promise<AnalysisResult>;
}
```

- **MVP (default):** `MockRiskAnalyzer implements RiskAnalyzer` — a implementação portada do protótipo.
- **Fase 1 tardia / Fase 2:** `OciGenAiRiskAnalyzer implements RiskAnalyzer`, fornecido por
  `app-diana-llm-analyzer`. A pipeline recebe o analyzer por **injeção de dependência** (montado em
  `main.ts` a partir de `INGEST_MODE`/`ANALYZER_MODE`), então a troca é **uma linha de composição**.
- **Fallback (robustez):** se o gateway OCI GenAI estiver indisponível, cai-se para `MockRiskAnalyzer`
  (marcado em `ModelMetadata.environment = "mock"`), garantindo que o batch nunca trave — ver [`04`](04-llm-inteligencia.md).

```ts
// main.ts (composição)
const analyzer: RiskAnalyzer =
  env.ANALYZER_MODE === "oci"
    ? new OciGenAiRiskAnalyzer(/* … */)   // futuro (repo llm-analyzer)
    : new MockRiskAnalyzer();             // DEFAULT no MVP
```

> **Ponto de atenção:** hoje `MockRiskAnalyzer.analyzeConversation` já roda o pipeline **inteiro** (preprocess
> → … → explain). No alvo, o **pipeline** é o orquestrador de batch (com particionamento etc.) e o
> `RiskAnalyzer` deve ser reduzido a **só a etapa de análise/interpretação** (features → signals → context),
> deixando o risk-engine e a explainability para o núcleo. Ver a decisão de fronteira na §4 e em [`04`](04-llm-inteligencia.md).
> A sessão de Desenvolvimento deve decidir, no PR do pipeline, o corte exato da interface (recomendação:
> `RiskAnalyzer` devolve `signals` + `categories` + `confidence`; o núcleo consolida). Registrar como ADR.

---

## 5. Design do ingestor (Telegram)

### 5.1 Abstração `IngestSource`

O ingestor expõe uma interface única; a fonte concreta é escolhida por `INGEST_MODE`:

```ts
export interface IngestSource {
  /** Produz as conversas (novas desde o checkpoint) a analisar neste batch. */
  collect(now: Date): Promise<Conversation[]>;
}
```

| `INGEST_MODE` | Source | Comportamento |
| --- | --- | --- |
| `mock` (default) | `MockSource` | Converte cenários fixos em `Conversation` (porta `adapter.ts`). |
| `real` | `TelegramSource` | Long-polling `getUpdates`; agrupa por chat; normaliza; usa checkpoint. |
| `both` | `CompositeSource` | Concatena o resultado das duas fontes (mesmo tipo `Conversation`). |

### 5.2 Telegram Bot API — long-polling

- **Modo:** Bot API (não MTProto). Bot criado no **@BotFather**, adicionado aos grupos de teste, **privacy
  mode desabilitado** (ou bot admin) para enxergar todas as mensagens — decisão explícita do ambiente de
  teste ([`03`](03-telegram-captura.md)).
- **Endpoint:** `GET https://api.telegram.org/bot<TOKEN>/getUpdates?offset=<n>&timeout=<s>&allowed_updates=["message"]`.
  Usar `fetch` global do Node 22 (sem dependência extra).
- **Filtragem:** só processar `update.message` de `chat.id ∈ TELEGRAM_ALLOWED_CHAT_IDS`. Ignorar mídia,
  edições, callbacks — **apenas texto** no MVP (minimização na borda, [`03`](03-telegram-captura.md)).

### 5.3 Checkpoint (offset do Telegram ↔ `last_message_id`)

Dois níveis de checkpoint, ambos persistidos como JSON no `StateStore`:

1. **Offset do Telegram (por bot):** `last_update_id`. A próxima chamada usa `offset = last_update_id + 1`.
   Garante "capturar só o que é novo" sem duplicar/perder (RF-02).
2. **Checkpoint por conversa (contrato de [`02`](02-pipeline-background.md)):**

   ```json
   {
     "conversation_id": "CONV-019",
     "last_message_id": "MSG-1291",
     "period_start": "2026-09-13T08:00:00Z",
     "period_end":   "2026-09-13T10:00:00Z",
     "message_count": 12,
     "status": "ready"
   }
   ```

Fluxo: `getUpdates(offset)` → mensagens novas → para cada chat, mapear `update_id`/`message_id` do Telegram
para `last_message_id` do checkpoint da conversa → gravar checkpoint atualizado **só após** o batch concluir
(evita perder mensagens se o batch falhar no meio).

### 5.4 Nota sobre long-polling × execução `--once`

Há uma tensão a resolver no PR do ingestor: long-polling é *contínuo*, mas o modo recomendado de execução é
*batch efêmero de 2h*. Duas opções (documentar a escolha como ADR):

- **(A) Drain no batch (recomendado p/ MVP):** a cada execução, o ingestor faz `getUpdates` em loop **até
  esvaziar** a fila (respostas vazias) com `timeout` curto, coleta tudo desde o offset e sai. Simples,
  compatível com `--once` + Resource Scheduler. Risco: mensagens além da janela de retenção do Telegram
  (~24h) para updates não confirmados — aceitável no volume baixo do MVP.
- **(B) Daemon:** processo contínuo com long-polling real e um cron interno de 2h que dispara a pipeline.
  Necessário se quisermos captura em tempo quase-real. Mais peças, container sempre ligado.

MVP: **(A)**. Deixar **(B)** documentado como caminho de evolução.

### 5.5 Normalização `Update` → `ConversationMessage`

Porta o mapeamento de [`03`](03-telegram-captura.md):

| Domínio DIANA | Origem no Telegram |
| --- | --- |
| `id` | `message_id` (prefixado `MSG-`) |
| `timestamp` | `date` (epoch → ISO 8601) |
| `author` (`child`\|`other`) | derivado de `from.id` via `DIANA_CHILD_MEMBER_MAP` |
| `text` | `text` |
| `conversation_id` | `chat.id` (prefixado `CONV-`) |

A pseudonimização de PII **não** ocorre aqui — ocorre logo em seguida, na etapa `preprocess` do pipeline
(coerente com o protótipo). O ingestor só padroniza IDs/timestamps/ordem (RF-04).

### 5.6 Variáveis de ambiente

```bash
# --- Telegram / ingestor ---
TELEGRAM_BOT_TOKEN=...            # segredo (BotFather); env ou OCI Vault; NUNCA versionar
TELEGRAM_ALLOWED_CHAT_IDS=-100...,-100...   # ids dos grupos de teste permitidos (CSV)
DIANA_CHILD_MEMBER_MAP={"-1002":"55"}       # JSON: chatId → userId da "criança" simulada
INGEST_MODE=mock                  # mock (default) | real | both

# --- cadência / janela ---
BATCH_HOURS=2                     # cadência do batch
WINDOW_PARTITIONS=3               # N (janela = N × BATCH ≈ 6h)

# --- analyzer ---
ANALYZER_MODE=mock                # mock (default) | oci  (futuro: gateway OCI GenAI)

# --- persistência ---
STATE_BACKEND=file                # file (dev) | oci
OCI_OS_BUCKET=diana-monitoring    # bucket p/ checkpoint/alertas (quando STATE_BACKEND=oci)
OCI_OS_NAMESPACE=...
STATE_DIR=./.state                # quando STATE_BACKEND=file
```

`src/config/env.ts` valida essas variáveis com `zod` no boot e falha rápido com mensagem clara se algo
essencial faltar (ex.: `INGEST_MODE=real` sem `TELEGRAM_BOT_TOKEN`).

---

## 6. Pipeline, scheduler e máquina de estados

### 6.1 Cadência (batch 2h, janela ~6h)

```text
BATCH  = 2h                 # configurável (BATCH_HOURS)
N      = 3                  # configurável (WINDOW_PARTITIONS)
WINDOW = N × BATCH = 6h      # janela de contexto reconstruída
```

A cada disparo, o serviço recupera as **últimas N=3 partições** (~6h) e as reconstrói cronologicamente em uma
`Conversation` para análise. `BATCH` e `N` são env vars — a janela cresce sem mudança estrutural
([`02`](02-pipeline-background.md)).

### 6.2 As 12 etapas (com o que é real × placeholder no MVP)

| # | Etapa | Módulo alvo | Status MVP |
| --- | --- | --- | --- |
| 1 | Captura | `ingestor/` | **Real** (mock/Telegram) |
| 2 | Normalização | `pipeline/preprocess.ts` | **Real** (portado) |
| 3 | Compactação | `pipeline/compression.ts` | **Placeholder** (identidade ou gzip leve) |
| 4 | Particionamento | `pipeline/partitioning.ts` | **Real** (partição temporal P1..Pn) |
| 5 | Criptografia | `pipeline/crypto.ts` | **Placeholder** (no-op / chave simétrica local; KMS na Fase 2) |
| 6 | Publicação ("batch pronto") | `scheduler/runBatch.ts` | **Real** (marca partição pronta no StateStore) |
| 7 | Recuperação (N=3) | `pipeline/partitioning.ts` | **Real** |
| 8 | Descriptografia | `pipeline/crypto.ts` | **Placeholder** (inverso do no-op, em memória) |
| 9 | Descompressão | `pipeline/compression.ts` | **Placeholder** (em memória) |
| 10 | Reconstrução (janela ~6h) | `pipeline/index.ts` | **Real** (reordena por timestamp → `Conversation`) |
| 11 | Análise (LLM) | `analyzer/` (via `RiskAnalyzer`) | **Mock** default; OCI GenAI depois |
| 12 | Risk Engine | `risk-engine/` | **Real** (portado, determinístico) |

> **Plaintext efêmero (princípio congelado):** mesmo com cripto placeholder, o dado bruto só existe em texto
> aberto **em memória durante a análise** e é descartado depois. Nada persiste a conversa em claro — o que
> sobra no Object Storage é o `AnalysisResult` (sinais, score, explicação) e o alerta, nunca o conteúdo bruto
> ([`02`](02-pipeline-background.md)).

### 6.3 Máquina de estados da análise

Cada análise percorre (portado de [`02`](02-pipeline-background.md)):

```text
RECEIVED → NORMALIZING → COMPRESSED → PARTITIONED → ENCRYPTED → PUBLISHED
  → CONTEXT_BUILDING → ANALYZING → RISK_EVALUATION → (ALERTED | DISCARDED)
```

- Implementada em `scheduler/runBatch.ts` como uma sequência explícita; cada transição adiciona um
  `AuditEntry { timestamp, stage, description }` ao `AnalysisResult.audit[]` (o tipo já existe em `types.ts`).
- Ramo final: `RISK_EVALUATION → ALERTED` se `assessment.requiresGuardianAttention` (ou score ≥ limiar);
  senão `→ DISCARDED`.
- Útil para diagnosticar em qual etapa uma eventual falha ocorreu (logs de container no MVP).

### 6.4 Scheduler

- **MVP:** `main.ts --once` roda **um** `runBatch()` e sai; **OCI Resource Scheduler** dispara a cada 2h
  ([`06`](06-mapeamento-oci.md)).
- **Fallback:** `scheduler/loop.ts` com cron interno (2h) para rodar como daemon, se preferível a manter um
  container ocioso ou se o modo daemon do ingestor (§5.4-B) for adotado.

### 6.5 Saída: alerta

Quando `ALERTED`, grava um registro de alerta em Object Storage (JSON), consumível pelo futuro
`app-diana-guardian-api`:

```text
os://<bucket>/alerts/<conversationId>/<processedAt>.json   → { AnalysisResult resumido p/ o responsável }
os://<bucket>/checkpoints/<conversationId>.json            → { Checkpoint }
os://<bucket>/telegram/offset.json                          → { last_update_id }
```

O `AnalysisResult` **não** contém a conversa integral (RF-16 / privacy by design).

---

## 7. Mock vs. real no MVP (resumo)

| Aspecto | Mock (default) | Real (ocasional) |
| --- | --- | --- |
| Fonte de dados | `MockSource` (cenários portados) | `TelegramSource` (Bot API) |
| Volume | maioria do tráfego | esporádico |
| Analyzer | `MockRiskAnalyzer` | `MockRiskAnalyzer` (até OCI GenAI existir) |
| Cripto/compressão/particionamento | placeholder | placeholder |
| Persistência | `FileStateStore` (dev) / OCI OS | OCI OS |
| Tipo produzido | `Conversation` | `Conversation` (**idêntico**) |

Ponto-chave: **mock e real produzem o mesmo `Conversation`**; tudo a jusante (pipeline, analyzer, risk-engine,
alerta) é idêntico. Trocar/mesclar fontes é só `INGEST_MODE`.

---

## 8. Persistência mínima

- **Sem DB gerenciado.** Estado = arquivos JSON.
- **Interface `StateStore`** com dois adaptadores: `FileStateStore` (JSON em `STATE_DIR`, para dev/CI/local) e
  `OciObjectStorageStore` (para produção MVP). Escolhido por `STATE_BACKEND`.
- **Objetos persistidos:** checkpoint por conversa, offset do Telegram, alertas (`AnalysisResult` resumido).
- **Partições protegidas:** no MVP, como cripto é placeholder e a janela é pequena (~6h), as partições podem
  viver **em memória entre as etapas** de um mesmo batch; persistir partições em OS é opcional (só necessário
  se batches distintos precisarem compartilhá-las). Documentar a decisão no PR do pipeline.

---

## 9. Testes e validação (mínimo do MVP)

- **Vitest** focado na **lógica determinística**: `risk-engine/evaluateRisk` (given features/signals →
  score/level/priority estáveis), `featureExtractor` (regex de sinais), `contextualAnalyzer`, normalização
  `Update → ConversationMessage`, e o `MockSource`.
- **Teste de fumaça end-to-end** do `runBatch()` no modo `mock`: cenário "grooming" → deve resultar em
  `ALERTED` com `requiresGuardianAttention = true`.
- `npm run check` (lint + typecheck + test) verde é o gate de cada PR.

---

## 10. Checklist de implementação (PRs ordenados)

> Convenção: cada PR é pequeno, com alvo único, aberto contra **`develop`**, com `npm run check` verde.
> Ordem pensada para desbloquear a sessão de Desenvolvimento incrementalmente.

- [ ] **PR 1 — Scaffolding do serviço.**
  `package.json`, `tsconfig.json`, `eslint.config.js` (flat, sem React), `.gitignore` (+ `.env`, `dist`,
  `.state`), `.env.example`, `README.md` apontando para `docs/`, `Dockerfile` multi-stage, `src/main.ts`
  mínimo ("hello batch"). Gate: `npm run check` verde.

- [ ] **PR 2 — Contrato local (`src/contracts`).**
  Portar `src/ml/types.ts` do protótipo para `src/contracts/types.ts`; `index.ts` re-exporta. Sem lógica.
  Deixa registrado que será substituído por `@diana/contracts` quando o repo llm-analyzer existir.

- [ ] **PR 3 — Módulos puros do pipeline.**
  Portar `preprocess.ts`, `featureExtractor.ts`, `contextualAnalyzer.ts`, `explainability.ts` para
  `src/pipeline/`; portar `riskEngine.ts` + `thresholds.ts` para `src/risk-engine/`. **Sem** mudança de
  lógica. Adicionar testes Vitest do `risk-engine` e `featureExtractor`.

- [ ] **PR 4 — `RiskAnalyzer` + `MockRiskAnalyzer`.**
  Criar `src/analyzer/RiskAnalyzer.ts` (interface) e `src/analyzer/MockRiskAnalyzer.ts` (portado de
  `mockAnalyzer.ts`, sem `toLocaleTimeString`/latência de demo). Definir o **corte da interface** (o que o
  analyzer devolve vs. o que o núcleo consolida) e registrar como ADR curta em `docs/`.

- [ ] **PR 5 — `StateStore` + `FileStateStore`.**
  Interface `StateStore` (checkpoint, offset, alerta) e adaptador em disco (JSON). Tipos `Checkpoint`.
  Testes do round-trip.

- [ ] **PR 6 — `IngestSource` + `MockSource`.**
  Interface `IngestSource`; portar `adapter.ts` e os cenários de `src/data/scenarios.ts` (só dados usados)
  para `src/ingestor/mockSource.ts` + `fixtures/`. `INGEST_MODE=mock` já produz `Conversation[]`.

- [ ] **PR 7 — Pipeline orquestrador + máquina de estados.**
  `src/pipeline/index.ts` (normaliza→compacta→particiona→cripto→publica→recupera N→reconstrói) com
  `compression.ts`/`crypto.ts`/`partitioning.ts` (placeholders reais), e `scheduler/runBatch.ts` com os
  estados `RECEIVED→…→ALERTED|DISCARDED` + trilha `audit[]`. `main.ts --once` roda 1 batch mock ponta a
  ponta. Teste de fumaça e2e (cenário grooming → ALERTED).

- [ ] **PR 8 — Ingestor Telegram.**
  `telegram/client.ts` (getUpdates long-polling, estratégia *drain* §5.4-A), `normalize.ts`
  (`Update→ConversationMessage`), `telegramSource.ts` (agrupa por chat + checkpoint/offset),
  `compositeSource.ts` (`both`). Validação de env (`config/env.ts` com zod). Sem token real em teste (mockar
  `fetch`).

- [ ] **PR 9 — Adaptador OCI Object Storage.**
  `state/ociObjectStorageStore.ts` (usa `oci-sdk`), selecionável por `STATE_BACKEND=oci`. Gravar
  checkpoint/offset/alertas no bucket. Manter `FileStateStore` como default de dev.

- [ ] **PR 10 — Deploy MVP.**
  Finalizar `Dockerfile`, script `build+push (OCIR)+deploy` na Container Instance, e nota de configuração do
  **OCI Resource Scheduler** (2h) chamando `--once`. Documentar segredos (env/Vault) e o passo do BotFather
  (privacy mode). Atualizar `docs/07-roadmap.md` marcando os RFs da Fase 1 conforme concluídos.

> **Dependência de outro repo:** o `OciGenAiRiskAnalyzer` (substituto do mock) **não** faz parte deste
> checklist — ele nasce em `app-diana-llm-analyzer` (a criar) e pluga via `ANALYZER_MODE=oci`. O núcleo já
> estará pronto para recebê-lo desde o PR 4.

---

## 11. Riscos e decisões em aberto (para ADRs)

1. **Corte exato da interface `RiskAnalyzer`** (analyzer devolve só `signals`/`categories`, ou o
   `AnalysisResult` inteiro?). Recomendação: analyzer interpreta, núcleo consolida — decidir no PR 4/7.
2. **Long-polling × `--once`** (§5.4): MVP adota *drain*; daemon fica documentado.
3. **Persistir partições em OS ou mantê-las em memória** entre etapas (§8): recomendação memória no MVP.
4. **Placeholder de cripto/compressão**: manter no-op explícito e assinalado, para não dar falsa sensação de
   proteção; hardening (Vault/KMS) é Fase 2 ([`07`](07-roadmap.md)).

---

← [Índice](README.md) · [Pipeline / Background →](02-pipeline-background.md) · [Contrato →](contracts.md)
