import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// Dev: /api is proxied to the Express backend (override target with VITE_PROXY_TARGET in a local .env file, which is git-ignored).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": process.env.VITE_PROXY_TARGET ?? "http://localhost:3000" } },
  test: { environment: "node", include: ["tests/**/*.test.ts"],
    // Coverage covers the logic layer only (services); screens are not rendered in unit tests.
    coverage: { provider: "v8", include: ["src/services/**"], exclude: ["src/services/api.mock.ts", "src/services/api.ts", "src/services/contract.ts"], reporter: ["text"] } },
});
