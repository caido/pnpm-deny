import {
  type CheckContext,
  defaultDenyConfig,
  type DependencyGraph,
  emptyOverrides,
  type MetadataService,
  type ResolvedInstance,
} from "@pnpm-deny/core";
import { describe, expect, it } from "vitest";

import { createLicensesCheck } from "./index.js";

function instance(pkg: {
  id: string;
  artifact: ResolvedInstance["artifact"];
  isWorkspace?: boolean;
  license?: string;
}): ResolvedInstance {
  return {
    id: pkg.id,
    artifact: pkg.artifact,
    depPath: pkg.id,
    isWorkspace: pkg.isWorkspace === true,
    isPrivate: false,
    optional: false,
    license: pkg.license,
  };
}

function graphOf(
  packages: ResolvedInstance[],
  edges: DependencyGraph["edges"] = [],
): DependencyGraph {
  const map = new Map(packages.map((pkg) => [pkg.id, pkg]));
  return {
    roots: packages
      .filter((pkg) => pkg.isWorkspace === true)
      .map((pkg) => pkg.id),
    packages: map,
    edges,
    byArtifact: new Map(),
    byName: new Map(),
    workspaceDir: "/tmp",
    lockfilePath: "/tmp/pnpm-lock.yaml",
  };
}

function context(
  graph: DependencyGraph,
  allow: string[],
  metadata: MetadataService,
): CheckContext {
  const config = defaultDenyConfig();
  config.licenses.allow = allow;
  config.licenses.unusedAllowedLicense = "allow";
  return {
    graph,
    config,
    overrides: emptyOverrides(),
    offline: true,
    metadata,
    store: {
      getPackageContents: () => Promise.resolve(undefined),
    },
  };
}

describe("licenses check", () => {
  it("denies undeclared licenses", async () => {
    const root = instance({
      id: "workspace:.",
      isWorkspace: true,
      artifact: {
        name: "root",
        version: "1.0.0",
        source: { kind: "workspace" },
      },
      license: "MIT",
    });
    const dep = instance({
      id: "ms@2.1.3",
      artifact: {
        name: "ms",
        version: "2.1.3",
        source: { kind: "registry", locator: "https://registry.npmjs.org/" },
      },
    });
    const result = await createLicensesCheck().run(
      context(
        graphOf(
          [root, dep],
          [
            {
              parentId: root.id,
              childId: dep.id,
              alias: "ms",
              field: "dependencies",
              optional: false,
            },
          ],
        ),
        ["MIT"],
        {
          getPackageMetadata: () =>
            Promise.resolve({ name: "ms", version: "2.1.3" }),
        },
      ),
    );
    expect(
      result.findings.some((finding) => finding.code === "unlicensed"),
    ).toBe(true);
    expect(result.stats.errors).toBeGreaterThan(0);
  });

  it("allows a declared license on the allow list", async () => {
    const root = instance({
      id: "workspace:.",
      isWorkspace: true,
      artifact: {
        name: "root",
        version: "1.0.0",
        source: { kind: "workspace" },
      },
      license: "MIT",
    });
    const dep = instance({
      id: "ms@2.1.3",
      artifact: { name: "ms", version: "2.1.3", source: { kind: "registry" } },
    });
    const result = await createLicensesCheck().run(
      context(
        graphOf(
          [root, dep],
          [
            {
              parentId: root.id,
              childId: dep.id,
              alias: "ms",
              field: "dependencies",
              optional: false,
            },
          ],
        ),
        ["MIT"],
        {
          getPackageMetadata: () =>
            Promise.resolve({ name: "ms", version: "2.1.3", license: "MIT" }),
        },
      ),
    );
    expect(
      result.findings.filter((finding) => finding.level === "deny"),
    ).toEqual([]);
  });

  it("applies a clarification bound to integrity", async () => {
    const root = instance({
      id: "workspace:.",
      isWorkspace: true,
      artifact: {
        name: "root",
        version: "1.0.0",
        source: { kind: "workspace" },
      },
      license: "MIT",
    });
    const dep = instance({
      id: "odd@1.0.0",
      artifact: {
        name: "odd",
        version: "1.0.0",
        source: { kind: "registry", integrity: "sha512-abc" },
      },
    });
    const ctx = context(
      graphOf(
        [root, dep],
        [
          {
            parentId: root.id,
            childId: dep.id,
            alias: "odd",
            field: "dependencies",
            optional: false,
          },
        ],
      ),
      ["MIT"],
      {
        getPackageMetadata: () =>
          Promise.resolve({ name: "odd", version: "1.0.0" }),
      },
    );
    ctx.config.licenses.clarify = [
      {
        package: { name: "odd", range: "1.0.0", raw: "odd@1.0.0" },
        expression: "MIT",
        integrity: "sha512-abc",
      },
    ];
    const result = await createLicensesCheck().run(ctx);
    expect(
      result.findings.filter((finding) => finding.code === "unlicensed"),
    ).toEqual([]);
  });

  it("rejects licenses outside the allow list", async () => {
    const root = instance({
      id: "workspace:.",
      isWorkspace: true,
      artifact: {
        name: "root",
        version: "1.0.0",
        source: { kind: "workspace" },
      },
      license: "MIT",
    });
    const dep = instance({
      id: "zlibby@1.0.0",
      artifact: {
        name: "zlibby",
        version: "1.0.0",
        source: { kind: "registry" },
      },
      license: "Zlib",
    });
    const result = await createLicensesCheck().run(
      context(
        graphOf(
          [root, dep],
          [
            {
              parentId: root.id,
              childId: dep.id,
              alias: "zlibby",
              field: "dependencies",
              optional: false,
            },
          ],
        ),
        ["MIT"],
        {
          getPackageMetadata: () =>
            Promise.resolve({
              name: "zlibby",
              version: "1.0.0",
              license: "Zlib",
            }),
        },
      ),
    );
    const finding = result.findings.find((entry) => entry.code === "rejected");
    expect(finding?.labels?.expression).toBe("Zlib");
    expect(finding?.message).toBe("failed to satisfy license requirements");
  });
});
