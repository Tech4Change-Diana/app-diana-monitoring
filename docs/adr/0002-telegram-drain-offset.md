# ADR 0002 — Estratégia "drain" do Telegram e garantia de checkpoint

- **Status:** aceito (MVP / Fase 1)
- **Data:** 2026-09-13
- **Contexto:** ingestor do Telegram (`src/ingestor/telegram/telegramSource.ts`).
- **Relacionados:** [`docs/analise-tecnica-fase1.md`](../analise-tecnica-fase1.md) §5.3–5.4,
  [`docs/regras-de-negocio.md`](../regras-de-negocio.md) §10 (RF-02).

## Problema

A análise (§5.4) escolhe a estratégia **drain** para `--once`: a cada execução o ingestor chama
`getUpdates` em loop até esvaziar a fila e sai. O checkpoint (RF-02) diz para "processar só o novo desde
o último ponto" e para gravar o checkpoint "só após o batch concluir, evitando perder mensagens se o batch
falhar no meio".

Há uma tensão real: a **paginação** do `getUpdates` avança `offset = last_update_id + 1` a cada chamada,
e o próprio protocolo do Telegram **confirma (ack)** no servidor todos os updates com id menor que esse
offset. Ou seja, os updates já drenados são confirmados **durante** o batch — antes do `commit()`
pós-batch. Se o batch falhar depois de drenar mas antes de persistir os resultados, esses updates **não
serão reenviados** pelo Telegram.

## Decisão

Para o MVP, **aceitamos o trade-off** da estratégia drain:

- A paginação avança o offset em memória e o `commit()` persiste `last_update_id` **apenas após o batch
  concluir** — isso garante **continuidade entre execuções** (não reprocessar o que já foi processado),
  mas **não** é uma garantia transacional contra perda em falha no meio do batch.
- No volume baixo do MVP isso é aceitável e está documentado em §5.4-A.

O comportamento está sinalizado por comentário no código (`telegramSource.ts`).

## Consequências

- **Prós:** simples, compatível com `--once` + OCI Resource Scheduler; sem daemon nem broker.
- **Contras:** janela pequena de perda se o processo cair após drenar e antes de concluir o batch.

## Evolução (Fase 2)

Se a garantia "sem perda em falha no meio" se tornar necessária:

1. **Persistir os updates crus** (partições protegidas em Object Storage) **antes** de processá-los, de
   forma idempotente por `update_id`, e só então processar — o reprocessamento passa a ler do storage, não
   do Telegram.
2. Ou adotar o **modo daemon** (§5.4-B) com processamento próximo do tempo real e confirmação por lote
   menor.
