# 03 — Comunicação com o Telegram (captura)

> Como a DIANA monitora as mensagens no MVP: um **bot do Telegram** em grupos/conversas de teste,
> capturando o que é novo e normalizando para o domínio da pipeline. É o módulo **`ingestor`** dentro de
> `app-diana-monitoring`.

← [Índice](README.md) · [Anterior: 02 — Pipeline](02-pipeline-background.md)

---

## Telegram é o ambiente de simulação (não o produto final)

Nesta fase, o Telegram é usado **como ambiente controlado para simular as conversas da criança**. Ele
oferece uma fonte de mensagens realista (texto, participantes, timestamps, sequência) para validar
captura, batches, particionamento, análise contextual e alertas — **antes** de qualquer integração nativa
com o sistema operacional de um celular.

> **Princípio congelado:** *"Telegram é uma ferramenta de simulação nesta fase, não necessariamente a
> fonte final do produto."* A arquitetura trata o Telegram como **um adaptador de entrada** substituível.

---

## Modo de captura: Bot API em grupos de teste

**Escolha do MVP: Telegram Bot API** (não cliente de usuário/MTProto).

- Um bot **DIANA** é criado via **@BotFather** e adicionado aos **grupos/conversas de teste**.
- O bot lê as mensagens desses grupos e as encaminha para a pipeline.
- É simples, estável e **dentro dos termos do Telegram** — adequado para simulação.

```mermaid
flowchart LR
    G["Grupo de teste no Telegram\n(criança + interlocutor simulados)"] --> BOT["Bot DIANA\n(Bot API)"]
    BOT -->|getUpdates (long-polling)| ING["ingestor\n(app-diana-monitoring)"]
    ING --> NORM["normaliza → ConversationMessage"]
    NORM --> PIPE["pipeline (doc 02)"]
```

### Detalhe operacional

- **Long-polling** com `getUpdates` em um processo simples de longa duração — **sem webhook e sem API
  Gateway** no MVP (menos peças, menos rede exposta).
- **Privacy mode do bot:** para o bot enxergar todas as mensagens do grupo (e não só comandos `/`),
  desabilita-se o *privacy mode* via BotFather **ou** o bot é admin do grupo. Isso é **explícito e
  controlado**, coerente com o ambiente de teste.
- **Ação real ocasional:** o volume esperado é baixo — a captura real acontece "de vez em quando"; a
  maior parte do tráfego da pipeline é mock (ver [`02`](02-pipeline-background.md)).

---

## Checkpoint (offset do Telegram)

A Bot API entrega um `update_id` crescente. O ingestor guarda o último processado e pede apenas o que veio
depois:

```text
getUpdates(offset = last_update_id + 1)
        ↓
mensagens novas  →  atualiza last_update_id  →  mapeia para last_message_id do checkpoint (doc 02)
```

Isso garante **capturar somente o que ainda não foi processado** (RF-02), sem duplicar nem perder.

---

## Normalização para o domínio

Cada mensagem do Telegram vira um `ConversationMessage` do contrato (ver [`contracts.md`](contracts.md)):

```jsonc
// Update do Telegram (simplificado)      →      ConversationMessage (domínio DIANA)
{
  "message": {
    "message_id": 1291,
    "date": 1789012800,
    "from": { "id": 55, "first_name": "..." },
    "chat": { "id": -1002, "type": "group" },
    "text": "Você mora onde?"
  }
}
```

```json
{
  "id": "MSG-1291",
  "author": "other",
  "text": "Você mora onde?",
  "timestamp": "2026-09-13T10:42:00Z"
}
```

Mapeamentos:

| Domínio DIANA | Origem no Telegram |
| --- | --- |
| `id` | `message_id` (prefixado `MSG-`) |
| `timestamp` | `date` (epoch → ISO 8601) |
| `author` (`child` \| `other`) | derivado do `from.id` — qual participante do grupo é a "criança" simulada é configurado por grupo |
| `text` | `text` |
| `conversation_id` | `chat.id` (prefixado `CONV-`) |

O ingestor **não altera o significado** da conversa; só padroniza IDs, timestamps, participantes, estrutura
e ordenação (RF-04).

---

## Minimização já na borda

Coerente com *privacy by design*, o ingestor:

- captura **apenas texto** relevante para a análise (no MVP não processa mídia, áudio, localização);
- **não persiste** o conteúdo bruto — apenas o repassa para o fluxo, que o mantém como *plaintext efêmero*;
- a **pseudonimização de PII** (telefone, e-mail, endereço, escola, localização) acontece na etapa de
  normalização/pré-processamento (`preprocess.ts`), logo em seguida.

---

## Configuração (variáveis de ambiente)

```bash
TELEGRAM_BOT_TOKEN=...          # do BotFather (segredo — Vault mínimo ou env; ver doc 06)
TELEGRAM_ALLOWED_CHAT_IDS=...   # ids dos grupos de teste permitidos
DIANA_CHILD_MEMBER_MAP=...      # qual participante de cada grupo é a "criança"
INGEST_MODE=mock|real|both      # fonte de dados (ver doc 02)
```

> **Nota de segurança:** o `TELEGRAM_BOT_TOKEN` dá controle total do bot. É o único segredo realmente
> sensível do ingestor no MVP e deve ficar fora do código (env/OCI Vault). Ver [`06-mapeamento-oci.md`](06-mapeamento-oci.md).

---

← [Índice](README.md) · [Próximo: 04 — LLM →](04-llm-inteligencia.md)
