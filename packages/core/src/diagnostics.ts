import { isAbsent, isPresent } from "./optional.js";
import { createStyle, severityAccent, type Style } from "./style.js";
import type {
  CheckName,
  CheckResult,
  CheckStats,
  Finding,
  InclusionPath,
  LintLevel,
} from "./types.js";
import { CHECK_EXIT_BITS } from "./types.js";

export type GraphPackageLabel = {
  name: string;
  version: string;
};

export interface FormatHumanOptions {
  hideInclusionGraph?: boolean;
  color?: boolean;
}

export function formatInclusionPath(
  path: InclusionPath,
  graphPackages: Map<string, GraphPackageLabel>,
): string {
  const rootLabel = packageLabel(path.rootId, graphPackages);
  if (path.hops.length === 0) {
    return rootLabel;
  }
  const hops = path.hops.map((hop) =>
    packageLabel(hop.packageId, graphPackages),
  );
  return [rootLabel, ...hops].join(" > ");
}

/**
 * Inverse dependency tree: the Finding package at the root, parents as children.
 * Matches cargo-deny's inclusion graph orientation.
 */
export function formatInclusionTree(
  packageId: string,
  paths: InclusionPath[],
  graphPackages: Map<string, GraphPackageLabel>,
  style: Style = createStyle(false),
): string {
  return printTree(buildReverseTree(packageId, paths), graphPackages, style);
}

function buildReverseTree(packageId: string, paths: InclusionPath[]): TreeNode {
  const root: TreeNode = { id: packageId, children: new Map() };
  const byId = new Map<string, TreeNode>([[packageId, root]]);

  const ensure = (id: string): TreeNode => {
    const existing = byId.get(id);
    if (isPresent(existing)) {
      return existing;
    }
    const created: TreeNode = { id, children: new Map() };
    byId.set(id, created);
    return created;
  };

  for (const path of paths) {
    const chain = dedupeConsecutive([
      path.rootId,
      ...path.hops.map((hop) => hop.packageId),
      packageId,
    ]);
    for (let i = chain.length - 1; i > 0; i -= 1) {
      const from = ensure(chain[i]!);
      const toId = chain[i - 1]!;
      if (!from.children.has(toId)) {
        from.children.set(toId, ensure(toId));
      }
    }
  }

  return root;
}

interface TreeNode {
  id: string;
  children: Map<string, TreeNode>;
}

function dedupeConsecutive(ids: string[]): string[] {
  const result: string[] = [];
  for (const id of ids) {
    if (result[result.length - 1] !== id) {
      result.push(id);
    }
  }
  return result;
}

function printTree(
  root: TreeNode,
  graphPackages: Map<string, GraphPackageLabel>,
  style: Style,
): string {
  const lines: string[] = [packageLabel(root.id, graphPackages)];
  const children = sortedChildren(root, graphPackages);
  children.forEach((child, index) => {
    printNode(
      child,
      "",
      index === children.length - 1,
      graphPackages,
      style,
      lines,
    );
  });
  return lines.join("\n");
}

function printNode(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  graphPackages: Map<string, GraphPackageLabel>,
  style: Style,
  lines: string[],
): void {
  const branch = isLast ? "└── " : "├── ";
  lines.push(
    `${style.gutter(prefix + branch)}${packageLabel(node.id, graphPackages)}`,
  );
  const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
  const children = sortedChildren(node, graphPackages);
  children.forEach((child, index) => {
    printNode(
      child,
      childPrefix,
      index === children.length - 1,
      graphPackages,
      style,
      lines,
    );
  });
}

function sortedChildren(
  node: TreeNode,
  graphPackages: Map<string, GraphPackageLabel>,
): TreeNode[] {
  return [...node.children.values()].sort((a, b) =>
    packageLabel(a.id, graphPackages).localeCompare(
      packageLabel(b.id, graphPackages),
    ),
  );
}

