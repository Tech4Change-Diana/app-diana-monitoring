/**
 * DIANA — Camada de pré-processamento / privacidade.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/preprocess.ts`.
 *
 * Normaliza texto, identifica PII, pseudonimiza e prepara os dados antes da
 * análise. Nenhum trecho sensível original é armazenado — apenas marcadores
 * (`[TELEFONE]`, `[ESCOLA]`, ...). Ver `docs/regras-de-negocio.md` §9.
 */
import type {
  Conversation,
  ConversationMessage,
  PiiFinding,
  PrivacyReport,
} from "../contracts/index.js";

export interface PreparedConversation {
  conversation: Conversation;
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

export function preprocessConversation(conversation: Conversation): PreparedConversation {
  const piiFindings: PiiFinding[] = [];
  const pseudonymizedFields = new Set<string>();

  const messages: ConversationMessage[] = conversation.messages.map((msg) => {
    const raw = msg.text;
    const normalizedText = normalize(raw);

    for (const pattern of PII_PATTERNS) {
      const match = pattern.regex.exec(normalizedText);
      if (match) {
        pseudonymizedFields.add(pattern.type);
        piiFindings.push({
          messageId: msg.id,
          type: pattern.type,
          snippet: match[0],
          pseudonymized: true,
        });
        // Ignora o trecho encontrado (não armazenamos os dados originais).
      }
    }

    // Pseudonimização conceitual: substitui trechos sensíveis por marcadores.
    let text = raw;
    for (const pattern of PII_PATTERNS) {
      text = text.replace(
        new RegExp(pattern.regex.source, "gi"),
        () => `[${pattern.label.toUpperCase()}]`,
      );
    }

    return { ...msg, text: text.trim() };
  });

  const hasPii = piiFindings.length > 0;

  const privacy: PrivacyReport = {
    prepared: true,
    piiMinimized: hasPii,
    pseudonymizedFields: Array.from(pseudonymizedFields),
    protected: true,
  };

  return {
    conversation: { ...conversation, messages },
    piiFindings,
    privacy,
  };
}
