import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".claude/**",
    ".next/**",
    ".worktrees/**",
    "coverage/**",
    "node_modules/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "worktrees/**",
  ]),
]);
