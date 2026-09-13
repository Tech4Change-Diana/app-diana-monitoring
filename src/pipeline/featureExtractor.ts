/**
 * DIANA — Extração de características.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/featureExtractor.ts`.
 *
 * Converte a conversa em features estruturadas usadas pelo analyzer/risk-engine.
 * As heurísticas regex (PT-BR) são uma abstração de MVP e NÃO representam um
 * modelo científico validado. Ver `docs/regras-de-negocio.md` §2.2.
 */
import type { Conversation, ConversationFeatures, MessageAuthor } from "../contracts/index.js";

export interface MessageMatch {
  messageId: string;
  author: MessageAuthor;
  text: string;
  signalKeys: string[];
}

export interface FeatureExtractionResult {
  features: ConversationFeatures;
  matches: MessageMatch[];
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9çãõáéíóúâêô ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Padrões heurísticos por tipo de sinal (mock). */
export const SIGNAL_PATTERNS: Record<string, RegExp[]> = {
  secrecy_request: [
    /n[aã]o\s+conta\s+pra\s+ning[ué]em/,
    /n[aã]o\s+conta\s+para\s+ning[ué]em/,
    /n[aã]o\s+fala\s+para\s+seus\s+pais/,
    /n[aã]o\s+fale\s+com/,
    /n[aã]o\s+conte\s+pra/,
    /segredo/,
    /escondido/,
    /fica\s+entre\s+n[oó]s/,
    /n[aã]o\s+mostro\s+pra\s+ning[ué]em/,
    /sem\s+contar\s+para/,
  ],
  image_request: [
    /foto\s+sua/,
    /me\s+manda\s+uma\s+foto/,
    /manda\s+uma\s+foto/,
    /me\s+envia\s+uma\s+foto/,
    /envia\s+uma\s+foto/,
    /uma\s+selfie/,
    /foto\s+pra\s+mim/,
    /te\s+ver\s+como\s+voc[eê]\s+[ée]/,
    /manda\s+a[ií]/,
  ],
  isolation_attempt: [
    /seu\s+pai\s+pode\s+ficar\s+bravo/,
    /seus\s+pais\s+v[aã]o\s+ficar/,
    /seus\s+pais\s+n[aã]o\s+(v[aã]o|podem|entender[aã]o)/,
    /n[aã]o\s+v[aã]o\s+entender/,
    /n[aã]o\s+pode\s+saber/,
    /n[aã]o\s+conta\s+para\s+seus\s+pais/,
    /n[aã]o\s+diga\s+a\s+seus\s+pais/,
  ],
  personal_information_request: [
    /qual\s+(a\s+)?sua\s+idade/,
    /qual\s+(a\s+)?sua\s+escola/,
    /estuda\s+em\s+qual/,
    /estudo\s+em\s+qual/,
    /seu\s+endere[çc]o/,
    /me\s+fala\s+seu\s+endere[çc]o/,
    /onde\s+voc[eê]\s+mora/,
    /seu\s+telefone/,
    /seu\s+sobrenome/,
    /seu\s+nome\s+completo/,
  ],
  personal_information_shared: [/escola\s+municipal/, /moro\s+na\s+rua/, /moro\s+no\s+bairro/],
  threat: [/amea/, /vou\s+contar/, /vai\s+se\s+arrepender/, /cala\s+a\s+boca/, /some\s+daqui/],
  insult: [
    /esquisito/,
    /nojento/,
    /feio/,
    /b[uú]rro/,
    /ning[ué]em\s+gosta\s+de\s+voc[eê]/,
    /sem\s+amigos/,
    /n[aã]o\s+tem\s+amigos/,
    /todo\s+mundo\s+(acha|z[oa]a)/,
  ],
  blackmail: [/se\s+voc[eê]\s+n[aã]o/, /eu\s+conto\s+para\s+todos/, /me\s+manda\s+se\s+n[aã]o/],
  sexual_language: [/nude/, /pelada/, /v[ií]deo\s+[ií]ntimo/, /foto\s+[ií]ntima/, /sem\s+roupa/],
  emotional_distress: [/para\s+com\s+isso/, /me\s+deixa\s+em\s+paz/, /n[aã]o\s+quero\s+mais/],
  self_harm: [/sumir/, /desistir/, /me\s+machucar/, /me\s+matar/, /acabar\s+com\s+tudo/],
};

export const SIGNAL_KEYS = Object.keys(SIGNAL_PATTERNS);

function extractForMessage(text: string): string[] {
  const normalized = normalize(text);
  const hits: string[] = [];
  for (const key of SIGNAL_KEYS) {
    const patterns = SIGNAL_PATTERNS[key];
    if (!patterns) continue;
    for (const re of patterns) {
      if (re.test(normalized)) {
        hits.push(key);
        break;
      }
    }
  }
  return hits;
}

export function extractFeatures(conversation: Conversation): FeatureExtractionResult {
  const matches: MessageMatch[] = conversation.messages.map((msg) => ({
    messageId: msg.id,
    author: msg.author,
    text: msg.text,
    signalKeys: extractForMessage(msg.text),
  }));

  const count = (key: string) =>
    matches.reduce((acc, m) => acc + (m.signalKeys.includes(key) ? 1 : 0), 0);

  const suspiciousMessageCount = matches.filter((m) => m.signalKeys.length > 0).length;

  // Escalada: sinais concentrados na segunda metade da conversa indicam
  // transição de "normal" para "preocupante".
  const total = matches.length;
  let escalation = 0;
  if (suspiciousMessageCount > 0 && total > 1) {
    let posSum = 0;
    let posCount = 0;
    matches.forEach((m, i) => {
      if (m.signalKeys.length > 0) {
        posSum += i / (total - 1);
        posCount += 1;
      }
    });
    const avgPos = posSum / posCount;
    escalation = Math.min(1, Math.max(0, avgPos * 1.6 - 0.3));
  }

  const features: ConversationFeatures = {
    secrecyRequests: count("secrecy_request"),
    imageRequests: count("image_request"),
    personalInfoRequests: count("personal_information_request"),
    isolationAttempts: count("isolation_attempt"),
    threats: count("threat"),
    insults: count("insult"),
    blackmailAttempts: count("blackmail"),
    sexualContentSignals: count("sexual_language"),
    emotionalDistressSignals: count("emotional_distress"),
    selfHarmSignals: count("self_harm"),
    messageCount: total,
    suspiciousMessageCount,
    conversationEscalation: escalation,
  };

  return { features, matches };
}
