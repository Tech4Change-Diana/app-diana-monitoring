/**
 * DIANA — Logger mínimo e leveled (stdout/stderr).
 *
 * Sem dependências; adequado a logs de container no MVP. Nunca registra a
 * conversa em claro — apenas metadados de execução.
 */
import type { LogLevel } from "./config/index.js";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function createLogger(level: LogLevel = "info"): Logger {
  const threshold = LEVEL_ORDER[level];

  const log = (lvl: LogLevel, msg: string, meta?: unknown) => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const line = `[${new Date().toISOString()}] ${lvl.toUpperCase()} ${msg}`;
    const stream = lvl === "error" || lvl === "warn" ? console.error : console.log;
    if (meta !== undefined) stream(line, meta);
    else stream(line);
  };

  return {
    debug: (m, meta) => log("debug", m, meta),
    info: (m, meta) => log("info", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),
  };
}
