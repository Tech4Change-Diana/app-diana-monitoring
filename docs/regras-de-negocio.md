# Regras de Negócio — Núcleo (Pipeline + Risk Engine)

> **Documento canônico das regras de negócio da DIANA.** Consolida, num único lugar, **todas as
> regras** que o núcleo de background (`app-diana-monitoring`: pipeline + Risk Engine) deve
> implementar, mais a fronteira com a inteligência (`app-diana-llm-analyzer`) e com a experiência do
> responsável (`app-diana-guardian-*`).
>
> A fonte já validada em forma de **protótipo (MOCK)** vive em
> [`app-diana-monitoring-lading-page`](https://github.com/Tech4Change-Diana/app-diana-monitoring-lading-page)
> (`src/ml/` e `src/data/`). Este documento **destila** essas regras — não substitui o código de
> serviço, orienta-o.

← [Índice](README.md) · Relacionados: [02 — Pipeline](02-pipeline-background.md) ·
[04 — LLM](04-llm-inteligencia.md) · [05 — Responsável](05-experiencia-responsavel.md) ·
[Contrato](contracts.md)

---

## Como ler este documento

Cada regra é marcada com um selo:

- 🧊 **PRINCÍPIO CONGELADO** — decisão de produto/arquitetura que **não muda** sem revisão explícita.
  Vale para toda a DIANA, independentemente de calibração ou implementação.
- ⚙️ **CONFIGURÁVEL** — parâmetro, limiar ou tabela ajustável por variável de ambiente / calibração,
  **sem** mudança estrutural. Os valores atuais são **heurísticas de MVP**.

> ⚠️ **Aviso transversal (MOCK / heurística):** todos os números deste documento (pesos, limiares,
> bandas, confiança) vêm do **protótipo mock** e são **heurísticas de demonstração**, **não** uma
> fórmula cientificamente validada. Serão substituídos por limiares reais após treinamento e
> avaliação (precision/recall/F1/FPR/AUROC/calibração). Ver
> [`ml-architecture.md`](https://github.com/Tech4Change-Diana/app-diana-monitoring-lading-page/blob/feature/init/docs/ml-architecture.md)
> do protótipo.

---

## 1. Princípios de negócio congelados

Estes princípios comandam todas as regras subsequentes.

| # | Princípio | Selo |
| --- | --- | --- |
| P1 | **Contexto temporal, não mensagem isolada.** A unidade de análise é a **janela de conversa (~6h)**, avaliando evolução e progressão — nunca uma frase solta. | 🧊 |
| P2 | **Separação LLM × Risk Engine.** A LLM **interpreta** (produz indicadores, categorias, confiança, explicação); o Risk Engine **consolida** de forma **determinística** (frequência, sequência, escalada, combinação, severidade, confiança → score/prioridade). A LLM **não** decide o score final nem emite acusações. | 🧊 |
| P3 | **Apoio à decisão humana, nunca veredito automático.** A DIANA apresenta padrões e evidências; **não** afirma que um crime ocorreu e **não** toma ação irreversível automaticamente (human-in-the-loop). | 🧊 |
| P4 | **O responsável recebe alerta estruturado, nunca a conversa integral** (ver §7). | 🧊 |
| P5 | **Três pilares de risco:** grooming/aliciamento, cyberbullying e captura de informação pessoal (ver §2). | 🧊 |
| P6 | **Score é indicador técnico (0–100)**, não medida de culpa e não probabilidade calibrada. | 🧊 |
| P7 | **Privacy by design:** plaintext efêmero, minimização de dados e pseudonimização de PII (ver §9). | 🧊 |
| P8 | **Mesmo contrato para mock e real.** `Conversation` (entrada) e `AnalysisResult` (saída) são idênticos para dados mock e Telegram; trocar a fonte ou o analisador é só configuração. | 🧊 |

Cobre requisitos: **RF-11** (análise contextual), **RF-12** (análise por pilares),
**RF-13** (Risk Engine), **RF-16** (não expor a conversa integral).

---

## 2. Os três pilares e a taxonomia de indicadores

Os **3 pilares** (🧊) são o enquadramento de produto. Operacionalmente, a LLM emite **indicadores
por pilar** (taxonomia — ⚙️ expansível) que o núcleo mapeia para **categorias de risco** (§4).

### 2.1 Taxonomia da LLM (por pilar)

> Subconjunto da visão funcional (§33), conforme [`04-llm-inteligencia.md`](04-llm-inteligencia.md).
> ⚙️ A taxonomia é **expansível** sem mudança estrutural.

| Pilar (🧊) | Indicadores (⚙️) |
| --- | --- |
| **Grooming / Aliciamento** | `age_probing`, `rapport_building`, `secrecy_request`, `isolation_attempt`, `image_request`, `intimate_content_request`, `meeting_request`, `platform_migration`, `coercion`, `threat` |
| **Cyberbullying** | `insult`, `humiliation`, `threat`, `repetition`, `targeting`, `exclusion`, `denigration`, `identity_attack`, `doxxing` |
| **Captura de informação pessoal** | `name_request`, `school_request`, `address_request`, `phone_request`, `location_request`, `routine_request`, `parent_information_request`, `password_request`, `identity_document_request`, `financial_information_request` |

**Regra P2-a (🧊):** a LLM deve procurar a **progressão** (ex.: `age_probing → rapport_building →
secrecy_request → isolation_attempt → personal_info → image_request`), e não apenas uma palavra-chave
isolada.

### 2.2 Subconjunto implementado no protótipo (MOCK)

O protótipo implementa **11 tipos de sinal** (⚙️) via heurística regex em `featureExtractor.ts` +
catálogo em `mockAnalyzer.ts`. No MVP, a **detecção** migra para a LLM, mas os **tipos** e o
**mapa sinal→categoria** (§4) permanecem como referência.

| Tipo de sinal (`type`) | Título | Severidade (⚙️) |
| --- | --- | --- |
| `secrecy_request` | Pedido de segredo | **high** |
| `image_request` | Solicitação de imagem | **high** |
| `isolation_attempt` | Tentativa de isolamento | **high** |
| `blackmail` | Chantagem | **high** |
| `sexual_language` | Linguagem de conotação sexual | **high** |
| `self_harm` | Linguagem de automutilação | **high** |
| `personal_information_request` | Solicitação de dados pessoais | **medium** |
| `threat` | Ameaça | **medium** |
| `insult` | Insulto / agressão verbal | **medium** |
| `personal_information_shared` | Dados pessoais compartilhados | **low** |
| `emotional_distress` | Sinais de sofrimento emocional | **low** |

> ⚠️ A detecção por **regex em português** é uma heurística de MVP: cobre PT-BR, é sensível a
> variações e **não** modela relacionamento entre os interlocutores — daí a importância dos
> hard negatives (§8).

---

## 3. Categorias de risco (saída do núcleo)

O contrato define **10 categorias** (`RiskCategory`) — ⚙️ enum estável do contrato. A **ordem
canônica** (`CATEGORY_ORDER`) é usada para desempate e apresentação:

```
grooming → image_request → cyberbullying → blackmail → threat →
personal_information → isolation → sexual_content → emotional_distress → self_harm
```

| Categoria | Rótulo ao responsável | Prioridade de referência* |
| --- | --- | --- |
| `grooming` | Possível grooming / aliciamento | alta |
| `image_request` | Solicitação de imagem íntima | alta |
| `self_harm` | Automutilação / suicídio | alta |
| `cyberbullying` | Cyberbullying | média |
| `blackmail` | Chantagem | média |
| `threat` | Ameaça | média |
| `personal_information` | Compartilhamento de informação pessoal | baixa |
| `isolation` | Tentativa de isolamento | baixa |
| `sexual_content` | Conteúdo potencialmente sexual | baixa |
| `emotional_distress` | Sinais de sofrimento emocional | baixa |

\* ⚙️ Prioridade **de referência editorial** de cada categoria (de `riskCategories.ts`), usada em
orientação/educação. **Não confundir** com a prioridade calculada do alerta (§6), que deriva do
**score da janela**.

Cada categoria carrega **descrição, exemplos e orientação ao responsável** (ver `riskCategories.ts`),
reutilizados na tela `SafetyCenter` e no detalhe do alerta.

---

## 4. Mapa sinal → categoria

Regra **SIGNAL_CATEGORY** (🧊 quanto à existência do mapa; ⚙️ quanto às entradas):

| Sinal (`type`) | Categoria (`RiskCategory`) |
| --- | --- |
| `secrecy_request` | `grooming` |
| `isolation_attempt` | `grooming` |
| `image_request` | `image_request` |
| `personal_information_request` | `personal_information` |
| `personal_information_shared` | `personal_information` |
| `threat` | `threat` |
| `insult` | `cyberbullying` |
| `blackmail` | `blackmail` |
| `sexual_language` | `sexual_content` |
| `emotional_distress` | `emotional_distress` |
| `self_harm` | `self_harm` |

**Regra 4-a (⚙️):** sinal sem entrada no mapa cai no **fallback `grooming`**. *(Recomendação de
evolução: fallback explícito/registrado, para não inflar `grooming` silenciosamente quando a
taxonomia crescer.)*

**Escala de severidade (🧊 como conceito, ⚙️ como valores):** `low` < `medium` < `high`.

---

## 5. Fatores do Risk Engine

O Risk Engine consolida **oito fatores**. Os cinco primeiros são os **fatores contextuais**
(`ContextualFactor`) exibidos ao responsável; severidade e confiança entram como pesos.

| Fator | O que mede | Como influencia (MVP mock) | Selo |
| --- | --- | --- | --- |
| **Conteúdo** (`content`) | O que foi escrito (quais sinais) | Sempre presente se há ≥1 sinal. Contribuição `high` se houver algum sinal de severidade alta, senão `medium`. É a base do score por sinal. | ⚙️ |
| **Frequência / Recorrência** (`frequency`) | Repetição do padrão em várias mensagens | Ativa se `suspiciousMessageCount ≥ 2` (contribuição `high` se ≥ 3). Soma **+`FREQUENCY_WEIGHT` (6)** ao score. | ⚙️ |
| **Sequência** (`sequence`) | Ordem/progressão dos eventos | Ativa se sigilo/isolamento (`secrecy_request`/`isolation_attempt`) **preceder** pedidos pessoais (`image_request`/`personal_information_request`). Contribuição `high`. Marca progressão relevante. | ⚙️ |
| **Escalada** (`escalation`) | Transição de tom normal → preocupante ao longo da janela | Ativa se `conversationEscalation > 0.4` (`high` se > 0.6). Soma **`conversationEscalation × ESCALATION_WEIGHT (15)`** ao score. | ⚙️ |
| **Combinação** (`combination`) | Múltiplos sinais distintos simultâneos | Ativa se ≥ 2 tipos distintos (`high` se ≥ 3). Soma **+`COMBINATION_WEIGHT` (8)** ao score. | ⚙️ |
| **Severidade** | Gravidade intrínseca do sinal | Peso multiplicativo no score e no score por categoria: `low=1, medium=2, high=3` (`SEVERITY_WEIGHTS`). | ⚙️ |
| **Confiança** | Quão seguro está o modelo do sinal | Multiplica a contribuição de cada sinal (0–1). No MVP vem da **LLM**; no mock é derivada da recorrência (§6.3). | ⚙️ |
| **Calibração por tipo** | Ajuste fino por tipo de sinal | `MOCK_CALIBRATION` soma um bônus ao **score por categoria** (não ao score geral): `image_request +0.35`, `insult +0.20`, `personal_information_request +0.15`, `isolation_attempt +0.15`, `secrecy_request +0.10`. | ⚙️ |

**Como `conversationEscalation` é medido (⚙️, mock):** posição média dos sinais na janela
(sinais concentrados na **segunda metade** ⇒ escalada). `escalation = clamp(0..1, avgPos × 1.6 − 0.3)`.

Cobre **RF-11** (contextual) e **RF-13** (Risk Engine).

---

## 6. Cálculo do score, níveis e prioridade

> ⚠️ **HEURÍSTICA DE MVP — não é fórmula validada.** Tudo em §6 é ⚙️ **CONFIGURÁVEL**.

### 6.1 Score técnico geral (0–100)

```
score  =  Σ_sinais [ SEVERITY_WEIGHTS[sev] × confidence × SCORE_FACTOR_PER_SIGNAL(8) ]
        +  conversationEscalation × ESCALATION_WEIGHT(15)
        +  (existe fator "combination" ? COMBINATION_WEIGHT(8) : 0)
        +  (suspiciousMessageCount ≥ 2 ? FREQUENCY_WEIGHT(6) : 0)

score  =  round( clamp(0, 100, score) )
```

### 6.2 Score e probabilidade por categoria

Para cada sinal: `contribuição = SEVERITY_WEIGHTS[sev] × confidence + MOCK_CALIBRATION[type]`,
acumulada na sua categoria. Depois:

```
probability = raw ≤ 0 ? 0 : clamp(0.12, 0.95, (raw / maxCategoryScore) × 0.9)
level_da_categoria = levelFromScore(raw × 12)
```

Categorias com `probability > 0` são ordenadas **desc.** — a primeira é a **categoria principal** do
alerta.

### 6.3 Confiança simulada (apenas mock)

`confidence = min( CEILING(0.97), FLOOR(0.60) + STEP(0.07) × (ocorrências − 1) )`.
No MVP, **a confiança é fornecida pela LLM**; esta fórmula é só o placeholder do protótipo.

### 6.4 Nível de risco (`RiskLevel`) — thresholds do protótipo

`levelFromScore(score)` com `RISK_LEVEL_THRESHOLDS` = `{low:5, medium:20, high:55, critical:80}`:

| Faixa de score | `RiskLevel` |
| --- | --- |
| `< 5` | `none` |
| `5 – 19` | `low` |
| `20 – 54` | `medium` |
| `55 – 79` | `high` |
| `≥ 80` | `critical` |

E a prioridade derivada (enum `RiskPriority`): `high`/`critical` → **high**; `medium` → **medium**;
demais → **low**.

### 6.5 Bandas de prioridade consolidadas (regra de negócio)

Para comunicação com o responsável, adota-se a banda de **4 faixas** (⚙️ CONFIGURÁVEL):

| Faixa de score | Prioridade | Rótulo |
| --- | --- | --- |
| `0 – 24` | **Baixa** | Prioridade baixa |
| `25 – 49` | **Moderada** | Prioridade moderada |
| `50 – 74` | **Alta** | Prioridade alta |
| `75 – 100` | **Crítica** | Prioridade crítica |

> **Nota de reconciliação (⚙️):** os thresholds numéricos do protótipo (§6.4) **divergem** desta
> banda de 4 faixas e do enum de prioridade de 3 valores (`low/medium/high`) do contrato. Isso é
> esperado num MVP: os números são placeholders a **calibrar**. A regra de negócio consolidada é a
> banda de 4 faixas acima; a implementação deve **alinhar** os limiares e, se necessário, estender o
> enum `RiskPriority` para `critical` na calibração. Enquanto não calibrado, o núcleo emite o **score
> técnico** e o **nível** de §6.4, e a UI pode rotular pela banda de 4 faixas.

### 6.6 `requiresGuardianAttention`

**Regra 6-a (🧊 na intenção, ⚙️ nos limiares):** o alerta exige atenção do responsável quando:

```
requiresGuardianAttention =
      level ∈ { medium, high, critical }
   OR existe algum sinal com severity === "high"
```

Ou seja, **qualquer sinal de severidade alta** (ex.: `secrecy_request`, `image_request`,
`isolation_attempt`, `blackmail`, `sexual_language`, `self_harm`) **sempre** aciona a atenção do
responsável, **mesmo que o score geral seja baixo** — salvaguarda contra falsos negativos.

### 6.7 Alertar × descartar

**Regra 6-b (🧊):** ao final da avaliação, `RISK_EVALUATION → ALERTED` (risco relevante) ou
`→ DISCARDED` (risco baixo). Gera-se **alerta** quando `requiresGuardianAttention = true` (equivale
a ultrapassar o limiar de relevância). Caso contrário, **descarte** — sem persistir a conversa.

Cobre **RF-13** (Risk Engine) e **RF-15** (gerar alerta ao ultrapassar o limiar).

### 6.8 `rationale`

Texto curto e determinístico gerado pelo núcleo: nº de sinais, tipos principais, % de escalada e o
selo **"Valores técnicos simulados (MOCK)"**. No MVP real, incorpora a explicação da LLM, mantendo o
tom de **apoio**, nunca de acusação.

---

## 7. Estrutura do alerta (o que o responsável recebe × NÃO recebe)

### 7.1 Recebe (🧊) — alerta estruturado (`AnalysisResult` resumido)

```
✓ score (0–100)         ✓ nível / prioridade      ✓ categoria principal + demais categorias (%)
✓ período da janela     ✓ sinais (top 3)          ✓ frequência / recorrência
✓ escalada              ✓ sequência               ✓ combinação de sinais
✓ justificativa         ✓ recomendação de ação    ✓ metadados do modelo (mock/real)
```

Cada **sinal** exibido traz: título, descrição, severidade, confiança e nº de ocorrências.
A **explicação** (`ExplanationResult`) traz: `summary`, `topSignals` (3), `contextualFactors` e
`recommendedActions`.

**Recomendações de ação (⚙️):** base sempre presente (conversar com calma, entender o contexto,
avaliar com histórico) + ação de proteção **adicional** quando `level ∈ {high, critical}`
(bloqueio, denúncia, ajuda especializada).

### 7.2 NÃO recebe (🧊) — minimização

```
❌ conversa integral       ❌ histórico completo de mensagens
❌ cópia de imagens         ❌ áudio / transcrição integral
❌ conteúdo bruto desnecessário
```

O responsável vê o **`AnalysisResult` agregado**, jamais a `Conversation`. Decorre de P4, P7 e do
plaintext efêmero (§9). Cobre **RF-16**.

---

## 8. Hard negatives / falsos positivos

**Regra 8-a (🧊 como postura, ⚙️ como listas):** a heurística de MVP é **propensa a falsos
positivos**; o produto deve tratá-los explicitamente. Falso positivo e falso negativo são riscos
reconhecidos — por isso a decisão é **sempre humana** (P3) e existe **feedback loop** (§10).

Exemplos de **hard negatives** (contexto benigno que dispara sinais):

| Sinal disparado | Contexto benigno (hard negative) |
| --- | --- |
| `secrecy_request` | **Festa surpresa:** "não conta pra mamãe do bolo"; combinar presente-surpresa. |
| `image_request` | Foto pedida por **familiar/amigo conhecido**; foto do uniforme para grupo da escola. |
| `personal_information_*` | Compartilhar escola/nome em **grupo escolar legítimo** ou com contato já conhecido. |
| `insult` | **Brincadeira entre amigos** ("seu burro kkk") sem hostilidade ou repetição. |
| `self_harm` | "Quero **sumir** desse jogo", "vou **desistir** da fase" — sentido não literal. |
| `threat` | "Vou **contar** pra prof que você colou" — contexto escolar sem intimidação. |
| `age_probing` | Cadastro/registro legítimo pedindo idade. |

**Mitigações previstas (⚙️):**

1. **Janela contextual (~6h)** e **progressão** — sinal isolado sem escalada/combinação pesa menos.
2. **Relação entre interlocutores** — contato conhecido/familiar reduz suspeita (evolução: modelar
   `contactId` conhecido).
3. **Combinação + sequência** — grooming real tende a **combinar** sigilo + isolamento + pedido
   pessoal em progressão; ocorrência única e benigna não forma o padrão.
4. **Feedback do responsável** ("útil" / "falso positivo") alimenta a avaliação do modelo (§10).
5. **Confiança da LLM** — casos ambíguos entram com confiança baixa, reduzindo o score.

> **Regra 8-b (🧊):** um hard negative **não** deve, sozinho, produzir alerta de prioridade alta.
> A salvaguarda de `requiresGuardianAttention` por severidade alta (§6.6) é **intencional**
> (prefere-se falso positivo a falso negativo em segurança infantil), mas a **redação** ao
> responsável deve deixar claro que é um **ponto de partida para conversa**, não uma acusação.

---

## 9. Regras de privacidade

| Regra | Descrição | Selo |
| --- | --- | --- |
| **Plaintext efêmero** | O conteúdo bruto só existe em texto aberto **em memória, durante a análise**, e é descartado em seguida. Nada persiste a conversa em claro; o que sobra é o `AnalysisResult`. | 🧊 |
| **Minimização** | Coleta-se e retém-se o **mínimo necessário** para a finalidade; o responsável recebe evidências resumidas, não conteúdo bruto. | 🧊 |
| **Pseudonimização de PII** | Trechos sensíveis são substituídos por marcadores (ex.: `[TELEFONE]`, `[ESCOLA]`, `[ENDEREÇO]`, `[E-MAIL]`, `[LOCALIZAÇÃO]`) **antes** da análise; os trechos originais **não** são armazenados. | 🧊 (conceito) / ⚙️ (padrões) |
| **Padrões de PII** | `phone`, `email`, `address`, `school`, `location` (regex conceituais em `preprocess.ts`). Registra `PiiFinding` e produz `PrivacyReport { prepared, piiMinimized, pseudonymizedFields, protected }`. | ⚙️ |
| **Compactar antes de criptografar** | Ordem do pipeline: normaliza → **compacta** → particiona → **criptografa**. | 🧊 (ordem) |
| **Criptografia** | No MVP é **placeholder** (chave simétrica local / campo "protegido"); hardening com OCI Vault/KMS fica no roadmap. | ⚙️ / roadmap |
| **Postura de conformidade** | Não se afirma "LGPD compliant"; usa-se **"arquitetura preparada para requisitos de privacidade"**. Este documento não substitui parecer jurídico (LGPD / ECA Digital). | 🧊 |

Cobre **RF-04** (normalização) e **RF-07** (criptografia — simplificada no MVP).

---

## 10. Fluxo, cadência e feedback

| Regra | Valor | Selo |
| --- | --- | --- |
| Captura/processamento em **batch** | a cada **2h** (`BATCH`) | ⚙️ (RF-01, RF-03) |
| Nº de partições recuperadas | **N = 3** | ⚙️ (RF-09) |
| Janela de contexto | `N × BATCH ≈ 6h` (`WINDOW`) | ⚙️ (RF-10) |
| Checkpoint | processa **só o novo** desde `last_message_id`; evita duplicação/perda | 🧊 (conceito) (RF-02) |
| Máquina de estados | `RECEIVED → NORMALIZING → COMPRESSED → PARTITIONED → ENCRYPTED → PUBLISHED → CONTEXT_BUILDING → ANALYZING → RISK_EVALUATION → {DISCARDED \| ALERTED}` | 🧊 |
| Trilha de auditoria | `AuditEntry[]` com carimbo de tempo por etapa | 🧊 (RF-14) |
| Fonte de dados | mock (padrão) **ou** Telegram (ocasional) — mesmo tipo `Conversation` | 🧊 (P8) |
| Feedback loop | responsável marca útil / falso positivo → dataset de avaliação; **treinamento automático não é implementado no MVP** | ⚙️ |

---

## 11. Rastreabilidade RF-01…RF-16

| RF | Descrição | Onde neste documento |
| --- | --- | --- |
| RF-01 | Captura periódica (2h) | §10 |
| RF-02 | Checkpoint | §10 |
| RF-03 | Batch | §10 |
| RF-04 | Normalização | §9 |
| RF-05 | Compressão | §9 |
| RF-06 | Particionamento | §9, §10 |
| RF-07 | Criptografia (simplificada no MVP) | §9 |
| RF-08 | Processamento assíncrono (agendado) | §10 |
| RF-09 | Recuperação de N=3 partições | §10 |
| RF-10 | Reconstrução (janela ~6h) | §10 |
| RF-11 | Análise contextual | §1, §5 |
| RF-12 | Análise por pilares | §2 |
| RF-13 | Risk Engine | §5, §6 |
| RF-14 | Explicabilidade | §6.8, §7, §10 |
| RF-15 | Gerar alerta ao ultrapassar o limiar | §6.7 |
| RF-16 | Não expor a conversa integral | §1, §7 |

---

## 12. Resumo dos selos

**🧊 Congelados:** 3 pilares; contexto temporal; LLM interpreta / Risk Engine consolida; apoio à
decisão humana; alerta estruturado (nunca conversa integral); plaintext efêmero; minimização;
pseudonimização (conceito); score como indicador técnico; intenção de `requiresGuardianAttention`;
mesmo contrato mock/real; ordem compactar-antes-de-criptografar; postura de conformidade.

**⚙️ Configuráveis:** `BATCH`/`N`/`WINDOW`; todos os limiares (`RISK_LEVEL_THRESHOLDS`), pesos
(`SEVERITY_WEIGHTS`, `SCORE_FACTOR_PER_SIGNAL`, `ESCALATION_WEIGHT`, `COMBINATION_WEIGHT`,
`FREQUENCY_WEIGHT`), calibração (`MOCK_CALIBRATION`, confiança), bandas de prioridade, taxonomia e
catálogo de sinais, mapa sinal→categoria, padrões de PII, criptografia (placeholder → KMS).

---

← [Índice](README.md)
