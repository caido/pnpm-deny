import { isPresent } from "./optional.js";
import type {
  CheckName,
  CheckResult,
  CheckStats,
  Finding,
  InclusionPath,
} from "./types.js";
import { CHECK_EXIT_BITS } from "./types.js";

export function formatInclusionPath(
  path: InclusionPath,
  graphNames: Map<string, string>,
): string {
  const rootName = graphNames.get(path.rootId) ?? path.rootId;
  if (path.hops.length === 0) {
    return rootName;
  }
  const hops = path.hops.map((hop) => hop.alias).join(" > ");
  return `${rootName} > ${hops}`;
}

export function formatFindingHuman(
  finding: Finding,
  graphNames: Map<string, string>,
): string {
  const level = finding.level.toUpperCase();
  const pkg = isPresent(finding.packageName)
    ? ` ${finding.packageName}${isPresent(finding.packageVersion) ? `@${finding.packageVersion}` : ""}`
    : "";
  const alias = isPresent(finding.alias) ? ` (alias ${finding.alias})` : "";
  const lines = [
    `${level}[${finding.check}.${finding.code}]${pkg}${alias}: ${finding.message}`,
  ];
  if (isPresent(finding.help)) {
    lines.push(`  help: ${finding.help}`);
  }
  for (const path of finding.inclusionPaths ?? []) {
    lines.push(`  required by: ${formatInclusionPath(path, graphNames)}`);
  }
  return lines.join("\n");
}

export function findingToJson(finding: Finding): Record<string, unknown> {
  return {
    type: "diagnostic",
    check: finding.check,
    code: finding.code,
    level: finding.level,
    message: finding.message,
    packageId: finding.packageId,
    packageName: finding.packageName,
    packageVersion: finding.packageVersion,
    alias: finding.alias,
    help: finding.help,
    labels: finding.labels,
    inclusionPaths: finding.inclusionPaths,
  };
}

export function statsToExitCode(results: CheckResult[]): number {
  let code = 0;
  for (const result of results) {
    if (result.stats.errors > 0) {
      code |= CHECK_EXIT_BITS[result.check];
    }
  }
  return code;
}

export function aggregateStats(results: CheckResult[]): CheckStats[] {
  return results.map((result) => result.stats);
}

export function emptyCheckResult(check: CheckName): CheckResult {
  return {
    check,
    findings: [],
    stats: { check, errors: 0, warnings: 0, notes: 0 },
  };
}

export function toSarif(results: CheckResult[]): unknown {
  const runs = [
    {
      tool: {
        driver: {
          name: "pnpm-deny",
          informationUri: "https://github.com/caido/pnpm-deny",
          rules: collectRules(results),
        },
      },
      results: results.flatMap((result) =>
        result.findings
          .filter((finding) => finding.level !== "allow")
          .map((finding) => ({
            ruleId: `${finding.check}/${finding.code}`,
            level: finding.level === "deny" ? "error" : "warning",
            message: { text: finding.message },
            properties: {
              packageName: finding.packageName,
              packageVersion: finding.packageVersion,
              alias: finding.alias,
            },
          })),
      ),
    },
  ];
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs,
  };
}

function collectRules(
  results: CheckResult[],
): Array<{ id: string; shortDescription: { text: string } }> {
  const seen = new Set<string>();
  const rules: Array<{ id: string; shortDescription: { text: string } }> = [];
  for (const result of results) {
    for (const finding of result.findings) {
      const id = `${finding.check}/${finding.code}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      rules.push({
        id,
        shortDescription: { text: finding.message },
      });
    }
  }
  return rules;
}
