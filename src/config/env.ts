/**
 * DIANA — Leitura e validação das variáveis de ambiente (zod).
 *
 * Falha rápido no boot com mensagem clara se algo essencial faltar
 * (ex.: `INGEST_MODE=real` sem `TELEGRAM_BOT_TOKEN`). Ver
 * `docs/analise-tecnica-fase1.md` §5.6.
 */
import { z } from "zod";

export type IngestMode = "mock" | "real" | "both";
export type AnalyzerMode = "mock" | "oci";
export type StateBackend = "file" | "oci";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  ingestMode: IngestMode;
  analyzerMode: AnalyzerMode;
  stateBackend: StateBackend;
  logLevel: LogLevel;

  batchHours: number;
  windowPartitions: number;

  telegram: {
    botToken: string | null;
    allowedChatIds: string[];
    childMemberMap: Record<string, string>;
    pollTimeoutSeconds: number;
  };

  state: {
    dir: string;
    ociBucket: string;
    ociNamespace: string;
  };
}

/** CSV -> lista de strings não-vazias (trim). */
function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** JSON de mapa chatId -> userId. Aceita vazio/`{}`. */
function parseJsonMap(value: string | undefined, varName: string): Record<string, string> {
  if (!value || value.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${varName} deve ser um JSON válido (mapa chatId->userId). Recebido: ${value}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${varName} deve ser um objeto JSON (mapa chatId->userId).`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k] = String(v);
  }
  return out;
}

const rawSchema = z.object({
  INGEST_MODE: z.enum(["mock", "real", "both"]).default("mock"),
  ANALYZER_MODE: z.enum(["mock", "oci"]).default("mock"),
  STATE_BACKEND: z.enum(["file", "oci"]).default("file"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  BATCH_HOURS: z.coerce.number().positive().default(2),
  WINDOW_PARTITIONS: z.coerce.number().int().positive().default(3),

  TELEGRAM_BOT_TOKEN: z.string().trim().min(1).optional(),
  TELEGRAM_ALLOWED_CHAT_IDS: z.string().optional(),
  DIANA_CHILD_MEMBER_MAP: z.string().optional(),
  TELEGRAM_POLL_TIMEOUT_SECONDS: z.coerce.number().int().min(0).default(0),

  STATE_DIR: z.string().default("./.state"),
  OCI_OS_BUCKET: z.string().default("diana-monitoring"),
  OCI_OS_NAMESPACE: z.string().default(""),
});

/**
 * Carrega e valida a configuração a partir de um objeto de env
 * (default: `process.env`). Lança `Error` com mensagem legível se inválido.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  const e = parsed.data;

  const config: AppConfig = {
    ingestMode: e.INGEST_MODE,
    analyzerMode: e.ANALYZER_MODE,
    stateBackend: e.STATE_BACKEND,
    logLevel: e.LOG_LEVEL,
    batchHours: e.BATCH_HOURS,
    windowPartitions: e.WINDOW_PARTITIONS,
    telegram: {
      botToken: e.TELEGRAM_BOT_TOKEN ?? null,
      allowedChatIds: parseCsv(e.TELEGRAM_ALLOWED_CHAT_IDS),
      childMemberMap: parseJsonMap(e.DIANA_CHILD_MEMBER_MAP, "DIANA_CHILD_MEMBER_MAP"),
      pollTimeoutSeconds: e.TELEGRAM_POLL_TIMEOUT_SECONDS,
    },
    state: {
      dir: e.STATE_DIR,
      ociBucket: e.OCI_OS_BUCKET,
      ociNamespace: e.OCI_OS_NAMESPACE,
    },
  };

  validateCrossFields(config);
  return config;
}

function validateCrossFields(config: AppConfig): void {
  const errors: string[] = [];

  const usesTelegram = config.ingestMode === "real" || config.ingestMode === "both";
  if (usesTelegram) {
    if (!config.telegram.botToken) {
      errors.push("INGEST_MODE=real|both exige TELEGRAM_BOT_TOKEN.");
    }
    if (config.telegram.allowedChatIds.length === 0) {
      errors.push("INGEST_MODE=real|both exige TELEGRAM_ALLOWED_CHAT_IDS (CSV não vazio).");
    }
  }

  if (config.stateBackend === "oci" && !config.state.ociNamespace) {
    errors.push("STATE_BACKEND=oci exige OCI_OS_NAMESPACE.");
  }

  if (config.analyzerMode === "oci") {
    errors.push(
      "ANALYZER_MODE=oci ainda não está disponível neste repositório " +
        "(o OciGenAiRiskAnalyzer nasce em app-diana-llm-analyzer). Use ANALYZER_MODE=mock.",
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuração de ambiente inválida:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}
