import { z } from "zod";

import { isAbsent, isPresent } from "./optional.js";
import { normalizeRegistryUrl } from "./package-spec.js";
import type { MetadataService, PackageMetadata } from "./types.js";
import { DEFAULT_NPM_REGISTRY } from "./types.js";

const packumentVersionSchema = z
  .object({
    name: z.string().optional(),
    version: z.string(),
    license: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional(),
    deprecated: z.string().optional(),
    description: z.string().optional(),
    repository: z
      .union([
        z.string(),
        z.object({ url: z.string().optional() }).passthrough(),
      ])
      .optional(),
  })
  .passthrough();

const packumentSchema = z
  .object({
    name: z.string(),
    versions: z.record(z.string(), packumentVersionSchema).default({}),
    time: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export interface RegistryMetadataServiceOptions {
  defaultRegistry?: string;
  offline?: boolean;
  fetchImpl?: typeof fetch;
}

export function createRegistryMetadataService(
  options: RegistryMetadataServiceOptions = {},
): MetadataService {
  const cache = new Map<string, PackageMetadata | undefined>();
  const packumentCache = new Map<
    string,
    z.infer<typeof packumentSchema> | undefined
  >();
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultRegistry = normalizeRegistryUrl(
    options.defaultRegistry ?? DEFAULT_NPM_REGISTRY,
  );

  return {
    async getPackageMetadata(name, version, registry = defaultRegistry) {
      const key = `${registry}::${name}@${version}`;
      if (cache.has(key)) {
        return cache.get(key);
      }
      if (options.offline === true) {
        cache.set(key, undefined);
        return undefined;
      }

      const packument = await loadPackument(name, registry);
      if (isAbsent(packument)) {
        cache.set(key, undefined);
        return undefined;
      }

      const versionMeta = packument.versions[version];
      if (isAbsent(versionMeta)) {
        const unpublished: PackageMetadata = {
          name,
          version,
          unpublished: true,
        };
        cache.set(key, unpublished);
        return unpublished;
      }

      const license =
        typeof versionMeta.license === "string"
          ? versionMeta.license
          : undefined;
      const repository =
        typeof versionMeta.repository === "string"
          ? versionMeta.repository
          : isPresent(versionMeta.repository)
            ? versionMeta.repository.url
            : undefined;

      const metadata: PackageMetadata = {
        name: versionMeta.name ?? name,
        version: versionMeta.version,
        license,
        deprecated: versionMeta.deprecated,
        description: versionMeta.description,
        repository,
        unpublished: false,
      };
      cache.set(key, metadata);
      return metadata;
    },
  };

  async function loadPackument(
    name: string,
    registry: string,
  ): Promise<z.infer<typeof packumentSchema> | undefined> {
    const key = `${registry}::${name}`;
    if (packumentCache.has(key)) {
      return packumentCache.get(key);
    }
    const url = `${normalizeRegistryUrl(registry)}${encodeURIComponent(name).replace(/^%40/, "@")}`;
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
      });
      if (response.status === 404) {
        packumentCache.set(key, undefined);
        return undefined;
      }
      if (response.ok === false) {
        packumentCache.set(key, undefined);
        return undefined;
      }
      const json: unknown = await response.json();
      const parsed = packumentSchema.safeParse(json);
      if (parsed.success === false) {
        packumentCache.set(key, undefined);
        return undefined;
      }
      packumentCache.set(key, parsed.data);
      return parsed.data;
    } catch {
      packumentCache.set(key, undefined);
      return undefined;
    }
  }
}
