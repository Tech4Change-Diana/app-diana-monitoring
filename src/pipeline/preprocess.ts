/**
 * DIANA — Camada de pré-processamento / privacidade.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/preprocess.ts` e adaptado
 * ao serviço de background.
 *
 * Princípio §9 (plaintext efêmero): o conteúdo bruto só existe em texto aberto
 * **em memória, durante a análise**. Por isso a DETECÇÃO de PII (`detectPii`) e a
 * PSEUDONIMIZAÇÃO (`pseudonymize*`) são operações SEPARADAS:
 *
 *  - `detectPii` apenas **inspeciona** o texto (não o altera) e produz o
 *    `PrivacyReport` + `PiiFinding[]`. NÃO deve realimentar texto mascarado na
 *    extração de sinais — mascarar antes da detecção destruiria justamente o
 *    pilar "captura de informação pessoal" (escola/endereço viram marcadores e
 *    a regex de sinal deixa de casar).
 *  - `pseudonymize*` mascara trechos sensíveis por marcadores (`[ESCOLA]`, ...)
 *    e deve ser aplicado **apenas ao que SAI da memória** (logs, trechos
 *    expostos ao responsável, eventual persistência) — nunca ao texto usado
 *    para detectar sinais.
 *
 * `PiiFinding` NÃO guarda o trecho original (minimização, P7): `snippet` é o
 * **marcador redigido**, não o valor sensível casado.
 */
import type {
  Conversation,
  ConversationMessage,
  PiiFinding,
  PrivacyReport,
} from "../contracts/index.js";

export interface PiiDetection {
  piiFindings: PiiFinding[];
  privacy: PrivacyReport;
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Padrões conceituais de PII. */
const PII_PATTERNS: { type: string; label: string; regex: RegExp }[] = [
  { type: "phone", label: "Telefone", regex: /(\d{2}[\s-]?\d{5}[\s-]?\d{4}|\d{4}[\s-]?\d{4})/ },
  { type: "email", label: "E-mail", regex: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ },
  { type: "address", label: "Endereço", regex: /(moro\s+na|rua|avenida|av\.|endere[çc]o)/ },
  { type: "school", label: "Escola", regex: /(escola|col[eé]gio|colegio|estudo\s+em|estuda\s+em)/ },
  { type: "location", label: "Localização", regex: /(bairro|moro|onde\s+voc[eê]\s+mora)/ },
];

const markerFor = (label: string): string => `[${label.toUpperCase()}]`;

/**
 * Inspeciona a conversa e produz o relatório de privacidade + achados de PII.
 * NÃO altera o texto (a detecção de sinais roda sobre o texto original em
 * memória). `snippet` guarda apenas o marcador redigido — nunca o valor bruto.
 */
export function detectPii(conversation: Conversation): PiiDetection {
  const piiFindings: PiiFinding[] = [];
  const pseudonymizedFields = new Set<string>();

  for (const msg of conversation.messages) {
    const normalizedText = normalize(msg.text);
    for (const pattern of PII_PATTERNS) {
      if (pattern.regex.test(normalizedText)) {
        pseudonymizedFields.add(pattern.type);
        piiFindings.push({
          messageId: msg.id,
          type: pattern.type,
          // Marcador redigido — o trecho original NÃO é armazenado (§9 / P7).
          snippet: markerFor(pattern.label),
          pseudonymized: true,
        });
      }
    }
  }

  const hasPii = piiFindings.length > 0;
  const privacy: PrivacyReport = {
    prepared: true,
    piiMinimized: hasPii,
    pseudonymizedFields: Array.from(pseudonymizedFields),
    protected: true,
  };

  return { piiFindings, privacy };
}

/** Mascara trechos sensíveis por marcadores. Use apenas no que SAI da memória. */
export function pseudonymizeText(text: string): string {
  let out = text;
  for (const pattern of PII_PATTERNS) {
    out = out.replace(new RegExp(pattern.regex.source, "gi"), () => markerFor(pattern.label));
  }
  return out.trim();
}

/** Versão em lote de `pseudonymizeText` para uma lista de mensagens. */
export function pseudonymizeMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((msg) => ({ ...msg, text: pseudonymizeText(msg.text) }));
}
