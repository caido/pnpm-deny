import { parseLicenseFromManifest } from "@pnpm/deps.compliance.license-resolver";
import {
  type CheckContext,
  type CheckResult,
  type Finding,
  getInclusionPaths,
  isAbsent,
  isPresent,
  licenseFromPackumentVersion,
  matchesIgnoreSource,
  matchesInstance,
  type PolicyCheck,
  prodReachableIds,
  readInstalledManifest,
  type ResolvedInstance,
  statsFromFindings,
} from "@pnpm-deny/core";
import parseSpdx from "spdx-expression-parse";
import satisfies from "spdx-satisfies";

export interface PackageLicense {
  packageId: string;
  name: string;
  version: string;
  expression?: string;
}

export function createLicensesCheck(): PolicyCheck {
  return {
    name: "licenses",
    async run(context) {
      const { findings, licenses } = await evaluateLicenses(context);
      void licenses;
      return {
        check: "licenses",
        findings,
        stats: statsFromFindings("licenses", findings),
      } satisfies CheckResult;
    },
  };
}

export async function listPackageLicenses(
  context: CheckContext,
): Promise<PackageLicense[]> {
  const { licenses } = await evaluateLicenses(context);
  return licenses;
}

async function evaluateLicenses(
  context: CheckContext,
): Promise<{ findings: Finding[]; licenses: PackageLicense[] }> {
  const findings: Finding[] = [];
  const licenses: PackageLicense[] = [];
  const usedAllow = new Set<string>();
  const usedExceptions = new Set<number>();
  const prodReachable = prodReachableIds(context.graph);
  const config = context.config.licenses;

  for (const pkg of context.graph.packages.values()) {
    if (!config.includeDev && !prodReachable.has(pkg.id)) {
      continue;
    }
    if (shouldIgnorePrivate(pkg, context)) {
      continue;
    }
    if (shouldIgnoreSource(pkg, context)) {
      continue;
    }

    const expression = await resolveExpression(pkg, context);
    licenses.push({
      packageId: pkg.id,
      name: pkg.artifact.name,
      version: pkg.artifact.version,
      expression,
    });

    if (isAbsent(expression)) {
      findings.push({
        check: "licenses",
        code: "unlicensed",
        level: "deny",
        message: "failed to satisfy license requirements",
        packageId: pkg.id,
        packageName: pkg.artifact.name,
        packageVersion: pkg.artifact.version,
        inclusionPaths: getInclusionPaths(context.graph, pkg.id),
        labels: {
          expression: "",
          reason: "a valid SPDX license expression could not be retrieved",
        },
      });
      continue;
    }

    const exceptionIndex = config.exceptions.findIndex((entry) =>
      matchesInstance(entry.package, pkg),
    );
    const allow = [
      ...config.allow,
      ...(exceptionIndex >= 0 ? config.exceptions[exceptionIndex]!.allow : []),
    ].filter((entry) => isValidSpdx(entry));
    if (exceptionIndex >= 0) {
      usedExceptions.add(exceptionIndex);
    }

    if (!isValidSpdx(expression)) {
      findings.push({
        check: "licenses",
        code: "unlicensed",
        level: "deny",
        message: "failed to satisfy license requirements",
        packageId: pkg.id,
        packageName: pkg.artifact.name,
        packageVersion: pkg.artifact.version,
        inclusionPaths: getInclusionPaths(context.graph, pkg.id),
        labels: {
          expression,
          reason: "declared license is not a valid SPDX expression",
          licenses: expression,
        },
      });
      continue;
    }

    for (const id of extractLicenseIds(expression)) {
      if (config.allow.includes(id)) {
        usedAllow.add(id);
      }
    }

    if (!expressionAllowed(expression, allow)) {
      findings.push({
        check: "licenses",
        code: "rejected",
        level: "deny",
        message: "failed to satisfy license requirements",
        packageId: pkg.id,
        packageName: pkg.artifact.name,
        packageVersion: pkg.artifact.version,
        inclusionPaths: getInclusionPaths(context.graph, pkg.id),
        labels: {
          expression,
          reason: "license is not explicitly allowed",
          licenses: extractLicenseIds(expression).join(", "),
        },
      });
    }
  }

  for (const allowed of config.allow) {
    if (!isValidSpdx(allowed)) {
      findings.push({
        check: "licenses",
        code: "invalid-allowed-license",
        level: "deny",
        message: `Allowed license '${allowed}' is not a valid SPDX expression`,
        help: "licenses.allow must list SPDX license expressions. To allow a specific package, use licenses.exceptions.",
      });
      continue;
    }
    if (!usedAllow.has(allowed)) {
      findings.push({
        check: "licenses",
        code: "unused-allowed-license",
        level: config.unusedAllowedLicense,
        message: `Allowed license '${allowed}' was not encountered in the graph`,
      });
    }
  }

  config.exceptions.forEach((entry, index) => {
    if (!usedExceptions.has(index)) {
      findings.push({
        check: "licenses",
        code: "unused-license-exception",
        level: config.unusedLicenseException,
        message: `License exception for '${entry.package.raw}' was not used`,
      });
    }
  });

  return { findings, licenses };
}

