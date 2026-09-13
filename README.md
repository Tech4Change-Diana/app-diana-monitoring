# app-diana-monitoring

**Núcleo de background da DIANA** (Telegram ingestor + pipeline + Risk Engine) e **repositório-plataforma**
que hospeda a documentação de arquitetura compartilhada.

A DIANA é uma plataforma de proteção digital infantil orientada à **análise contextual e temporal de
conversas** (grooming/aliciamento, cyberbullying e captura de informação pessoal). Este repositório roda
o processamento em background e é a **fonte única de documentação** para todos os repositórios do projeto.

## 📚 Documentação de arquitetura

Toda a arquitetura, a divisão de repositórios e o mapeamento para a Oracle Cloud (OCI) estão em
**[`docs/`](docs/README.md)** — comece pelo índice:

- [Visão geral do MVP e mapa dos repositórios](docs/README.md)
- [01 — Divisão de repositórios](docs/01-repositorios.md)
- [02 — Pipeline / o que roda em background](docs/02-pipeline-background.md)
- [03 — Comunicação com o Telegram](docs/03-telegram-captura.md)
- [04 — Como a LLM funciona](docs/04-llm-inteligencia.md)
- [05 — Experiência do responsável](docs/05-experiencia-responsavel.md)
- [06 — Mapeamento para a OCI](docs/06-mapeamento-oci.md)
- [07 — Roadmap e rastreabilidade](docs/07-roadmap.md)
- [Contrato de domínio compartilhado](docs/contracts.md)
- [Análise técnica — Fase 1 (núcleo de background)](docs/analise-tecnica-fase1.md)
- [Regras de negócio (pipeline + Risk Engine)](docs/regras-de-negocio.md)
- [ADR 0001 — Fronteira `RiskAnalyzer`](docs/adr/0001-fronteira-risk-analyzer.md)

## 🧠 O serviço (núcleo de background)

Serviço **Node.js 22 + TypeScript** que roda o processamento em background: **ingestor do Telegram +
pipeline + Risk Engine**. Executa em **batch** (a cada ~2h) sobre uma **janela de contexto ≈6h**
(`N=3` partições). É **mock-first**: por padrão consome cenários mockados ponta a ponta; o Telegram é a
exceção ocasional. A análise usa a interface `RiskAnalyzer`, com `MockRiskAnalyzer` como implementação
**default** até o gateway OCI GenAI existir (repo `app-diana-llm-analyzer`).

### Requisitos

- Node.js **>= 22** (usa `fetch` global; sem `axios`).
- npm.

### Instalação

```bash
npm install
cp .env.example .env   # ajuste conforme necessário (o default já roda em modo mock)
```

### Executar

```bash
# modo mock, um único batch (recomendado; equivale ao que o Resource Scheduler dispara):
npm run build && npm run start:once

# durante o desenvolvimento (sem build; Node 22 executa TS diretamente):
npm run dev -- --once

# daemon (fallback): cron interno de BATCH_HOURS
npm run start
```

Em modo mock, o serviço coleta os cenários, executa a máquina de estados
(`RECEIVED → … → ALERTED|DISCARDED`) e grava os alertas (`AnalysisResult` resumido) e checkpoints via
`FileStateStore` em `STATE_DIR` (`./.state` por padrão):

```text
.state/alerts/<conversationId>/<processedAt>.json   # AnalysisResult agregado (nunca a conversa integral)
.state/checkpoints/<conversationId>.json            # Checkpoint por conversa
.state/telegram/offset.json                         # last_update_id (INGEST_MODE=real|both)
```

### Modo Telegram (real)

```bash
INGEST_MODE=real \
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890 \
DIANA_CHILD_MEMBER_MAP='{"-1001234567890":"55123456"}' \
npm run dev -- --once
```

O ingestor usa long-polling `getUpdates` com estratégia *drain* (esvazia a fila e sai), normaliza cada
`Update` em `ConversationMessage` e mantém o offset (`last_update_id`) como checkpoint. O bot precisa estar
nos grupos de teste com *privacy mode* desabilitado (ou como admin). Ver
[`docs/03-telegram-captura.md`](docs/03-telegram-captura.md).

### Variáveis de ambiente

Todas documentadas em [`.env.example`](.env.example). Principais: `INGEST_MODE` (`mock`|`real`|`both`),
`ANALYZER_MODE` (`mock`|`oci`), `STATE_BACKEND` (`file`|`oci`), `BATCH_HOURS`, `WINDOW_PARTITIONS`,
`TELEGRAM_*`. A validação (zod) falha rápido no boot com mensagem clara.

### Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | Executa `src/main.ts` com `--watch` (Node 22, sem build). |
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm run start` / `start:once` | Roda `dist/main.js` (daemon / um batch). |
| `npm run lint` | ESLint 9 (flat config). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test` | Vitest. |
| `npm run check` | lint + typecheck + test (gate de PR). |

### Docker (OCI Container Instances)

```bash
docker build -t app-diana-monitoring .
docker run --rm --env-file .env app-diana-monitoring   # roda 1 batch (--once) e sai
```

Ver [`docs/06-mapeamento-oci.md`](docs/06-mapeamento-oci.md) e
[`docs/analise-tecnica-fase1.md`](docs/analise-tecnica-fase1.md) §2.5 (modos de execução).

## Status

Fase 1 — **núcleo de background** em construção. Esta entrega cobre: scaffolding Node+TS, contratos de
domínio, pipeline + Risk Engine, `RiskAnalyzer`/`MockRiskAnalyzer`, ingestor do Telegram, scheduler,
persistência em arquivo e modo mock rodando ponta a ponta. Próximos PRs: adaptador OCI Object Storage e
finalização de deploy (ver [roadmap](docs/07-roadmap.md) e o corpo do PR).
