export type {
  AdvisoriesConfig,
  ArtifactIdentity,
  BanEntry,
  BansConfig,
  BuildBypass,
  BuildConfig,
  CheckContext,
  CheckName,
  CheckResult,
  CheckStats,
  DenyConfig,
  DependencyEdge,
  DependencyField,
  DependencyGraph,
  Finding,
  GraphConfig,
  InclusionPath,
  LicensesConfig,
  LintLevel,
  LintOverrides,
  MetadataService,
  OutputConfig,
  PackageMetadata,
  PackageSource,
  PackageSpec,
  PolicyCheck,
  ResolvedInstance,
  SourceKind,
  SourcesConfig,
  StorePackageContents,
  StoreService,
} from "./types.js";

export { CHECK_EXIT_BITS, DEFAULT_NPM_REGISTRY } from "./types.js";

export {
  ConfigError,
  defaultAdvisoriesConfig,
  defaultBansConfig,
  defaultDenyConfig,
  defaultGraphConfig,
  defaultLicensesConfig,
  defaultSourcesConfig,
  denyConfigSchema,
  parseDenyConfig,
} from "./config.js";

export {
  defaultConfigPath,
  discoverConfigPath,
  discoverExceptionsPath,
} from "./discover-config.js";

export { loadDenyConfig } from "./load-config.js";

export { isAbsent, isPresent } from "./optional.js";
export type { Maybe } from "./optional.js";

export {
  findWorkspaceDir,
  getInclusionPaths,
  GraphError,
  loadDependencyGraph,
  prodReachableIds,
} from "./graph.js";

export type { LoadGraphOptions } from "./graph.js";

export {
  applyOverrides,
  emptyOverrides,
  maxLevel,
  parseLintLevel,
  statsFromFindings,
} from "./lint.js";

export {
  artifactKey,
  matchesInstance,
  matchesPackageSpec,
  normalizeLocator,
  normalizeRegistryUrl,
  packageSpecFromUnknown,
  parsePackageSpec,
  sourceKey,
} from "./package-spec.js";

export { createRegistryMetadataService } from "./metadata.js";

export type { RegistryMetadataServiceOptions } from "./metadata.js";

export { createFilesystemStoreService, sha256File } from "./store.js";

export type { FilesystemStoreServiceOptions } from "./store.js";

export {
  aggregateStats,
  emptyCheckResult,
  findingToJson,
  formatFindingHuman,
  formatInclusionPath,
  statsToExitCode,
  toSarif,
} from "./diagnostics.js";

export { runChecks } from "./run-checks.js";
