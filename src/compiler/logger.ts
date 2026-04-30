/**
 * traceless-style — logger.ts
 *
 * Structured leveled logger for the build-time pipeline. Modeled on the
 * loggers ESLint, Vite, esbuild, and pnpm ship: env-driven verbosity,
 * stable log shape, ANSI color when stdout is a TTY, machine-readable
 * JSON output for CI.
 *
 * ENV CONTROLS
 * ────────────
 *   TRACELESS_STYLE_LOG          silent | error | warn | info | debug | trace
 *                                  default: "info" (production) / "debug" (DEV=true)
 *   TRACELESS_STYLE_LOG_FORMAT   text | json
 *                                  default: "text" when stdout is a TTY, "json" in CI
 *   TRACELESS_STYLE_LOG_COLOR    auto | always | never
 *                                  default: "auto" — color when isTTY && !NO_COLOR
 *   NO_COLOR                     standard — disables ANSI color
 *   CI                           any truthy — disables color, defaults format=json
 *
 * USAGE
 * ─────
 *   import { logger } from "./logger";
 *   logger.info("[extract] scanned %s files in %dms", files.length, ms);
 *   logger.warn("[contrast] %d issues found", count);
 *   const stop = logger.time("ast-walk");
 *   ... work ...
 *   stop();   // emits "[trace] ast-walk took 12.4 ms"
 *
 * GUARANTEES
 * ──────────
 *   - Never throws. Every log call is wrapped — a misbehaving downstream
 *     (broken stdout pipe, etc.) silently no-ops.
 *   - Deterministic ordering. All output goes through ONE writer
 *     function so concurrent async work doesn't interleave mid-line.
 *   - Telemetry-free. Local stdout/stderr only.
 */

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";
export type LogFormat = "text" | "json";

/* ── Level numeric ordering ───────────────────────────────────── */

const ORDER: Record<LogLevel, number> = {
  silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5,
};

/* ── ANSI codes (no chalk dependency) ─────────────────────────── */

const C = {
  reset:  "\x1b[0m",
  dim:    "\x1b[2m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  gray:   "\x1b[90m",
} as const;

/* ── Configuration (read once, observable via reload) ──────────── */

interface LoggerConfig {
  level:  LogLevel;
  format: LogFormat;
  color:  boolean;
}

let _cfg: LoggerConfig | null = null;

function readEnv(): LoggerConfig {
  const env = (typeof process !== "undefined" && process.env) ? process.env : {};
  const level = (() => {
    const v = (env.TRACELESS_STYLE_LOG ?? "").toLowerCase();
    if (v in ORDER) return v as LogLevel;
    return env.DEV === "true" ? "debug" : "info";
  })();
  const isCI = Boolean(env.CI);
  const isTTY = !!(typeof process !== "undefined" && process.stdout && process.stdout.isTTY);
  const format = (() => {
    const v = (env.TRACELESS_STYLE_LOG_FORMAT ?? "").toLowerCase();
    if (v === "text" || v === "json") return v;
    return isCI ? "json" : "text";
  })();
  const color = (() => {
    if (env.NO_COLOR)             return false;
    const v = (env.TRACELESS_STYLE_LOG_COLOR ?? "auto").toLowerCase();
    if (v === "always") return true;
    if (v === "never")  return false;
    return isTTY && !isCI;
  })();
  return { level, format, color };
}

function cfg(): LoggerConfig {
  if (_cfg) return _cfg;
  try { _cfg = readEnv(); } catch { _cfg = { level: "info", format: "text", color: false }; }
  return _cfg;
}

/** Force re-read of env vars (mostly for tests). */
export function _resetLogger(): void { _cfg = null; }

/* ── Writers ──────────────────────────────────────────────────── */

function isEnabled(level: LogLevel): boolean {
  return ORDER[level] <= ORDER[cfg().level];
}

interface LogRecord {
  ts:     string;
  level:  LogLevel;
  msg:    string;
  data?:  Record<string, unknown>;
}

function emit(record: LogRecord): void {
  try {
    const c = cfg();
    if (c.format === "json") {
      const line = JSON.stringify(record);
      const stream = record.level === "error" || record.level === "warn" ? process.stderr : process.stdout;
      stream.write(line + "\n");
      return;
    }
    const tag = formatTag(record.level, c.color);
    const ts  = c.color ? `${C.gray}${record.ts}${C.reset}` : record.ts;
    const stream = record.level === "error" || record.level === "warn" ? process.stderr : process.stdout;
    stream.write(`${tag} ${ts}  ${record.msg}\n`);
    if (record.data) {
      for (const [k, v] of Object.entries(record.data)) {
        stream.write(`  ${c.color ? C.gray + k + C.reset : k}: ${formatValue(v)}\n`);
      }
    }
  } catch { /* never throw from a logger */ }
}

function formatTag(level: LogLevel, color: boolean): string {
  const labels: Record<LogLevel, string> = {
    silent: "      ", error: "ERROR ", warn: "WARN  ", info: "INFO  ",
    debug: "DEBUG ", trace: "TRACE ",
  };
  const tag = labels[level];
  if (!color) return `[${tag.trim()}]`.padEnd(8);
  switch (level) {
    case "error": return `${C.bold}${C.red}    ✗${C.reset}`;
    case "warn":  return `${C.bold}${C.yellow}    ⚠${C.reset}`;
    case "info":  return `${C.bold}${C.cyan}    ℹ${C.reset}`;
    case "debug": return `${C.dim}    ·${C.reset}`;
    case "trace": return `${C.dim}    ${C.reset}`;
    default:      return "    ";
  }
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

/* ── Public API ───────────────────────────────────────────────── */

function build(level: LogLevel) {
  return (msg: string, data?: Record<string, unknown>): void => {
    if (!isEnabled(level)) return;
    emit({ ts: stamp(), level, msg, data });
  };
}

export const logger = {
  error: build("error"),
  warn:  build("warn"),
  info:  build("info"),
  debug: build("debug"),
  trace: build("trace"),

  /**
   * Performance timer. Returns a stop callback that emits a trace line
   * with elapsed milliseconds. Cheap when level < trace (no Date.now
   * call), so leaving these in production code is fine.
   */
  time(label: string): () => void {
    if (!isEnabled("trace")) return () => {};
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    return () => {
      const t1 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      emit({ ts: stamp(), level: "trace", msg: `${label} took ${(t1 - t0).toFixed(2)} ms` });
    };
  },

  /** Read the active level (mostly for diagnostic-emitter heuristics). */
  level(): LogLevel { return cfg().level; },
} as const;

export type Logger = typeof logger;
