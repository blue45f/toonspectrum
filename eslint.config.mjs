import reactCompiler from 'eslint-plugin-react-compiler';
import reactHooks from 'eslint-plugin-react-hooks';
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const browserGlobals = {
  AbortController: "readonly",
  console: "readonly",
  document: "readonly",
  Event: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  HTMLInputElement: "readonly",
  HTMLElement: "readonly",
  KeyboardEvent: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  Request: "readonly",
  Response: "readonly",
  StorageEvent: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  AbortController: "readonly",
  Buffer: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

const eslintConfig = defineConfig([
  globalIgnores(["dist/**", "apps/api/dist/**", "node_modules/**"]),
  {
    files: ["**/*.{js,mjs}"],
    ...js.configs.recommended,
    languageOptions: {
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        React: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      'react-hooks': reactHooks,
      'react-compiler': reactCompiler
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-compiler/react-compiler': 'error'
    }
  }]);

export default eslintConfig;
