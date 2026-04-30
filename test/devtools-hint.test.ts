import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests for the runtime's one-time dev-mode DevTools install hint.
 * The module reads `window` / `localStorage` / `sessionStorage` /
 * `process.env` — we set up a JSDOM-like global stage before each test.
 */

interface FakeStorage { [key: string]: string }
interface TestEnv {
  console:        { log: ReturnType<typeof vi.fn>; logged: unknown[][] };
  localStorage:   FakeStorage;
  sessionStorage: FakeStorage;
}

function setupEnv(opts: { hostname?: string; nodeEnv?: string } = {}): TestEnv {
  const env: TestEnv = { console: { log: vi.fn(), logged: [] }, localStorage: {}, sessionStorage: {} };
  env.console.log.mockImplementation((...a: unknown[]) => { env.logged.push(a); });

  const fakeStorage = (bag: FakeStorage): Storage => ({
    getItem: (k: string) => bag[k] ?? null,
    setItem: (k: string, v: string) => { bag[k] = v; },
    removeItem: (k: string) => { delete bag[k]; },
    clear: () => { for (const k of Object.keys(bag)) delete bag[k]; },
    key: (i: number) => Object.keys(bag)[i] ?? null,
    get length() { return Object.keys(bag).length; },
  });

  (globalThis as Record<string, unknown>).window = {
    console:        env.console,
    localStorage:   fakeStorage(env.localStorage),
    sessionStorage: fakeStorage(env.sessionStorage),
    location:       { hostname: opts.hostname ?? "localhost" },
  };
  // Set process.env.NODE_ENV explicitly. vitest's default is "test",
  // which our heuristic treats as non-production → dev. We make the
  // tests opt in:
  //   nodeEnv: "development" → log
  //   nodeEnv: "production"  → don't log
  //   nodeEnv: undefined     → leave NODE_ENV unset so the hostname
  //                            fallback gets a chance.
  if (opts.nodeEnv === undefined) {
    (globalThis as Record<string, unknown>).process = { env: {} };
  } else {
    (globalThis as Record<string, unknown>).process = { env: { NODE_ENV: opts.nodeEnv } };
  }
  return env;
}

// Import the module ONCE and call its test-only reset between tests.
// (vitest's TS transformer doesn't accept cache-bust query strings, and
// re-importing the same path returns the cached module anyway.)
import * as hint from "../src/runtime/devtools-hint";

async function reload(): Promise<typeof hint> {
  hint._resetForTest();
  return hint;
}

describe("maybeShowDevtoolsHint", () => {
  let realWindow: unknown, realProcess: unknown;
  beforeEach(() => {
    realWindow  = (globalThis as Record<string, unknown>).window;
    realProcess = (globalThis as Record<string, unknown>).process;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).window  = realWindow;
    (globalThis as Record<string, unknown>).process = realProcess;
  });

  it("logs once in dev mode (localhost)", async () => {
    const env = setupEnv({ hostname: "localhost", nodeEnv: "development" });
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).toHaveBeenCalledTimes(1);
    const callArgs = env.console.log.mock.calls[0] as unknown[];
    const merged = callArgs.map(String).join(" ");
    expect(merged).toMatch(/traceless-style/);
    expect(merged).toMatch(/devtools/);
  });

  it("does NOT log a second time in the same session", async () => {
    const env = setupEnv({ hostname: "localhost", nodeEnv: "development" });
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    maybeShowDevtoolsHint();
    maybeShowDevtoolsHint();
    expect(env.console.log).toHaveBeenCalledTimes(1);
  });

  it("does NOT log when NODE_ENV=production", async () => {
    const env = setupEnv({ hostname: "localhost", nodeEnv: "production" });
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).not.toHaveBeenCalled();
  });

  it("logs on private IPs (heuristic dev detection)", async () => {
    const env = setupEnv({ hostname: "192.168.1.42" });
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).toHaveBeenCalledTimes(1);
  });

  it("does NOT log on public hostnames without NODE_ENV", async () => {
    const env = setupEnv({ hostname: "example.com" });
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).not.toHaveBeenCalled();
  });

  it("respects the localStorage opt-out", async () => {
    const env = setupEnv({ hostname: "localhost", nodeEnv: "development" });
    env.localStorage["traceless-style:no-devtools-hint"] = "1";
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).not.toHaveBeenCalled();
  });

  it("skips when the DevTools extension is detected", async () => {
    const env = setupEnv({ hostname: "localhost", nodeEnv: "development" });
    (((globalThis as Record<string, unknown>).window) as { __TRACELESS_DEVTOOLS__?: boolean }).__TRACELESS_DEVTOOLS__ = true;
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).not.toHaveBeenCalled();
  });

  it("does NOT log a second time across reloads if sessionStorage flag is set", async () => {
    const env = setupEnv({ hostname: "localhost", nodeEnv: "development" });
    env.sessionStorage["traceless-style:devtools-hinted"] = "1";
    const { maybeShowDevtoolsHint } = await reload();
    maybeShowDevtoolsHint();
    expect(env.console.log).not.toHaveBeenCalled();
  });

  it("never throws if storage access fails", async () => {
    setupEnv({ hostname: "localhost", nodeEnv: "development" });
    // Replace the storage getter with one that throws.
    const w = (globalThis as Record<string, unknown>).window as { localStorage: Storage };
    Object.defineProperty(w, "localStorage", {
      get() { throw new Error("private mode"); },
      configurable: true,
    });
    const { maybeShowDevtoolsHint } = await reload();
    expect(() => maybeShowDevtoolsHint()).not.toThrow();
  });
});
