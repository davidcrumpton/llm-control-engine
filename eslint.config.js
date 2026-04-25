// eslint.config.js — Flat Config for Node + TypeScript + Vitest

import js from "@eslint/js"
import ts from "typescript-eslint"
import globals from "globals"

export default [

  // ------------------------------------------------------------
  // JavaScript source files (NO TypeScript project mode)
  // ------------------------------------------------------------
  {
    files: ["src/**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-useless-escape": "off",
      "no-undef": "off"
    }
  },

  // ------------------------------------------------------------
  // TypeScript source files (WITH project mode)
  // ------------------------------------------------------------
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd()
      },
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      "@typescript-eslint": ts.plugin
    },
    rules: {
      ...ts.configs.recommended.rules,
      "no-useless-escape": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/no-unsafe-function-type": "off"
    }
  },

  // ------------------------------------------------------------
  // Test files (TypeScript + Vitest)
  // ------------------------------------------------------------
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd()
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.vitest
      }
    },
    plugins: {
      "@typescript-eslint": ts.plugin
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "no-undef": "off"
    }
  }
]