export function formatFindingHuman(
  finding: Finding,
  graphPackages: Map<string, GraphPackageLabel>,
  options: FormatHumanOptions = {},
): string {
  const style = createStyle(options.color === true);
  const accent = severityAccent(style, finding.level);
  const severity = levelToSeverity(finding.level);
  const lines = [
    `${accent(`${severity}[${finding.code}]:`)} ${style.bold(finding.message)}`,
  ];

  const gutter = (text: string): string => style.gutter(text);
  const subject = subjectLabel(finding, graphPackages);
  if (isPresent(subject)) {
    lines.push(`${gutter("   ┌─ ")}${style.gutter(subject)}`);
    lines.push(gutter("   │"));
  }

  const expression = finding.labels?.expression;
  if (expression !== undefined) {
    const indent = "   │";
    const before = '  license = "';
    const after = '"';
    lines.push(`${gutter(indent)}${before}${accent(expression)}${after}`);
    const valueStart = before.length;
    const underlineWidth = Math.max(expression.length, 1);
    lines.push(
      `${gutter(indent)}${" ".repeat(valueStart)}${accent("━".repeat(underlineWidth))}`,
    );
    lines.push(`${gutter(indent)}${" ".repeat(valueStart)}${accent("│")}`);
    const reason =
      finding.labels?.reason ??
      (finding.code === "unlicensed"
        ? "a valid SPDX license expression could not be retrieved"
        : "license is not explicitly allowed");
    lines.push(
      `${gutter(indent)}${" ".repeat(valueStart)}${accent(`rejected: ${reason}`)}`,
    );
    lines.push(gutter(indent));
  } else if (isPresent(finding.help)) {
    lines.push(`${gutter("   │  ")}help: ${finding.help}`);
    lines.push(gutter("   │"));
  }

  const licenseIds = finding.labels?.licenses;
  if (isPresent(licenseIds) && licenseIds.length > 0) {
    for (const id of licenseIds.split(",").map((part) => part.trim())) {
      if (id.length > 0) {
        lines.push(`${gutter("   ├ ")}${id}`);
      }
    }
  }

  if (
    options.hideInclusionGraph !== true &&
    isPresent(finding.packageId) &&
    isPresent(finding.inclusionPaths) &&
    finding.inclusionPaths.length > 0
  ) {
    const tree = formatInclusionTree(
      finding.packageId,
      finding.inclusionPaths,
      graphPackages,
      style,
    );
    for (const [index, line] of tree.split("\n").entries()) {
      if (index === 0) {
        lines.push(`${gutter("   ├ ")}${line}`);
      } else {
        lines.push(`     ${line}`);
      }
    }
  } else if (
    isPresent(finding.packageName) &&
    isPresent(finding.packageVersion) &&
    (isAbsent(finding.inclusionPaths) || finding.inclusionPaths.length === 0)
  ) {
    lines.push(
      `${gutter("   ├ ")}${finding.packageName}@${finding.packageVersion}`,
    );
  }

  return lines.join("\n");
}

export function formatCheckSummary(
  results: CheckResult[],
  options: { color?: boolean } = {},
): string {
  const style = createStyle(options.color === true);
  return results
    .map((result) => {
      if (result.stats.errors > 0) {
        return `${result.check} ${style.error("FAILED")}`;
      }
      return `${result.check} ${style.success("ok")}`;
    })
    .join(" ");
}

function subjectLabel(
  finding: Finding,
  graphPackages: Map<string, GraphPackageLabel>,
): string | undefined {
  if (isPresent(finding.labels?.file)) {
    return finding.labels.file;
  }
  if (isPresent(finding.packageId)) {
    return packageLabel(finding.packageId, graphPackages);
  }
  if (isPresent(finding.packageName)) {
    return isPresent(finding.packageVersion)
      ? `${finding.packageName}@${finding.packageVersion}`
      : finding.packageName;
  }
  return undefined;
}

function packageLabel(
  id: string,
  graphPackages: Map<string, GraphPackageLabel>,
): string {
  const pkg = graphPackages.get(id);
  if (isAbsent(pkg)) {
    return id;
  }
  return `${pkg.name}@${pkg.version}`;
}

function levelToSeverity(level: LintLevel): string {
  switch (level) {
    case "deny":
      return "error";
    case "warn":
      return "warning";
    case "allow":
      return "note";
  }
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
