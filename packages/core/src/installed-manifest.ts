import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { depPathToFilename } from "@pnpm/deps.path";

import { isPresent } from "./optional.js";
import type { ResolvedInstance } from "./types.js";

/** Matches pnpm's default virtual-store filename length. */
const MAX_DEP_PATH_FILENAME_LENGTH = 120;

/**
 * Read the installed package.json from pnpm's virtual store
 * (`node_modules/.pnpm/<depPath>/node_modules/<name>/package.json`).
 * Used for git/url/file packages that are not on a package registry.
 */
export function readInstalledManifest(
  workspaceDir: string,
  instance: ResolvedInstance,
): Record<string, unknown> | undefined {
  if (instance.isWorkspace) {
    return undefined;
  }

  const filename = depPathToFilename(
    instance.depPath,
    MAX_DEP_PATH_FILENAME_LENGTH,
  );
  const virtualPath = join(
    workspaceDir,
    "node_modules",
    ".pnpm",
    filename,
    "node_modules",
    instance.artifact.name,
    "package.json",
  );
  const linkedPath = join(
    workspaceDir,
    "node_modules",
    instance.artifact.name,
    "package.json",
  );

  for (const candidate of [virtualPath, linkedPath]) {
    const manifest = readJsonObject(candidate);
    if (isPresent(manifest)) {
      return manifest;
    }
  }
  return undefined;
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  if (existsSync(path) === false) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
