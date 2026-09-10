import { describe, expect, it } from "vitest";

import { parseColorMode, resolveColor } from "./style.js";

describe("parseColorMode", () => {
  it("defaults to auto", () => {
    expect(parseColorMode(undefined)).toBe("auto");
    expect(parseColorMode("")).toBe("auto");
  });

  it("accepts auto, always, and never", () => {
    expect(parseColorMode("auto")).toBe("auto");
    expect(parseColorMode("always")).toBe("always");
    expect(parseColorMode("never")).toBe("never");
  });

  it("rejects unknown values", () => {
    expect(() => parseColorMode("rainbow")).toThrow(/Invalid --color value/);
  });
});

describe("resolveColor", () => {
  it("applies coloring on a TTY only for auto", () => {
    expect(resolveColor("auto", { isTTY: true })).toBe(true);
    expect(resolveColor("auto", { isTTY: false })).toBe(false);
    expect(resolveColor("auto", {})).toBe(false);
  });

  it("always and never ignore TTY state", () => {
    expect(resolveColor("always", { isTTY: false })).toBe(true);
    expect(resolveColor("never", { isTTY: true })).toBe(false);
  });
});
