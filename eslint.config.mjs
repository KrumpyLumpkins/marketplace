import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "storybook-static/**",
      "packages/*/dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".context/**", ".playwright-cli/**", "coverage/**", "output/**", "test-results/**", "playwright-report/**", "contracts/**/target/**",
  ]),
]);

export default eslintConfig;
