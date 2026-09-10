import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parse as parseDepPath, refToRelative } from "@pnpm/deps.path";
import { findWorkspaceDir as findPnpmWorkspaceDir } from "@pnpm/find-workspace-dir";
import { getLockfileImporterId, readWantedLockfile } from "@pnpm/lockfile.fs";
import type {
  LockfileObject,
  PackageSnapshot,
  ProjectSnapshot,
} from "@pnpm/lockfile.types";
import { nameVerFromPkgSnapshot } from "@pnpm/lockfile.utils";
import type { Project } from "@pnpm/types";
import { filterProjects } from "@pnpm/workspace.projects-filter";
import { findWorkspaceProjectsNoCheck } from "@pnpm/workspace.projects-reader";
import { readWorkspaceManifest } from "@pnpm/workspace.workspace-manifest-reader";

import { isAbsent, isPresent } from "./optional.js";
import {
  artifactKey,
  normalizeLocator,
  normalizeRegistryUrl,
} from "./package-spec.js";
import type {
  DependencyEdge,
  DependencyField,
  DependencyGraph,
  GraphConfig,
  InclusionPath,
  PackageSource,
  ResolvedInstance,
  SourceKind,
} from "./types.js";
import { DEFAULT_NPM_REGISTRY } from "./types.js";

export interface LoadGraphOptions {
  workspaceDir: string;
  cwd?: string;
  filters?: string[];
  graphConfig?: GraphConfig;
}

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}

export async function findWorkspaceDir(
  cwd: string = process.cwd(),
): Promise<string> {
  const fromManifest = await findPnpmWorkspaceDir(cwd);
  if (isPresent(fromManifest)) {
    return fromManifest;
  }
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, "pnpm-lock.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(cwd);
    }
    current = parent;
  }
}

export async function loadDependencyGraph(
  options: LoadGraphOptions,
): Promise<DependencyGraph> {
  const workspaceDir = resolve(options.workspaceDir);
  const lockfilePath = join(workspaceDir, "pnpm-lock.yaml");
  const lockfile = await readWantedLockfile(workspaceDir, {
    ignoreIncompatible: false,
  });
  if (isAbsent(lockfile)) {
    throw new GraphError(`Missing or empty pnpm-lock.yaml in ${workspaceDir}`);
  }
  assertSupportedLockfile(lockfile);

  const workspaceManifest = await readWorkspaceManifest(workspaceDir);
  const projects = await findWorkspaceProjectsNoCheck(workspaceDir, {
    patterns: workspaceManifest?.packages,
  });
  if (projects.length === 0) {
    throw new GraphError(`No workspace packages found in ${workspaceDir}`);
  }

  assertLockfileMatchesProjects(workspaceDir, projects, lockfile);

  const selected = await selectProjects(
    workspaceDir,
    options.cwd ?? workspaceDir,
    projects,
    options.filters ?? [],
    workspaceManifest?.packages,
  );

  const packages = new Map<string, ResolvedInstance>();
  const edges: DependencyEdge[] = [];
  const roots: string[] = [];

  for (const project of selected) {
    const importerId = getLockfileImporterId(workspaceDir, project.rootDir);
    const id = workspaceId(importerId);
    roots.push(id);
    packages.set(id, workspaceInstance(id, importerId, project));
  }

  const snapshots: Record<string, PackageSnapshot> = {
    ...(lockfile.packages ?? {}),
  };
  const visit = (
    parentId: string,
    alias: string,
    reference: string,
    field: DependencyField,
    optional: boolean,
    parentDir: string,
    stack: Set<string>,
  ): void => {
    const childId = resolveChildId(
      workspaceDir,
      parentDir,
      alias,
      reference,
      snapshots,
      lockfile,
    );
    if (isAbsent(childId)) {
      return;
    }

    ensurePackage(
      childId,
      snapshots,
      packages,
      options.graphConfig,
      lockfile,
      workspaceDir,
    );
    const child = packages.get(childId);
    if (isAbsent(child) || !matchesPlatform(child, options.graphConfig)) {
      return;
    }

    edges.push({ parentId, childId, alias, field, optional });
    if (stack.has(childId)) {
      return;
    }
    stack.add(childId);
    const snapshot = snapshots[child.depPath];
    if (isPresent(snapshot) && child.isWorkspace === false) {
      walkSnapshotDeps(
        snapshot,
        childId,
        parentDirFor(child, workspaceDir),
        stack,
        visit,
      );
    }
    stack.delete(childId);
  };

  for (const project of selected) {
    const importerId = getLockfileImporterId(workspaceDir, project.rootDir);
    const parentId = workspaceId(importerId);
    const importer = lockfile.importers[importerId];
    if (isAbsent(importer)) {
      continue;
    }
    const stack = new Set<string>([parentId]);
    addImporterEdges(
      importer,
      parentId,
      project.rootDir,
      stack,
      visit,
      options.graphConfig,
    );
  }

  pruneExcluded(packages, edges, roots, options.graphConfig);

  return {
    roots,
    packages,
    edges,
    byArtifact: indexByArtifact(packages),
    byName: indexByName(packages),
    workspaceDir,
    lockfilePath,
  };
}

