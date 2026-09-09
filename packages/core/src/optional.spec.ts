import { describe, expect, it } from "vitest";

import { isAbsent, isPresent } from "./optional.js";

describe("isPresent / isAbsent", () => {
  it("narrows a defined value", () => {
    const value: string | undefined = "ms";
    expect(isPresent(value)).toBe(true);
    if (isPresent(value)) {
      expect(value.toUpperCase()).toBe("MS");
    }
  });

  it("detects an absent value", () => {
    const value: number | undefined = undefined;
    expect(isAbsent(value)).toBe(true);
    expect(isPresent(value)).toBe(false);
  });
});
