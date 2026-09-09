import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isPresent } from "./optional.js";

const CONFIG_NAMES = ["pnpm-deny.yaml", ".pnpm-deny.yaml"];
const EXCEPTION_NAMES = [
  "pnpm-deny.exceptions.yaml",
  ".pnpm-deny.exceptions.yaml",
];

export function discoverConfigPath(
  startDir: string,
  explicit?: string,
): string | undefined {
  if (isPresent(explicit)) {
    const resolved = resolve(explicit);
    return existsSync(resolved) ? resolved : undefined;
  }

  let current = resolve(startDir);
  while (true) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(current, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function discoverExceptionsPath(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (true) {
    for (const name of EXCEPTION_NAMES) {
      const candidate = join(current, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function defaultConfigPath(workspaceDir: string): string {
  return join(workspaceDir, "pnpm-deny.yaml");
}
