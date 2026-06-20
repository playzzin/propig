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
    ".next-static-export/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "functions/lib/**",
    ".firebase/**",
    ".codex-review/**",
    ".agent/**",
    ".agents/**",
    ".playwright-mcp/**",
    ".tmp*/**",
    "android/app/build/**",
    "android/app/src/main/assets/**",
    "ios/App/App/public/**",
    "src/remotion.bak/**",
    "scripts/**",
    "patch_lint.js",
    "test-*.ts",
    "*.log",
    "*.tsbuildinfo",
  ]),
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
