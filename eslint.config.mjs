import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// @proxygate/sdk lint baseline (CI-health, 2026-05-19).
// typescript-eslint `recommended` (non-type-checked) — the canonical
// best-practice entry point: fast, deterministic, zero false-positive
// churn on a stable published SDK. Genuine issues are fixed in source;
// no rule is downgraded to hide a real bug.
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Idiomatic "intentionally unused" marker: a leading underscore.
      // Lets deliberate type-reference holders and unused params stay
      // explicit instead of being deleted.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Test files: relax the unbound-context / non-null heuristics that
    // are noise in vitest specs (mocks, fixtures, `!` on known data).
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
