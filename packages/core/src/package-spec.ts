import semver from "semver";

import { isAbsent, isPresent } from "./optional.js";
import type {
  ArtifactIdentity,
  PackageSpec,
  ResolvedInstance,
} from "./types.js";

/**
 * Parse npm-aware package selectors:
 * - "lodash"
 * - "lodash@^4.0.0"
 * - "@scope/name"
 * - "@scope/name@1.2.3"
 */
export function parsePackageSpec(raw: string): PackageSpec {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Package selector must not be empty");
  }

  if (trimmed.startsWith("@")) {
    const slash = trimmed.indexOf("/");
    if (slash === -1) {
      throw new Error(`Invalid scoped package selector: ${raw}`);
    }
    const afterScope = trimmed.slice(slash + 1);
    const at = afterScope.indexOf("@");
    if (at === -1) {
      return { name: trimmed, range: "*", raw: trimmed };
    }
    const name = trimmed.slice(0, slash + 1 + at);
    const range = afterScope.slice(at + 1);
    return { name, range: range === "" ? "*" : range, raw: trimmed };
  }

  const at = trimmed.indexOf("@");
  if (at === -1) {
    return { name: trimmed, range: "*", raw: trimmed };
  }
  return {
    name: trimmed.slice(0, at),
    range: trimmed.slice(at + 1) === "" ? "*" : trimmed.slice(at + 1),
    raw: trimmed,
  };
}

export function packageSpecFromUnknown(value: unknown): PackageSpec {
  if (typeof value === "string") {
    return parsePackageSpec(value);
  }
  if (typeof value === "object" && isPresent(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.package === "string") {
      return parsePackageSpec(record.package);
    }
    if (typeof record.crate === "string") {
      return parsePackageSpec(record.crate.replace(":", "@"));
    }
    if (typeof record.name === "string") {
      const version = typeof record.version === "string" ? record.version : "*";
      return parsePackageSpec(`${record.name}@${version}`);
    }
  }
  throw new Error(`Invalid package selector: ${JSON.stringify(value)}`);
}

export function matchesPackageSpec(
  spec: PackageSpec,
  name: string,
  version: string,
): boolean {
  if (spec.name !== name) {
    return false;
  }
  if (spec.range === "*" || spec.range === "x" || spec.range === "X") {
    return true;
  }
  const coerced = semver.coerce(version);
  if (isAbsent(coerced)) {
    return spec.range === version;
  }
  try {
    return semver.satisfies(coerced.version, spec.range, {
      includePrerelease: true,
    });
  } catch {
    return spec.range === version;
  }
}

export function matchesInstance(
  spec: PackageSpec,
  instance: ResolvedInstance,
): boolean {
  return matchesPackageSpec(
    spec,
    instance.artifact.name,
    instance.artifact.version,
  );
}

export function artifactKey(artifact: ArtifactIdentity): string {
  const source = sourceKey(artifact.source);
  return `${artifact.name}@${artifact.version}::${source}`;
}

export function sourceKey(source: ArtifactIdentity["source"]): string {
  const parts: string[] = [source.kind];
  if (isPresent(source.registryName)) {
    parts.push(`registry=${source.registryName}`);
  }
  if (isPresent(source.locator)) {
    parts.push(`locator=${normalizeLocator(source.locator)}`);
  }
  if (isPresent(source.integrity)) {
    parts.push(`integrity=${source.integrity}`);
  }
  if (isPresent(source.commit)) {
    parts.push(`commit=${source.commit}`);
  }
  return parts.join("|");
}

export function normalizeLocator(locator: string): string {
  return locator
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function normalizeRegistryUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * Parse an ignore-sources entry.
 * Accepts registry URLs (preferred) or bare registry names.
 */
export function parseIgnoreSource(entry: string): {
  names: string[];
  locators: string[];
} {
  const trimmed = entry.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes("://")) {
    return { names: [], locators: [normalizeLocator(trimmed)] };
  }
  return {
    names: [trimmed],
    locators: [normalizeLocator(trimmed)],
  };
}

export function matchesIgnoreSource(
  entry: string,
  source: ArtifactIdentity["source"],
): boolean {
  const parsed = parseIgnoreSource(entry);
  if (
    isPresent(source.registryName) &&
    parsed.names.some(
      (name) => name.toLowerCase() === source.registryName!.toLowerCase(),
    )
  ) {
    return true;
  }
  if (isAbsent(source.locator)) {
    return false;
  }
  return parsed.locators.some((ignoreLocator) =>
    locatorMatchesIgnore(source.locator!, ignoreLocator),
  );
}

function locatorMatchesIgnore(
  packageLocator: string,
  ignoreLocator: string,
): boolean {
  const pkg = normalizeLocator(packageLocator);
  const ign = normalizeLocator(ignoreLocator);
  if (pkg === ign) {
    return true;
  }
  const pkgHost = registryHost(packageLocator);
  const ignHost = registryHost(ignoreLocator);
  if (isPresent(pkgHost) && isPresent(ignHost) && pkgHost === ignHost) {
    return true;
  }
  return pkg.startsWith(`${ign}/`);
}

function registryHost(value: string): string | undefined {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).host.toLowerCase();
  } catch {
    return undefined;
  }
}
