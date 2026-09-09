import { describe, expect, it } from "vitest";

import { ConfigError, parseDenyConfig } from "./config.js";

describe("parseDenyConfig", () => {
  it("applies defaults for an empty mapping", () => {
    const config = parseDenyConfig({}, undefined);
    expect(config.licenses.allow).toEqual([]);
    expect(config.licenses.includeDev).toBe(false);
    expect(config.sources.allowRegistry).toEqual([
      "https://registry.npmjs.org/",
    ]);
  });

  it("parses kebab-case license fields", () => {
    const config = parseDenyConfig(
      {
        licenses: {
          allow: ["MIT"],
          "include-dev": true,
          exceptions: [{ package: "ms@2", allow: ["BSD-2-Clause"] }],
        },
      },
      "pnpm-deny.yaml",
    );
    expect(config.licenses.allow).toEqual(["MIT"]);
    expect(config.licenses.includeDev).toBe(true);
    expect(config.licenses.exceptions[0]?.package.name).toBe("ms");
  });

  it("rejects unknown keys", () => {
    expect(() => parseDenyConfig({ extra: true }, "pnpm-deny.yaml")).toThrow(
      ConfigError,
    );
  });
});
