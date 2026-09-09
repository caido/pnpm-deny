import { describe, expect, it } from "vitest";

import { matchesPackageSpec, parsePackageSpec } from "./package-spec.js";

describe("parsePackageSpec", () => {
  it("parses an unscoped name", () => {
    expect(parsePackageSpec("ms")).toEqual({
      name: "ms",
      range: "*",
      raw: "ms",
    });
  });

  it("parses a scoped name and range", () => {
    expect(parsePackageSpec("@scope/pkg@^1.2.0")).toEqual({
      name: "@scope/pkg",
      range: "^1.2.0",
      raw: "@scope/pkg@^1.2.0",
    });
  });

  it("matches versions against the parsed range", () => {
    const spec = parsePackageSpec("ms@^2.0.0");
    expect(matchesPackageSpec(spec, "ms", "2.1.3")).toBe(true);
    expect(matchesPackageSpec(spec, "ms", "1.0.0")).toBe(false);
    expect(matchesPackageSpec(spec, "left-pad", "2.1.3")).toBe(false);
  });
});
