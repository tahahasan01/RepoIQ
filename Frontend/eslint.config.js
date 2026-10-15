import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A missing dependency is how stale closures get in (a handler reading
      // the state of an earlier render), so this blocks CI rather than warns.
      // Where a dependency is deliberately left out, say why in a disable
      // comment on that line.
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Unused code hides real mistakes (a value computed and then never
      // used, a hook result ignored). Prefix with _ to keep one on purpose.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Tracked debt, not an accepted pattern: the API layer and the pages
      // that consume it still pass untyped backend payloads around as `any`
      // (~200 sites). Warn so new code is nudged towards real types without
      // failing CI on the backlog; flip back to "error" once the API client
      // returns typed responses.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
