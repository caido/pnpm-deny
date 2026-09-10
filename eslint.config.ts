import { defaultConfig } from "@caido/eslint-config";

export default [
  ...defaultConfig({
    compat: false,
    vue: false,
  }),
  {
    ignores: [
      "**/bin/**",
      "fixtures/**",
      "dist/**",
      "**/dist/**",
      ".agents/**",
      ".claude/**",
      ".cursor/**",
      "coverage/**",
      ".gh-workflow-logs/**",
    ],
  },
];
