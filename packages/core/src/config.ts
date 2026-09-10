import { z } from "zod";

import { isAbsent, isPresent } from "./optional.js";
import { parsePackageSpec } from "./package-spec.js";
import type {
  AdvisoriesConfig,
  BanEntry,
  BansConfig,
  DenyConfig,
  GraphConfig,
  LicensesConfig,
  OutputConfig,
  PackageSpec,
  SourcesConfig,
} from "./types.js";
import { DEFAULT_NPM_REGISTRY } from "./types.js";

const lintLevelSchema = z.enum(["allow", "warn", "deny"]);

const packageSpecSchema = z.union([
  z.string().min(1),
  z
    .object({
      package: z.string().min(1).optional(),
      crate: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      version: z.string().min(1).optional(),
      depth: z.number().int().nonnegative().optional(),
      wrappers: z.array(z.string()).optional(),
      reason: z.string().optional(),
      "use-instead": z.string().optional(),
      "deny-multiple-versions": z.boolean().optional(),
      allow: z.array(z.string()).optional(),
      expression: z.string().optional(),
      integrity: z.string().optional(),
      commit: z.string().optional(),
    })
    .strict(),
]);

function toPackageSpec(value: z.infer<typeof packageSpecSchema>): PackageSpec {
  if (typeof value === "string") {
    return parsePackageSpec(value);
  }
  if (isPresent(value.package)) {
    return parsePackageSpec(value.package);
  }
  if (isPresent(value.crate)) {
    return parsePackageSpec(value.crate.replace(":", "@"));
  }
  if (isPresent(value.name)) {
    return parsePackageSpec(`${value.name}@${value.version ?? "*"}`);
  }
  throw new ConfigError("Invalid package selector");
}

const graphSchema = z
  .object({
    exclude: z.array(z.string()).default([]),
    "exclude-dev": z.boolean().default(false),
    "exclude-unpublished": z.boolean().default(false),
    os: z.array(z.string()).default([]),
    cpu: z.array(z.string()).default([]),
    libc: z.array(z.string()).default([]),
  })
  .strict()
  .default({
    exclude: [],
    "exclude-dev": false,
    "exclude-unpublished": false,
    os: [],
    cpu: [],
    libc: [],
  });

const outputSchema = z
  .object({
    "feature-depth": z.number().int().nonnegative().default(1),
  })
  .strict()
  .default({ "feature-depth": 1 });

const advisoryIgnoreSchema = z.union([
  z.string().min(1),
  z
    .object({
      id: z.string().min(1).optional(),
      package: packageSpecSchema.optional(),
      reason: z.string().optional(),
    })
    .strict(),
]);

const advisoriesSchema = z
  .object({
    ignore: z.array(advisoryIgnoreSchema).default([]),
    unpublished: lintLevelSchema.default("warn"),
    deprecated: lintLevelSchema.default("warn"),
    "unused-ignored-advisory": lintLevelSchema.default("warn"),
    providers: z.array(z.string()).default(["pnpm-audit"]),
  })
  .strict()
  .default({
    ignore: [],
    unpublished: "warn",
    deprecated: "warn",
    "unused-ignored-advisory": "warn",
    providers: ["pnpm-audit"],
  });

const banEntrySchema = z.union([
  z.string().min(1),
  z
    .object({
      package: z.string().min(1).optional(),
      crate: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      version: z.string().min(1).optional(),
      wrappers: z.array(z.string()).optional(),
      reason: z.string().optional(),
      "use-instead": z.string().optional(),
      "deny-multiple-versions": z.boolean().optional(),
    })
    .strict(),
]);

