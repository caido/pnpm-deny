import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  type CheckName,
  type CheckResult,
  type ColorMode,
  createFilesystemStoreService,
  createRegistryMetadataService,
  defaultConfigPath,
  emptyOverrides,
  findingToJson,
  findWorkspaceDir,
  formatCheckSummary,
  formatFindingHuman,
  isAbsent,
  type LintOverrides,
  loadDenyConfig,
  loadDependencyGraph,
  parseColorMode,
  type PolicyCheck,
  resolveColor,
  runChecks,
  statsToExitCode,
  toSarif,
} from "@pnpm-deny/core";
import { licensesCheck, listPackageLicenses } from "@pnpm-deny/licenses";

import { INIT_TEMPLATE } from "./init-template.js";

const IMPLEMENTED: CheckName[] = ["licenses"];

const CHECKS: Partial<Record<CheckName, PolicyCheck>> = {
  licenses: licensesCheck,
};

export async function runCli(
  argv: string[],
  io: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  } = process,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: "boolean", short: "h" },
      config: { type: "string" },
      filter: { type: "string", multiple: true },
      format: { type: "string", short: "f" },
      layout: { type: "string", short: "l" },
      allow: { type: "string", short: "A", multiple: true },
      warn: { type: "string", short: "W", multiple: true },
      deny: { type: "string", short: "D", multiple: true },
      offline: { type: "boolean" },
      color: { type: "string" },
    },
  });

  const command = positionals[0] ?? "help";
  if (values.help === true || command === "help") {
    io.stdout.write(helpText());
    return 0;
  }

  try {
    if (command === "init") {
      return await runInit(
        typeof values.config === "string" ? values.config : undefined,
      );
    }
    if (command === "check") {
      return await runCheck(positionals.slice(1), values, io);
    }
    if (command === "list") {
      return await runList(values, io);
    }
    io.stderr.write(`Unknown command '${command}'\n`);
    return 1;
  } catch (error) {
    io.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function runInit(configPath: string | undefined): Promise<number> {
  const workspaceDir = await findWorkspaceDir();
  const target = configPath ?? defaultConfigPath(workspaceDir);
  if (existsSync(target)) {
    throw new Error(`Refusing to overwrite existing config at ${target}`);
  }
  writeFileSync(target, INIT_TEMPLATE);
  return 0;
}

async function runCheck(
  selected: string[],
  values: Record<string, unknown>,
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream },
): Promise<number> {
  const checks = resolveChecks(selected);
  const context = await createContext(values);
  const results = await runChecks(
    checks.map((name) => {
      const check = CHECKS[name];
      if (isAbsent(check)) {
        throw new Error(`The ${name} check is not implemented yet`);
      }
      return check;
    }),
    context,
  );
  printResults(
    results,
    context.graph,
    stringOption(values.format, "human"),
    io,
    parseColorMode(typeof values.color === "string" ? values.color : undefined),
  );
  return statsToExitCode(results);
}

async function runList(
  values: Record<string, unknown>,
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream },
): Promise<number> {
  const context = await createContext(values);
  const licenses = await listPackageLicenses(context);
  const format = stringOption(values.format, "human");
  const layout = stringOption(values.layout, "license");
  io.stdout.write(renderList(licenses, format, layout));
  return 0;
}

async function createContext(values: Record<string, unknown>) {
  const cwd = process.cwd();
  const workspaceDir = await findWorkspaceDir(cwd);
  const { config, warnedMissing } = loadDenyConfig({
    startDir: workspaceDir,
    configPath: typeof values.config === "string" ? values.config : undefined,
  });
  if (warnedMissing) {
    process.stderr.write("warning: no pnpm-deny.yaml found; using defaults\n");
  }
  const graph = await loadDependencyGraph({
    workspaceDir,
    cwd,
    filters: Array.isArray(values.filter) ? values.filter.map(String) : [],
    graphConfig: config.graph,
  });
  const overrides = overridesFromCli(values);
  return {
    graph,
    config,
    overrides,
    offline: values.offline === true,
    metadata: createRegistryMetadataService({
      offline: values.offline === true,
    }),
    store: createFilesystemStoreService({
      offline: values.offline === true,
    }),
  };
}