function assertSupportedLockfile(lockfile: LockfileObject): void {
  const version = Number.parseFloat(String(lockfile.lockfileVersion));
  if (!Number.isFinite(version) || version < 9) {
    throw new GraphError(
      `Unsupported lockfileVersion '${String(lockfile.lockfileVersion)}'; pnpm 10/11 (lockfile v9+) required`,
    );
  }
}

function assertLockfileMatchesProjects(
  workspaceDir: string,
  projects: Project[],
  lockfile: LockfileObject,
): void {
  for (const project of projects) {
    const importerId = getLockfileImporterId(workspaceDir, project.rootDir);
    const importer = lockfile.importers[importerId];
    if (isAbsent(importer)) {
      throw new GraphError(
        `Workspace package '${importerId}' is missing from pnpm-lock.yaml; run pnpm install`,
      );
    }
    assertSpecifierField(
      project.manifest.dependencies,
      importer,
      importerId,
      "dependencies",
    );
    assertSpecifierField(
      project.manifest.devDependencies,
      importer,
      importerId,
      "devDependencies",
    );
    assertSpecifierField(
      project.manifest.optionalDependencies,
      importer,
      importerId,
      "optionalDependencies",
    );
  }
}

function assertSpecifierField(
  declared: Record<string, string> | undefined,
  importer: ProjectSnapshot,
  importerId: string,
  field: "dependencies" | "devDependencies" | "optionalDependencies",
): void {
  if (isAbsent(declared)) {
    return;
  }
  const locked = {
    ...(importer.dependencies ?? {}),
    ...(importer.devDependencies ?? {}),
    ...(importer.optionalDependencies ?? {}),
  };
  for (const [name, specifier] of Object.entries(declared)) {
    const lockedRef = locked[name];
    if (isAbsent(lockedRef)) {
      throw new GraphError(
        `Stale lockfile: '${name}' in ${importerId} ${field} is not present in pnpm-lock.yaml`,
      );
    }
    const expected = importer.specifiers[name];
    if (isPresent(expected) && expected !== specifier) {
      throw new GraphError(
        `Stale lockfile: '${name}' in ${importerId} declares '${specifier}' but the lockfile specifier is '${expected}'`,
      );
    }
  }
}

async function selectProjects(
  workspaceDir: string,
  cwd: string,
  projects: Project[],
  filters: string[],
  _patterns: string[] | undefined,
): Promise<Project[]> {
  if (filters.length === 0) {
    return projects;
  }
  const result = await filterProjects(
    projects,
    filters.map((filter) => ({ filter, followProdDepsOnly: false })),
    {
      prefix: cwd,
      workspaceDir,
    },
  );
  if (result.unmatchedFilters.length > 0) {
    throw new GraphError(
      `No workspace packages matched filters: ${result.unmatchedFilters.join(", ")}`,
    );
  }
  const selected = Object.values(result.selectedProjectsGraph).map(
    (node) => node.package,
  );
  if (selected.length === 0) {
    throw new GraphError(
      `No workspace packages matched filters: ${filters.join(", ")}`,
    );
  }
  return selected;
}

function workspaceId(importerId: string): string {
  return `workspace:${importerId}`;
}

