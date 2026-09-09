import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";

import { type ConfigError, parseDenyConfig } from "./config.js";
import {
  discoverConfigPath,
  discoverExceptionsPath,
} from "./discover-config.js";
import { isAbsent, isPresent } from "./optional.js";
import type { DenyConfig } from "./types.js";

export function loadDenyConfig(options: {
  startDir: string;
  configPath?: string;
}): { config: DenyConfig; warnedMissing: boolean } {
  const discovered = discoverConfigPath(options.startDir, options.configPath);
  if (isAbsent(discovered)) {
    return {
      config: parseDenyConfig({}, undefined),
      warnedMissing: true,
    };
  }

  const raw = parseYaml(readFileSync(discovered, "utf8"));
  const config = parseDenyConfig(raw, discovered);

  const exceptionsPath = discoverExceptionsPath(options.startDir);
  if (isPresent(exceptionsPath)) {
    const exceptionsRaw = parseYaml(readFileSync(exceptionsPath, "utf8"));
    mergeExceptions(config, exceptionsRaw, exceptionsPath);
  }

  return { config, warnedMissing: false };
}

function mergeExceptions(config: DenyConfig, raw: unknown, path: string): void {
  if (isAbsent(raw) || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Exceptions file must be a mapping (${path})`);
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "exceptions")) {
    throw new Error(`Exceptions file may only contain 'exceptions' (${path})`);
  }
  const merged = parseDenyConfig(
    {
      licenses: {
        allow: config.licenses.allow,
        "include-dev": config.licenses.includeDev,
        exceptions: record.exceptions ?? [],
        clarify: config.licenses.clarify.map((entry) => ({
          package: entry.package.raw,
          expression: entry.expression,
          integrity: entry.integrity,
          commit: entry.commit,
        })),
        private: {
          ignore: config.licenses.private.ignore,
          registries: config.licenses.private.registries,
          "ignore-sources": config.licenses.private.ignoreSources,
        },
        "unused-allowed-license": config.licenses.unusedAllowedLicense,
        "unused-license-exception": config.licenses.unusedLicenseException,
      },
    },
    config.path,
  );
  config.licenses.exceptions = [
    ...config.licenses.exceptions,
    ...merged.licenses.exceptions,
  ];
}

export type { ConfigError };