function resolveChecks(selected: string[]): CheckName[] {
  if (selected.length === 0) {
    return [...IMPLEMENTED];
  }
  const names = new Set<CheckName>();
  for (const item of selected) {
    if (item === "all") {
      throw new Error(
        "Only the licenses check is implemented; omit the check name or pass 'licenses'",
      );
    }
    if (
      item !== "advisories" &&
      item !== "bans" &&
      item !== "licenses" &&
      item !== "sources"
    ) {
      throw new Error(`Unknown check '${item}'`);
    }
    if (!IMPLEMENTED.includes(item)) {
      throw new Error(`The ${item} check is not implemented yet`);
    }
    names.add(item);
  }
  return [...names];
}

function overridesFromCli(values: Record<string, unknown>): LintOverrides {
  const overrides = emptyOverrides();
  addAll(overrides.allow, values.allow);
  addAll(overrides.warn, values.warn);
  addAll(overrides.deny, values.deny);
  return overrides;
}

function stringOption(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function addAll(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    target.add(String(item));
  }
}

function printResults(
  results: CheckResult[],
  graph: {
    packages: Map<string, { artifact: { name: string; version: string } }>;
  },
  format: string,
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream },
  colorMode: ColorMode,
): void {
  const packages = new Map<string, { name: string; version: string }>();
  for (const [id, pkg] of graph.packages) {
    packages.set(id, {
      name: pkg.artifact.name,
      version: pkg.artifact.version,
    });
  }
  // --color only affects human-formatted output; JSON/SARIF ignore it.
  if (format === "json") {
    for (const result of results) {
      for (const finding of result.findings) {
        io.stderr.write(`${JSON.stringify(findingToJson(finding))}\n`);
      }
    }
    io.stdout.write(
      `${JSON.stringify({ results: results.map((r) => r.stats) })}\n`,
    );
    return;
  }
  if (format === "sarif") {
    io.stdout.write(`${JSON.stringify(toSarif(results), undefined, 2)}\n`);
    return;
  }
  const colorDiagnostics = resolveColor(
    colorMode,
    io.stderr as { isTTY?: boolean },
  );
  const colorSummary = resolveColor(
    colorMode,
    io.stdout as { isTTY?: boolean },
  );
  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.level === "allow") {
        continue;
      }
      io.stderr.write(
        `${formatFindingHuman(finding, packages, { color: colorDiagnostics })}\n\n`,
      );
    }
  }
  io.stdout.write(`${formatCheckSummary(results, { color: colorSummary })}\n`);
}

function renderList(
  licenses: Array<{ name: string; version: string; expression?: string }>,
  format: string,
  layout: string,
): string {
  if (format === "json") {
    if (layout === "crate" || layout === "package") {
      const byPackage: Record<string, string[]> = {};
      for (const item of licenses) {
        const key = `${item.name}@${item.version}`;
        byPackage[key] = [item.expression ?? "UNLICENSED"];
      }
      return `${JSON.stringify(byPackage, undefined, 2)}\n`;
    }
    const byLicense: Record<string, string[]> = {};
    for (const item of licenses) {
      const key = item.expression ?? "UNLICENSED";
      byLicense[key] = [
        ...(byLicense[key] ?? []),
        `${item.name}@${item.version}`,
      ];
    }
    return `${JSON.stringify(byLicense, undefined, 2)}\n`;
  }
  if (format === "tsv") {
    return licenses
      .map(
        (item) =>
          `${item.name}\t${item.version}\t${item.expression ?? "UNLICENSED"}`,
      )
      .join("\n")
      .concat("\n");
  }
  if (layout === "crate" || layout === "package") {
    return licenses
      .map(
        (item) =>
          `${item.name}@${item.version}: ${item.expression ?? "UNLICENSED"}`,
      )
      .join("\n")
      .concat("\n");
  }
  const byLicense = new Map<string, string[]>();
  for (const item of licenses) {
    const key = item.expression ?? "UNLICENSED";
    byLicense.set(key, [
      ...(byLicense.get(key) ?? []),
      `${item.name}@${item.version}`,
    ]);
  }
  return [...byLicense.entries()]
    .map(([license, pkgs]) => `${license}: ${pkgs.join(", ")}`)
    .join("\n")
    .concat("\n");
}

function helpText(): string {
  return `pnpm-deny
Usage:
  pnpm deny init
  pnpm deny check [licenses]
  pnpm deny list

Options:
  --config PATH
  --filter SELECTOR
  --format human|json|sarif
  --layout license|package
  --color WHEN
      Whether coloring is applied to human-formatted output; using it on
      JSON output has no effect.
      Possible values:
        auto (default)  Coloring is applied if the output stream is a TTY
        always          Coloring is always applied
        never           No coloring is applied for any output
  -A, --allow CODE
  -W, --warn CODE
  -D, --deny CODE
  --offline
`;
}
