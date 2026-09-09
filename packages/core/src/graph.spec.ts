import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadDependencyGraph } from "./graph.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/licenses-workspace",
);

describe("loadDependencyGraph", () => {
  it("reads the wanted lockfile through pnpm libraries", async () => {
    const graph = await loadDependencyGraph({ workspaceDir: fixture });
    const names = [...graph.packages.values()].map((pkg) => pkg.artifact.name);
    expect(names).toContain("licenses-fixture");
    expect(names).toContain("ms");
    const ms = [...graph.packages.values()].find(
      (pkg) => pkg.artifact.name === "ms",
    );
    expect(ms?.artifact.version).toBe("2.1.3");
    expect(ms?.artifact.source.kind).toBe("registry");
  });
});
