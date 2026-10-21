import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // Readability
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-nested-ternary": "error",
      "no-else-return": "warn",
      "object-shorthand": "error",
      "prefer-template": "warn",

      // Complexity
      "max-depth": ["warn", 3],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  // Keep last to prevent formatting conflicts.
  eslintConfigPrettier,
]);

export default eslintConfig;