function workspaceInstance(
  id: string,
  importerId: string,
  project: Project,
): ResolvedInstance {
  const manifest = project.manifest;
  return {
    id,
    artifact: {
      name: manifest.name ?? importerId,
      version: manifest.version ?? "0.0.0",
      source: { kind: "workspace", locator: importerId },
    },
    depPath: id,
    isWorkspace: true,
    isPrivate: manifest.private === true,
    optional: false,
    license:
      typeof manifest.license === "string" ? manifest.license : undefined,
    scripts: manifest.scripts,
    os: manifest.os,
    cpu: manifest.cpu,
  };
}

function addImporterEdges(
  importer: ProjectSnapshot,
  parentId: string,
  parentDir: string,
  stack: Set<string>,
  visit: (
    parentId: string,
    alias: string,
    reference: string,
    field: DependencyField,
    optional: boolean,
    parentDir: string,
    stack: Set<string>,
  ) => void,
  graphConfig?: GraphConfig,
): void {
  const fields: Array<[DependencyField, Record<string, string> | undefined]> = [
    ["dependencies", importer.dependencies],
    ["optionalDependencies", importer.optionalDependencies],
  ];
  if (isAbsent(graphConfig) || graphConfig.excludeDev === false) {
    fields.push(["devDependencies", importer.devDependencies]);
  }
  for (const [field, deps] of fields) {
    if (isAbsent(deps)) {
      continue;
    }
    for (const [alias, reference] of Object.entries(deps)) {
      visit(
        parentId,
        alias,
        reference,
        field,
        field === "optionalDependencies",
        parentDir,
        stack,
      );
    }
  }
}

function walkSnapshotDeps(
  snapshot: PackageSnapshot,
  parentId: string,
  parentDir: string,
  stack: Set<string>,
  visit: (
    parentId: string,
    alias: string,
    reference: string,
    field: DependencyField,
    optional: boolean,
    parentDir: string,
    stack: Set<string>,
  ) => void,
): void {
  for (const [alias, reference] of Object.entries(
    snapshot.dependencies ?? {},
  )) {
    visit(parentId, alias, reference, "dependencies", false, parentDir, stack);
  }
  for (const [alias, reference] of Object.entries(
    snapshot.optionalDependencies ?? {},
  )) {
    visit(
      parentId,
      alias,
      reference,
      "optionalDependencies",
      true,
      parentDir,
      stack,
    );
  }
}

function resolveChildId(
  workspaceDir: string,
  parentDir: string,
  alias: string,
  reference: string,
  snapshots: Record<string, PackageSnapshot>,
  lockfile: LockfileObject,
): string | undefined {
  if (reference.startsWith("link:") || reference.startsWith("workspace:")) {
    const target = reference.replace(/^(link:|workspace:)/, "");
    const absolute = resolve(parentDir, target);
    const importerId = getLockfileImporterId(workspaceDir, absolute);
    if (isPresent(lockfile.importers[importerId])) {
      return workspaceId(importerId);
    }
  }

  const depPath = refToRelative(reference, alias);
  if (
    isPresent(depPath) &&
    (isPresent(snapshots[depPath]) || isPresent(snapshots[stripPeers(depPath)]))
  ) {
    return isPresent(snapshots[depPath]) ? depPath : stripPeers(depPath);
  }
  return undefined;
}

function ensurePackage(
  depPath: string,
  snapshots: Record<string, PackageSnapshot>,
  packages: Map<string, ResolvedInstance>,
  graphConfig: GraphConfig | undefined,
  lockfile: LockfileObject,
  _workspaceDir: string,
): void {
  if (packages.has(depPath) || depPath.startsWith("workspace:")) {
    if (depPath.startsWith("workspace:") && !packages.has(depPath)) {
      const importerId = depPath.slice("workspace:".length);
      const importer =
        lockfile.importers[importerId as keyof typeof lockfile.importers];
      if (isPresent(importer)) {
        packages.set(depPath, {
          id: depPath,
          artifact: {
            name: importerId,
            version: "0.0.0",
            source: { kind: "workspace", locator: importerId },
          },
          depPath,
          isWorkspace: true,
          isPrivate: true,
          optional: false,
        });
      }
    }
    return;
  }
  const snapshot = snapshots[depPath] ?? snapshots[stripPeers(depPath)];
  if (isAbsent(snapshot)) {
    return;
  }
  const { name, version } = nameVerFromPkgSnapshot(depPath, snapshot);
  const parsed = parseDepPath(depPath);
  const instance: ResolvedInstance = {
    id: depPath,
    artifact: {
      name,
      version,
      source: classifySource(depPath, snapshot, parsed.registryName),
    },
    depPath,
    isWorkspace: false,
    isPrivate: false,
    optional: snapshot.optional === true,
    os: snapshot.os,
    cpu: snapshot.cpu,
    libc: snapshot.libc,
    engines: snapshot.engines,
    hasBin: snapshot.hasBin,
  };
  if (!matchesPlatform(instance, graphConfig)) {
    return;
  }
  packages.set(depPath, instance);
}

