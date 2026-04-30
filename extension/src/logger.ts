/**
 * traceless-style VS Code extension — logger.ts
 *
 * Structured logging to a single output channel. Levels, timestamps,
 * provider-aware tags, and lightweight performance timers — the same
 * shape Pylance / ESLint / Tailwind IntelliSense use, so users who
 * already know those extensions feel at home in our output.
 *
 *   View → Output → traceless-style
 *
 *   trace                "off" (default) suppresses info+trace lines.
 *                        "messages" enables info. "verbose" enables trace.
 *                        WARN and ERROR always emit so users never miss
 *                        actual problems.
 *
 * Privacy: telemetry-free. The logger writes to the LOCAL output channel
 * only; no network, no analytics, no remote sink. The trace level
 * controls verbosity, never destination.
 *
 * Robustness: every log function is wrapped in `try` so a misbehaving
 * downstream (e.g. VS Code disposed channel during shutdown) can never
 * crash the caller. The same goes for the perf-timer's stop callback —
 * it's safe to call after the extension deactivates.
 */

import * as vscode from "vscode";

type Level = "off" | "messages" | "verbose";

let channel: vscode.OutputChannel | undefined;
let cachedLevel: Level | null = null;

function getChannel(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel("traceless-style");
  return channel;
}

/* The level can change mid-session via Settings; we cache for the
 * common case (60+ providers × 60 keys/sec) and invalidate when the user
 * flips it. The listener is registered the first time we read the level. */
function level(): Level {
  if (cachedLevel === null) {
    cachedLevel = readLevel();
    try {
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("traceless-style.trace")) cachedLevel = null;
      });
    } catch { /* extension host shutting down — ignore */ }
  }
  return cachedLevel;
}

function readLevel(): Level {
  try {
    const v = vscode.workspace.getConfiguration("traceless-style").get<string>("trace") ?? "off";
    if (v === "messages" || v === "verbose") return v;
  } catch { /* config not yet available */ }
  return "off";
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

/* ── Public log API ──────────────────────────────────────────────── */

/** Always emitted — for actual problems the user should see. */
export function error(msg: string, err?: unknown): void {
  try {
    const ch = getChannel();
    ch.appendLine(`[error ${stamp()}] ${msg}`);
    if (err instanceof Error) {
      if (err.stack) ch.appendLine(err.stack);
      else ch.appendLine(`  ${err.name}: ${err.message}`);
    } else if (err !== undefined) {
      ch.appendLine(`  ${String(err)}`);
    }
  } catch { /* never throw from a logger */ }
}

/** Always emitted — degraded behavior the user might want to know about. */
export function warn(msg: string): void {
  try {
    // Reuse channel only if it already exists; never auto-create on a
    // warning so we don't surprise users with the output panel popping
    // open the first time something noteworthy happens.
    if (!channel) channel = vscode.window.createOutputChannel("traceless-style");
    channel.appendLine(`[warn  ${stamp()}] ${msg}`);
  } catch { /* never throw from a logger */ }
}

/** Emitted when level >= "messages". Lifecycle and command runs. */
export function info(msg: string): void {
  if (level() === "off") return;
  try { getChannel().appendLine(`[info  ${stamp()}] ${msg}`); } catch {}
}

/** Emitted when level === "verbose". Per-call timings and noisy details. */
export function trace(msg: string): void {
  if (level() !== "verbose") return;
  try { getChannel().appendLine(`[trace ${stamp()}] ${msg}`); } catch {}
}

/**
 * Performance timer. Returns a callback you call when the work is
 * complete — emits a trace line with elapsed milliseconds:
 *
 *   const stop = time("hover.provideHover");
 *   const result = doExpensiveWork();
 *   stop();   // → "[trace …] hover.provideHover took 1.42 ms"
 *
 * Always cheap when level !== verbose (no Date.now call), so leaving
 * timers in production code is fine.
 */
export function time(label: string): () => void {
  if (level() !== "verbose") return () => {};
  const t0 = performance.now();
  return () => {
    try { getChannel().appendLine(`[trace ${stamp()}] ${label} took ${(performance.now() - t0).toFixed(2)} ms`); }
    catch {}
  };
}

/** Open the output channel (wired to a command). */
export function showChannel(): void {
  try { getChannel().show(true); } catch {}
}
