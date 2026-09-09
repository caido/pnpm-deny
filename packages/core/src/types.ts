export type LintLevel = "allow" | "warn" | "deny";

export type CheckName = "advisories" | "bans" | "licenses" | "sources";

export type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

export type SourceKind =
  | "registry"
  | "git"
  | "directory"
  | "file"
  | "link"
  | "workspace"
  | "url"
  | "custom"
  | "binary"
  | "runtime";

export interface PackageSource {
  kind: SourceKind;
  /** Normalized registry URL or host path. */
  locator?: string;
  /** Integrity hash when available. */
  integrity?: string;
  /** Git commit/revision when available. */
  commit?: string;
  /** Named registry from the dep path, if any. */
  registryName?: string;
}

/** Artifact Identity: canonical name + version + source. */
export interface ArtifactIdentity {
  name: string;
  version: string;
  source: PackageSource;
}

/** Resolved Instance in the lockfile, including peer/patch suffixes. */
export interface ResolvedInstance {
  id: string;
  artifact: ArtifactIdentity;
  /** Full lockfile depPath including peer/patch suffixes. */
  depPath: string;
  isWorkspace: boolean;
  isPrivate: boolean;
  optional: boolean;
  os?: string[];
  cpu?: string[];
  libc?: string[];
  engines?: Record<string, string>;
  hasBin?: boolean;
  /** Declared license from package metadata when known. */
  license?: string;
  /** Lifecycle scripts present on the package. */
  scripts?: Record<string, string>;
  /** Whether binding.gyp implies node-gyp. */
  hasBindingGyp?: boolean;
}

export interface DependencyEdge {
  parentId: string;
  childId: string;
  alias: string;
  field: DependencyField;
  optional: boolean;
}

export interface InclusionPath {
  /** Root workspace package id. */
  rootId: string;
  /** Edges from root to the target, as alias hops. */
  hops: Array<{ alias: string; packageId: string; field: DependencyField }>;
}

export interface DependencyGraph {
  roots: string[];
  packages: Map<string, ResolvedInstance>;
  edges: DependencyEdge[];
  /** Map from Artifact Identity key to package ids sharing it. */
  byArtifact: Map<string, string[]>;
  /** Map from package name to package ids. */
  byName: Map<string, string[]>;
  workspaceDir: string;
  lockfilePath: string;
}

export interface Finding {
  check: CheckName;
  code: string;
  level: LintLevel;
  message: string;
  packageId?: string;
  packageName?: string;
  packageVersion?: string;
  alias?: string;
  inclusionPaths?: InclusionPath[];
  help?: string;
  labels?: Record<string, string>;
}

export interface CheckStats {
  check: CheckName;
  errors: number;
  warnings: number;
  notes: number;
}

export interface CheckResult {
  check: CheckName;
  findings: Finding[];
  stats: CheckStats;
  /** Extra payload for audit-compatible output. */
  auditCompatible?: unknown;
}

export interface CheckContext {
  graph: DependencyGraph;
  config: DenyConfig;
  overrides: LintOverrides;
  offline: boolean;
  metadata: MetadataService;
  store: StoreService;
}

export interface PolicyCheck {
  name: CheckName;
  run(context: CheckContext): Promise<CheckResult>;
}

export interface LintOverrides {
  allow: Set<string>;
  warn: Set<string>;
  deny: Set<string>;
}

export interface PackageSpec {
  name: string;
  range: string;
  raw: string;
}

export interface DenyConfig {
  path?: string;
  graph: GraphConfig;
  output: OutputConfig;
  advisories: AdvisoriesConfig;
  bans: BansConfig;
  licenses: LicensesConfig;
  sources: SourcesConfig;
}

export interface GraphConfig {
  exclude: string[];
  excludeDev: boolean;
  excludeUnpublished: boolean;
  os: string[];
  cpu: string[];
  libc: string[];
}

export interface OutputConfig {
  featureDepth: number;
}

export interface AdvisoriesConfig {
  ignore: Array<{ id?: string; package?: PackageSpec; reason?: string }>;
  unpublished: LintLevel;
  deprecated: LintLevel;
  unusedIgnoredAdvisory: LintLevel;
  providers: string[];
}

export interface BansConfig {
  multipleVersions: LintLevel;
  multipleVersionsIncludeDev: boolean;
  wildcards: LintLevel;
  allowWildcardPaths: boolean;
  distTags: LintLevel;
  allow: BanEntry[];
  deny: BanEntry[];
  skip: PackageSpec[];
  skipTree: Array<PackageSpec & { depth?: number }>;
  allowWorkspace: boolean;
  workspaceDependencies?: {
    duplicates: LintLevel;
    includePathDependencies: boolean;
    unused: LintLevel;
  };
  build?: BuildConfig;
}

export interface BanEntry {
  package: PackageSpec;
  wrappers?: string[];
  reason?: string;
  useInstead?: string;
  denyMultipleVersions?: boolean;
}

export interface BuildConfig {
  allowBuildScripts?: PackageSpec[];
  executables: LintLevel;
  interpreted: LintLevel;
  scriptExtensions: string[];
  enableBuiltinGlobs: boolean;
  includeDependencies: boolean;
  includeWorkspace: boolean;
  includeArchives: boolean;
  bypass: BuildBypass[];
}

export interface BuildBypass {
  package: PackageSpec;
  buildScript?: string;
  allowGlobs?: string[];
  allow?: Array<{ path: string; checksum?: string }>;
}

export interface LicensesConfig {
  allow: string[];
  includeDev: boolean;
  exceptions: Array<{ package: PackageSpec; allow: string[] }>;
  clarify: Array<{
    package: PackageSpec;
    expression: string;
    integrity?: string;
    commit?: string;
  }>;
  private: {
    ignore: boolean;
    registries: string[];
    ignoreSources: string[];
  };
  unusedAllowedLicense: LintLevel;
  unusedLicenseException: LintLevel;
}

export interface SourcesConfig {
  unknownRegistry: LintLevel;
  unknownGit: LintLevel;
  unknownUrl: LintLevel;
  unknownCustom: LintLevel;
  allowRegistry: string[];
  allowGit: string[];
  allowUrl: string[];
  allowCustom: string[];
  private: string[];
  requiredGitSpec: "any" | "branch" | "tag" | "rev";
  unusedAllowedSource: LintLevel;
  unusedAllowedOrg: LintLevel;
  allowOrg: {
    github: string[];
    gitlab: string[];
    bitbucket: string[];
  };
}

export interface PackageMetadata {
  name: string;
  version: string;
  license?: string;
  deprecated?: string;
  unpublished?: boolean;
  description?: string;
  repository?: string;
}

export interface MetadataService {
  getPackageMetadata(
    name: string,
    version: string,
    registry?: string,
  ): Promise<PackageMetadata | undefined>;
}

export interface StorePackageContents {
  rootDir: string;
  files: string[];
}

export interface StoreService {
  getPackageContents(
    instance: ResolvedInstance,
  ): Promise<StorePackageContents | undefined>;
}

export const CHECK_EXIT_BITS: Record<CheckName, number> = {
  advisories: 0x1,
  bans: 0x2,
  licenses: 0x4,
  sources: 0x8,
};

export const DEFAULT_NPM_REGISTRY = "https://registry.npmjs.org/";
