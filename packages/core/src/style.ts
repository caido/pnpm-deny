export type ColorMode = "auto" | "always" | "never";

export interface Style {
  bold: (text: string) => string;
  error: (text: string) => string;
  warning: (text: string) => string;
  success: (text: string) => string;
  gutter: (text: string) => string;
  highlight: (text: string) => string;
}

const RESET = "\u001B[0m";
const BOLD = "\u001B[1m";
const BRIGHT_RED = "\u001B[91m";
const YELLOW = "\u001B[33m";
const GREEN = "\u001B[32m";
const CYAN = "\u001B[36m";

const IDENTITY: Style = {
  bold: (text) => text,
  error: (text) => text,
  warning: (text) => text,
  success: (text) => text,
  gutter: (text) => text,
  highlight: (text) => text,
};

const ANSI: Style = {
  bold: (text) => `${BOLD}${text}${RESET}`,
  error: (text) => `${BOLD}${BRIGHT_RED}${text}${RESET}`,
  warning: (text) => `${BOLD}${YELLOW}${text}${RESET}`,
  success: (text) => `${BOLD}${GREEN}${text}${RESET}`,
  gutter: (text) => `${CYAN}${text}${RESET}`,
  highlight: (text) => `${BOLD}${text}${RESET}`,
};

/** Accent color for underlines / labeled spans at a given lint severity. */
export function severityAccent(
  style: Style,
  level: "deny" | "warn" | "allow",
): (text: string) => string {
  switch (level) {
    case "deny":
      return style.error;
    case "warn":
      return style.warning;
    case "allow":
      return (text) => text;
  }
}

export function createStyle(enabled: boolean): Style {
  return enabled ? ANSI : IDENTITY;
}

/**
 * Whether coloring is applied to human-formatted output.
 * Using color on JSON/SARIF output has no effect (callers skip styling).
 *
 * - `auto` (default) — coloring if the output stream is a TTY
 * - `always` — coloring is always applied
 * - `never` — no coloring for any output
 */
export function resolveColor(
  mode: ColorMode,
  stream: { isTTY?: boolean },
): boolean {
  switch (mode) {
    case "always":
      return true;
    case "never":
      return false;
    case "auto":
      return stream.isTTY === true;
  }
}

export function parseColorMode(value: string | undefined): ColorMode {
  if (value === undefined || value === "") {
    return "auto";
  }
  if (value === "always" || value === "never" || value === "auto") {
    return value;
  }
  throw new Error(
    `Invalid --color value '${value}'. Possible values: auto, always, never`,
  );
}
