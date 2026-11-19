import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const boothTimeMessage =
  "Format dates with createBoothDateTimeFormat, formatDate, or formatDateTime from @/lib/i18n/intl so they render booth (Vietnam) time on every host.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**", "components/**", "lib/**"],
    ignores: ["lib/i18n/intl.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(NewExpression, CallExpression)[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message: boothTimeMessage,
        },
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]",
          message: boothTimeMessage,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".worktrees/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