function classifySource(
  depPath: string,
  snapshot: PackageSnapshot,
  registryName?: string,
): PackageSource {
  const resolution = snapshot.resolution;
  if ("type" in resolution) {
    if (resolution.type === "directory") {
      return { kind: "directory", locator: resolution.directory };
    }
    if (resolution.type === "git") {
      return {
        kind: "git",
        locator: normalizeLocator(resolution.repo),
        commit: resolution.commit,
      };
    }
    if (resolution.type === "binary") {
      return {
        kind: "binary",
        locator: resolution.url,
        integrity: stringField(resolution.integrity),
      };
    }
    if (
      typeof resolution.type === "string" &&
      resolution.type.startsWith("custom:")
    ) {
      return { kind: "custom", locator: resolution.type };
    }
  }
  if ("tarball" in resolution && typeof resolution.tarball === "string") {
    const tarball = resolution.tarball;
    if (tarball.startsWith("file:")) {
      return {
        kind: "file",
        locator: tarball,
        integrity: stringField(resolution.integrity),
      };
    }
    if (resolution.gitHosted === true) {
      return {
        kind: "git",
        locator: tarball,
        integrity: stringField(resolution.integrity),
      };
    }
    if (!isLikelyRegistryTarball(tarball)) {
      return {
        kind: "url",
        locator: tarball,
        integrity: stringField(resolution.integrity),
      };
    }
    return {
      kind: "registry",
      locator: registryFromTarball(tarball),
      integrity: stringField(resolution.integrity),
      registryName,
    };
  }
  void depPath;
  return {
    kind: "registry",
    locator: DEFAULT_NPM_REGISTRY,
    integrity:
      "integrity" in resolution ? stringField(resolution.integrity) : undefined,
    registryName,
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isLikelyRegistryTarball(tarball: string): boolean {
  return (
    tarball.includes("/-/") ||
    tarball.includes("registry.npmjs.org") ||
    tarball.includes("registry.npmjs.com") ||
    tarball.includes("npm.pkg.github.com")
  );
}

function registryFromTarball(tarball: string): string {
  try {
    const url = new URL(tarball);
    return normalizeRegistryUrl(`${url.protocol}//${url.host}`);
  } catch {
    return DEFAULT_NPM_REGISTRY;
  }
}

function stripPeers(depPath: string): string {
  const idx = depPath.indexOf("(");
  return idx === -1 ? depPath : depPath.slice(0, idx);
}

function parentDirFor(
  instance: ResolvedInstance,
  workspaceDir: string,
): string {
  if (instance.isWorkspace && isPresent(instance.artifact.source.locator)) {
    return instance.artifact.source.locator === "."
      ? workspaceDir
      : resolve(workspaceDir, instance.artifact.source.locator);
  }
  return workspaceDir;
}

function matchesPlatform(
  instance: ResolvedInstance,
  graphConfig?: GraphConfig,
): boolean {
  if (isAbsent(graphConfig)) {
    return true;
  }
  if (
    graphConfig.os.length > 0 &&
    isPresent(instance.os) &&
    instance.os.length > 0
  ) {
    if (!instance.os.some((value) => graphConfig.os.includes(value))) {
      return false;
    }
  }
  if (
    graphConfig.cpu.length > 0 &&
    isPresent(instance.cpu) &&
    instance.cpu.length > 0
  ) {
    if (!instance.cpu.some((value) => graphConfig.cpu.includes(value))) {
      return false;
    }
  }
  if (
    graphConfig.libc.length > 0 &&
    isPresent(instance.libc) &&
    instance.libc.length > 0
  ) {
    if (!instance.libc.some((value) => graphConfig.libc.includes(value))) {
      return false;
    }
  }
  return true;
}

function pruneExcluded(
  packages: Map<string, ResolvedInstance>,
  edges: DependencyEdge[],
  roots: string[],
  graphConfig?: GraphConfig,
): void {
  if (isAbsent(graphConfig)) {
    return;
  }
  const excludedNames = new Set(graphConfig.exclude);
  if (graphConfig.excludeUnpublished) {
    for (const pkg of packages.values()) {
      if (pkg.isWorkspace && pkg.isPrivate) {
        excludedNames.add(pkg.artifact.name);
      }
    }
  }
  if (excludedNames.size === 0) {
    return;
  }

  const excludedIds = new Set<string>();
  for (const pkg of packages.values()) {
    if (excludedNames.has(pkg.artifact.name)) {
      excludedIds.add(pkg.id);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const reachable = new Set<string>(
      roots.filter((id) => !excludedIds.has(id)),
    );
    const queue = [...reachable];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const edge of edges) {
        if (edge.parentId !== current || excludedIds.has(edge.childId)) {
          continue;
        }
        if (!reachable.has(edge.childId)) {
          reachable.add(edge.childId);
          queue.push(edge.childId);
        }
      }
    }
    for (const id of packages.keys()) {
      if (!reachable.has(id) && !excludedIds.has(id)) {
        excludedIds.add(id);
        changed = true;
      }
    }
  }

  for (const id of excludedIds) {
    packages.delete(id);
  }
  for (let i = edges.length - 1; i >= 0; i -= 1) {
    const edge = edges[i]!;
    if (excludedIds.has(edge.parentId) || excludedIds.has(edge.childId)) {
      edges.splice(i, 1);
    }
  }
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    if (excludedIds.has(roots[i]!)) {
      roots.splice(i, 1);
    }
  }
}

