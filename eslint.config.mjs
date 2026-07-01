import obsidianmd from "eslint-plugin-obsidianmd";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default [
  {
    // These are build/config scripts, not plugin source — keep them
    // out of the typed-linting pass entirely so rules that require
    // type information don't crash on files outside tsconfig's scope.
    ignores: [
      "main.js",
      "node_modules/**",
      "eslint.config.mjs",
      "esbuild.config.mjs",
      "version-bump.mjs",
      "*.mjs",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // The actual dashboard review doesn't flag these — turn them
      // off so local CI output matches the real automated review.
      "obsidianmd/ui/sentence-case": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  {
    // main.ts intentionally uses the Function constructor to execute
    // user-authored code blocks from ```js-run fences — that's this
    // plugin's entire purpose. The reported rule is actually
    // obsidianmd/rule-custom-message (a wrapper that re-labels core
    // rules like no-new-func with a custom message) — turning off
    // "no-new-func" itself has no effect since that's not the rule ID
    // ESLint is actually running here. Scope the real rule off for
    // this file only.
    files: ["main.ts"],
    rules: {
      "obsidianmd/rule-custom-message": "off",
    },
  },
];
