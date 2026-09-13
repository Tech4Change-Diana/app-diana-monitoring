/**
 * DIANA — Limiares e calibração do Risk Engine.
 *
 * Portado de `app-diana-monitoring-lading-page/src/ml/thresholds.ts`.
 *
 * ⚠️ MOCK / HEURÍSTICA DE MVP
 * Os valores abaixo são heurísticas de demonstração. NÃO representam um modelo
 * científico validado. Serão substituídos por limiares reais após treinamento,
 * avaliação (precision/recall/F1/AUROC) e validação com dados anotados.
 * Ver `docs/regras-de-negocio.md` §6.
 */

export const RISK_LEVEL_THRESHOLDS = {
  none: 0,
  low: 5,
  medium: 20,
  high: 55,
  critical: 80,
} as const;

/** Peso de cada severidade na pontuação do Risk Engine. */
export const SEVERITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

/** Fator base por sinal relevante no cálculo do score (0–100). */
export const SCORE_FACTOR_PER_SIGNAL = 8;

/** Contribuição máxima da escalada da conversa. */
export const ESCALATION_WEIGHT = 15;

/** Contribuição máxima da combinação de sinais simultâneos. */
export const COMBINATION_WEIGHT = 8;

/** Contribuição de recorrência (mesmo sinal em várias mensagens). */
export const FREQUENCY_WEIGHT = 6;

/** Piso/saída de confiança simulada do "modelo" (apenas mock). */
export const CONFIDENCE_FLOOR = 0.6;
export const CONFIDENCE_CEILING = 0.97;
export const CONFIDENCE_STEP = 0.07;

/**
 * Calibração adicional por tipo de sinal (somente mock).
 * Ex.: pedidos diretos de imagem recebem peso extra, pois são o gatilho
 * mais explícito no protótipo.
 */
export const MOCK_CALIBRATION: Partial<Record<string, number>> = {
  image_request: 0.35,
  secrecy_request: 0.1,
  isolation_attempt: 0.15,
  insult: 0.2,
  personal_information_request: 0.15,
};

export const MOCK_NOTICE =
  "Indicadores técnicos simulados (MOCK). A análise automatizada é um mecanismo de apoio e não substitui avaliação humana.";