function indexByArtifact(
  packages: Map<string, ResolvedInstance>,
): Map<string, string[]> {
  const byArtifact = new Map<string, string[]>();
  for (const pkg of packages.values()) {
    if (pkg.isWorkspace) {
      continue;
    }
    const key = artifactKey(pkg.artifact);
    byArtifact.set(key, [...(byArtifact.get(key) ?? []), pkg.id]);
  }
  return byArtifact;
}

function indexByName(
  packages: Map<string, ResolvedInstance>,
): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const pkg of packages.values()) {
    if (pkg.isWorkspace) {
      continue;
    }
    byName.set(pkg.artifact.name, [
      ...(byName.get(pkg.artifact.name) ?? []),
      pkg.id,
    ]);
  }
  return byName;
}

export function getInclusionPaths(
  graph: DependencyGraph,
  packageId: string,
  limit = 100,
): InclusionPath[] {
  const paths: InclusionPath[] = [];
  const edgeIndex = new Map<string, DependencyEdge[]>();
  for (const edge of graph.edges) {
    const list = edgeIndex.get(edge.childId) ?? [];
    list.push(edge);
    edgeIndex.set(edge.childId, list);
  }

  const walk = (
    current: string,
    hops: InclusionPath["hops"],
    visited: Set<string>,
  ): void => {
    if (paths.length >= limit) {
      return;
    }
    if (graph.roots.includes(current)) {
      paths.push({ rootId: current, hops: [...hops].reverse() });
      return;
    }
    const parents = edgeIndex.get(current) ?? [];
    for (const edge of parents) {
      if (visited.has(edge.parentId)) {
        continue;
      }
      visited.add(edge.parentId);
      hops.push({
        alias: edge.alias,
        packageId: edge.childId,
        field: edge.field,
      });
      walk(edge.parentId, hops, visited);
      hops.pop();
      visited.delete(edge.parentId);
    }
  };

  walk(packageId, [], new Set([packageId]));
  return paths;
}

export function prodReachableIds(graph: DependencyGraph): Set<string> {
  const reachable = new Set<string>(graph.roots);
  const queue = [...graph.roots];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of graph.edges) {
      if (edge.parentId !== current || edge.field === "devDependencies") {
        continue;
      }
      if (!reachable.has(edge.childId)) {
        reachable.add(edge.childId);
        queue.push(edge.childId);
      }
    }
  }
  return reachable;
}

export type { SourceKind };
