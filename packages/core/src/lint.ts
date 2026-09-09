import type { Finding, LintLevel, LintOverrides } from "./types.js";

const LEVEL_RANK: Record<LintLevel, number> = {
  allow: 0,
  warn: 1,
  deny: 2,
};

export function parseLintLevel(value: unknown, fallback: LintLevel): LintLevel {
  if (value === "allow" || value === "warn" || value === "deny") {
    return value;
  }
  return fallback;
}

export function applyOverrides(
  finding: Finding,
  overrides: LintOverrides,
): Finding {
  const code = finding.code;
  const sourceLevel =
    finding.level === "deny"
      ? "denied"
      : finding.level === "warn"
        ? "warnings"
        : "allowed";

  let level = finding.level;
  if (overrides.allow.has(code) || overrides.allow.has(sourceLevel)) {
    level = "allow";
  }
  if (overrides.warn.has(code) || overrides.warn.has(sourceLevel)) {
    level = "warn";
  }
  if (overrides.deny.has(code) || overrides.deny.has(sourceLevel)) {
    level = "deny";
  }

  return level === finding.level ? finding : { ...finding, level };
}

export function emptyOverrides(): LintOverrides {
  return {
    allow: new Set(),
    warn: new Set(),
    deny: new Set(),
  };
}

export function maxLevel(a: LintLevel, b: LintLevel): LintLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export function statsFromFindings(
  check: Finding["check"],
  findings: Finding[],
): {
  check: Finding["check"];
  errors: number;
  warnings: number;
  notes: number;
} {
  let errors = 0;
  let warnings = 0;
  let notes = 0;
  for (const finding of findings) {
    if (finding.level === "deny") {
      errors += 1;
    } else if (finding.level === "warn") {
      warnings += 1;
    } else {
      notes += 1;
    }
  }
  return { check, errors, warnings, notes };
}