const skipTreeEntrySchema = z.union([
  z.string().min(1),
  z
    .object({
      package: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      version: z.string().min(1).optional(),
      depth: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);

const buildBypassSchema = z
  .object({
    package: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    "build-script": z.string().optional(),
    "allow-globs": z.array(z.string()).optional(),
    allow: z
      .array(
        z
          .object({
            path: z.string().min(1),
            checksum: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

const buildSchema = z
  .object({
    "allow-build-scripts": z.array(packageSpecSchema).optional(),
    executables: lintLevelSchema.default("deny"),
    interpreted: lintLevelSchema.default("allow"),
    "script-extensions": z.array(z.string()).default([]),
    "enable-builtin-globs": z.boolean().default(false),
    "include-dependencies": z.boolean().default(false),
    "include-workspace": z.boolean().default(false),
    "include-archives": z.boolean().default(false),
    bypass: z.array(buildBypassSchema).default([]),
  })
  .strict();

const workspaceDependenciesSchema = z
  .object({
    duplicates: lintLevelSchema.default("deny"),
    "include-path-dependencies": z.boolean().default(true),
    unused: lintLevelSchema.default("deny"),
  })
  .strict();

const bansSchema = z
  .object({
    "multiple-versions": lintLevelSchema.default("warn"),
    "multiple-versions-include-dev": z.boolean().default(false),
    wildcards: lintLevelSchema.default("allow"),
    "allow-wildcard-paths": z.boolean().default(false),
    "dist-tags": lintLevelSchema.default("warn"),
    allow: z.array(banEntrySchema).default([]),
    deny: z.array(banEntrySchema).default([]),
    skip: z.array(packageSpecSchema).default([]),
    "skip-tree": z.array(skipTreeEntrySchema).default([]),
    "allow-workspace": z.boolean().default(false),
    "workspace-dependencies": workspaceDependenciesSchema.optional(),
    build: buildSchema.optional(),
  })
  .strict()
  .default({
    "multiple-versions": "warn",
    "multiple-versions-include-dev": false,
    wildcards: "allow",
    "allow-wildcard-paths": false,
    "dist-tags": "warn",
    allow: [],
    deny: [],
    skip: [],
    "skip-tree": [],
    "allow-workspace": false,
  });

const licenseExceptionSchema = z
  .object({
    package: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    allow: z.array(z.string()).default([]),
  })
  .strict();

const licenseClarifySchema = z
  .object({
    package: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    expression: z.string().min(1),
    integrity: z.string().optional(),
    commit: z.string().optional(),
  })
  .strict();

const licensesSchema = z
  .object({
    allow: z.array(z.string()).default([]),
    "include-dev": z.boolean().default(false),
    exceptions: z.array(licenseExceptionSchema).default([]),
    clarify: z.array(licenseClarifySchema).default([]),
    private: z
      .object({
        ignore: z.boolean().default(false),
        "ignore-sources": z.array(z.string()).default([]),
      })
      .strict()
      .default({
        ignore: false,
        "ignore-sources": [],
      }),
    "unused-allowed-license": lintLevelSchema.default("warn"),
    "unused-license-exception": lintLevelSchema.default("warn"),
  })
  .strict()
  .default({
    allow: [],
    "include-dev": false,
    exceptions: [],
    clarify: [],
    private: {
      ignore: false,
      "ignore-sources": [],
    },
    "unused-allowed-license": "warn",
    "unused-license-exception": "warn",
  });

const sourcesSchema = z
  .object({
    "unknown-registry": lintLevelSchema.default("warn"),
    "unknown-git": lintLevelSchema.default("warn"),
    "unknown-url": lintLevelSchema.default("warn"),
    "unknown-custom": lintLevelSchema.default("warn"),
    "allow-registry": z.array(z.string()).default([DEFAULT_NPM_REGISTRY]),
    "allow-git": z.array(z.string()).default([]),
    "allow-url": z.array(z.string()).default([]),
    "allow-custom": z.array(z.string()).default([]),
    private: z.array(z.string()).default([]),
    "required-git-spec": z.enum(["any", "branch", "tag", "rev"]).default("any"),
    "unused-allowed-source": lintLevelSchema.default("warn"),
    "unused-allowed-org": lintLevelSchema.default("warn"),
    "allow-org": z
      .object({
        github: z.array(z.string()).default([]),
        gitlab: z.array(z.string()).default([]),
        bitbucket: z.array(z.string()).default([]),
      })
      .strict()
      .default({ github: [], gitlab: [], bitbucket: [] }),
  })
  .strict()
  .default({
    "unknown-registry": "warn",
    "unknown-git": "warn",
    "unknown-url": "warn",
    "unknown-custom": "warn",
    "allow-registry": [DEFAULT_NPM_REGISTRY],
    "allow-git": [],
    "allow-url": [],
    "allow-custom": [],
    private: [],
    "required-git-spec": "any",
    "unused-allowed-source": "warn",
    "unused-allowed-org": "warn",
    "allow-org": { github: [], gitlab: [], bitbucket: [] },
  });

export const denyConfigSchema = z
  .object({
    graph: graphSchema,
    output: outputSchema,
    advisories: advisoriesSchema,
    bans: bansSchema,
    licenses: licensesSchema,
    sources: sourcesSchema,
  })
  .strict();

export type DenyConfigInput = z.input<typeof denyConfigSchema>;
export type DenyConfigParsed = z.output<typeof denyConfigSchema>;

export function defaultDenyConfig(path?: string): DenyConfig {
  return mapParsedConfig(denyConfigSchema.parse({}), path);
}

export function defaultGraphConfig(): GraphConfig {
  return defaultDenyConfig().graph;
}

export function defaultAdvisoriesConfig(): AdvisoriesConfig {
  return defaultDenyConfig().advisories;
}

export function defaultBansConfig(): BansConfig {
  return defaultDenyConfig().bans;
}

export function defaultLicensesConfig(): LicensesConfig {
  return defaultDenyConfig().licenses;
}

export function defaultSourcesConfig(): SourcesConfig {
  return defaultDenyConfig().sources;
}

export function parseDenyConfig(raw: unknown, path?: string): DenyConfig {
  const result = denyConfigSchema.safeParse(raw ?? {});
  if (!result.success) {
    throw new ConfigError(formatZodError(result.error), path);
  }
  return mapParsedConfig(result.data, path);
}

function mapParsedConfig(parsed: DenyConfigParsed, path?: string): DenyConfig {
  return {
    path,
    graph: mapGraph(parsed.graph),
    output: mapOutput(parsed.output),
    advisories: mapAdvisories(parsed.advisories),
    bans: mapBans(parsed.bans),
    licenses: mapLicenses(parsed.licenses),
    sources: mapSources(parsed.sources),
  };
}

function mapGraph(parsed: DenyConfigParsed["graph"]): GraphConfig {
  return {
    exclude: parsed.exclude,
    excludeDev: parsed["exclude-dev"],
    excludeUnpublished: parsed["exclude-unpublished"],
    os: parsed.os,
    cpu: parsed.cpu,
    libc: parsed.libc,
  };
}

function mapOutput(parsed: DenyConfigParsed["output"]): OutputConfig {
  return {
    featureDepth: parsed["feature-depth"],
  };
}

function mapAdvisories(
  parsed: DenyConfigParsed["advisories"],
): AdvisoriesConfig {
  return {
    ignore: parsed.ignore.map((entry) => {
      if (typeof entry === "string") {
        if (
          entry.includes("/") ||
          entry.toUpperCase().startsWith("GHSA-") ||
          entry.toUpperCase().startsWith("CVE-")
        ) {
          return { id: entry };
        }
        return { package: parsePackageSpec(entry) };
      }
      return {
        id: entry.id,
        package: isPresent(entry.package)
          ? toPackageSpec(entry.package)
          : undefined,
        reason: entry.reason,
      };
    }),
    unpublished: parsed.unpublished,
    deprecated: parsed.deprecated,
    unusedIgnoredAdvisory: parsed["unused-ignored-advisory"],
    providers: parsed.providers,
  };
}

function mapBanEntry(entry: z.infer<typeof banEntrySchema>): BanEntry {
  if (typeof entry === "string") {
    return { package: parsePackageSpec(entry) };
  }
  return {
    package: toPackageSpec(entry),
    wrappers: entry.wrappers,
    reason: entry.reason,
    useInstead: entry["use-instead"],
    denyMultipleVersions: entry["deny-multiple-versions"],
  };
}

function mapBans(parsed: DenyConfigParsed["bans"]): BansConfig {
  const config: BansConfig = {
    multipleVersions: parsed["multiple-versions"],
    multipleVersionsIncludeDev: parsed["multiple-versions-include-dev"],
    wildcards: parsed.wildcards,
    allowWildcardPaths: parsed["allow-wildcard-paths"],
    distTags: parsed["dist-tags"],
    allow: parsed.allow.map(mapBanEntry),
    deny: parsed.deny.map(mapBanEntry),
    skip: parsed.skip.map(toPackageSpec),
    skipTree: parsed["skip-tree"].map((entry) => {
      if (typeof entry === "string") {
        return parsePackageSpec(entry);
      }
      return {
        ...toPackageSpec(entry),
        depth: entry.depth,
      };
    }),
    allowWorkspace: parsed["allow-workspace"],
  };

  if (isPresent(parsed["workspace-dependencies"])) {
    config.workspaceDependencies = {
      duplicates: parsed["workspace-dependencies"].duplicates,
      includePathDependencies:
        parsed["workspace-dependencies"]["include-path-dependencies"],
      unused: parsed["workspace-dependencies"].unused,
    };
  }

  if (isPresent(parsed.build)) {
    config.build = {
      allowBuildScripts:
        parsed.build["allow-build-scripts"]?.map(toPackageSpec),
      executables: parsed.build.executables,
      interpreted: parsed.build.interpreted,
      scriptExtensions: parsed.build["script-extensions"],
      enableBuiltinGlobs: parsed.build["enable-builtin-globs"],
      includeDependencies: parsed.build["include-dependencies"],
      includeWorkspace: parsed.build["include-workspace"],
      includeArchives: parsed.build["include-archives"],
      bypass: parsed.build.bypass.map((entry) => {
        const spec =
          entry.package ??
          (isPresent(entry.name)
            ? `${entry.name}@${entry.version ?? "*"}`
            : undefined);
        if (isAbsent(spec)) {
          throw new ConfigError("Invalid package selector");
        }
        return {
          package: parsePackageSpec(spec),
          buildScript: entry["build-script"],
          allowGlobs: entry["allow-globs"],
          allow: entry.allow,
        };
      }),
    };
  }

  return config;
}

function mapLicenses(parsed: DenyConfigParsed["licenses"]): LicensesConfig {
  return {
    allow: parsed.allow,
    includeDev: parsed["include-dev"],
    exceptions: parsed.exceptions.map((entry) => ({
      package: toPackageSpec(entry),
      allow: entry.allow,
    })),
    clarify: parsed.clarify.map((entry) => ({
      package: toPackageSpec(entry),
      expression: entry.expression,
      integrity: entry.integrity,
      commit: entry.commit,
    })),
    private: {
      ignore: parsed.private.ignore,
      ignoreSources: parsed.private["ignore-sources"],
    },
    unusedAllowedLicense: parsed["unused-allowed-license"],
    unusedLicenseException: parsed["unused-license-exception"],
  };
}

function mapSources(parsed: DenyConfigParsed["sources"]): SourcesConfig {
  return {
    unknownRegistry: parsed["unknown-registry"],
    unknownGit: parsed["unknown-git"],
    unknownUrl: parsed["unknown-url"],
    unknownCustom: parsed["unknown-custom"],
    allowRegistry: parsed["allow-registry"],
    allowGit: parsed["allow-git"],
    allowUrl: parsed["allow-url"],
    allowCustom: parsed["allow-custom"],
    private: parsed.private,
    requiredGitSpec: parsed["required-git-spec"],
    unusedAllowedSource: parsed["unused-allowed-source"],
    unusedAllowedOrg: parsed["unused-allowed-org"],
    allowOrg: parsed["allow-org"],
  };
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${where}: ${issue.message}`;
    })
    .join("; ");
}

export class ConfigError extends Error {
  readonly configPath: string | undefined;

  constructor(message: string, configPath?: string) {
    super(isPresent(configPath) ? `${message} (${configPath})` : message);
    this.name = "ConfigError";
    this.configPath = configPath;
  }
}
