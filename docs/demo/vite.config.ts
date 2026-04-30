import { defineConfig } from "vite";
import react           from "@vitejs/plugin-react";
import { tracelessStyle } from "traceless-style/vite";

export default defineConfig({
  plugins: [
    tracelessStyle({ srcDir: "src" }),
    react(),
  ],
  server: { port: 5173 },
});
