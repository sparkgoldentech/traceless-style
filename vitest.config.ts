import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The /extension directory is a self-contained sub-package with its own
    // tests written for `node:test` (since extension authors can't pull a
    // vitest dependency into the VSIX bundle). Excluding it here keeps the
    // library's vitest run from trying to discover suites in those files.
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules", "dist", "extension/**"],
  },
});
