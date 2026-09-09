import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { isAbsent } from "./optional.js";
import type { ResolvedInstance, StoreService } from "./types.js";

export interface FilesystemStoreServiceOptions {
  storeDir?: string;
  offline?: boolean;
}

/**
 * Resolves package contents from pnpm's content-addressable store when present.
 * Falls back to scanning nothing when the store path cannot be resolved.
 */
export function createFilesystemStoreService(
  options: FilesystemStoreServiceOptions = {},
): StoreService {
  return {
    getPackageContents(instance: ResolvedInstance) {
      const integrity = instance.artifact.source.integrity;
      if (isAbsent(integrity) || isAbsent(options.storeDir)) {
        return Promise.resolve(undefined);
      }
      const rootDir = resolveIntegrityPath(options.storeDir, integrity);
      if (isAbsent(rootDir) || existsSync(rootDir) === false) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({
        rootDir,
        files: listFilesRecursive(rootDir, rootDir),
      });
    },
  };
}

export function sha256File(path: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function resolveIntegrityPath(
  storeDir: string,
  integrity: string,
): string | undefined {
  // ssri-style integrity: sha512-...
  const dash = integrity.indexOf("-");
  if (dash === -1) {
    return undefined;
  }
  const hash = integrity.slice(dash + 1);
  // pnpm virtual store index layout varies; support files/<hash> heuristic.
  const candidates = [
    join(storeDir, "files", hash.slice(0, 2), hash.slice(2)),
    join(storeDir, "v3", "files", hash.slice(0, 2), hash.slice(2)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function listFilesRecursive(rootDir: string, current: string): string[] {
  const entries = readdirSync(current);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(current, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(rootDir, absolute));
    } else if (stats.isFile()) {
      files.push(absolute.slice(rootDir.length + 1));
    }
  }
  return files;
}