function shouldIgnorePrivate(
  pkg: ResolvedInstance,
  context: CheckContext,
): boolean {
  if (!pkg.isWorkspace || !context.config.licenses.private.ignore) {
    return false;
  }
  if (pkg.isPrivate) {
    return true;
  }
  return false;
}

function shouldIgnoreSource(
  pkg: ResolvedInstance,
  context: CheckContext,
): boolean {
  const entries = context.config.licenses.private.ignoreSources;
  if (entries.length === 0) {
    return false;
  }
  return entries.some((entry) =>
    matchesIgnoreSource(entry, pkg.artifact.source),
  );
}

async function resolveExpression(
  pkg: ResolvedInstance,
  context: CheckContext,
): Promise<string | undefined> {
  const clarify = context.config.licenses.clarify.find((entry) =>
    matchesInstance(entry.package, pkg),
  );
  if (isPresent(clarify)) {
    const integrityOk =
      isPresent(clarify.integrity) &&
      pkg.artifact.source.integrity === clarify.integrity;
    const commitOk =
      isPresent(clarify.commit) &&
      pkg.artifact.source.commit === clarify.commit;
    if (integrityOk || commitOk) {
      return clarify.expression;
    }
  }

  if (isPresent(pkg.license)) {
    return normalizeDeclaredLicense(pkg.license);
  }

  const installed = readInstalledManifest(context.graph.workspaceDir, pkg);
  if (isPresent(installed)) {
    const fromInstalled = licenseFromPackumentVersion(installed);
    if (isPresent(fromInstalled)) {
      return normalizeDeclaredLicense(fromInstalled);
    }
  }

  if (pkg.isWorkspace || pkg.artifact.source.kind !== "registry") {
    return undefined;
  }

  const meta = await context.metadata.getPackageMetadata(
    pkg.artifact.name,
    pkg.artifact.version,
    pkg.artifact.source.locator,
  );
  if (isAbsent(meta) || isAbsent(meta.license)) {
    return undefined;
  }
  return normalizeDeclaredLicense(meta.license);
}

function normalizeDeclaredLicense(license: string): string | undefined {
  return parseLicenseFromManifest({ license }) ?? license;
}

function isValidSpdx(expression: string): boolean {
  try {
    parseSpdx(expression);
    return true;
  } catch {
    return false;
  }
}

function expressionAllowed(expression: string, allow: string[]): boolean {
  if (allow.length === 0) {
    return false;
  }
  try {
    return satisfies(expression, allow);
  } catch {
    return false;
  }
}

function extractLicenseIds(expression: string): string[] {
  try {
    return collectIds(parseSpdx(expression));
  } catch {
    return [];
  }
}

interface SpdxLicenseNode {
  license: string;
  plus?: boolean;
  exception?: string;
}

interface SpdxConjunctionNode {
  left: SpdxNode;
  conjunction: string;
  right: SpdxNode;
}

type SpdxNode = SpdxLicenseNode | SpdxConjunctionNode;

function collectIds(node: SpdxNode): string[] {
  if ("license" in node) {
    const id =
      "exception" in node && isPresent(node.exception)
        ? `${node.license} WITH ${node.exception}`
        : node.license;
    return [id];
  }
  return [...collectIds(node.left), ...collectIds(node.right)];
}

export const licensesCheck = createLicensesCheck();
