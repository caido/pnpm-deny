import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { depPathToFilename } from "@pnpm/deps.path";
import { describe, expect, it } from "vitest";

import { readInstalledManifest } from "./installed-manifest.js";
import type { ResolvedInstance } from "./types.js";

describe("readInstalledManifest", () => {
  it("reads package.json from the pnpm virtual store", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "pnpm-deny-installed-"));
    const depPath =
      "@lezer/javascript@https://codeload.github.com/caido/javascript/tar.gz/abc";
    const instance: ResolvedInstance = {
      id: depPath,
      artifact: {
        name: "@lezer/javascript",
        version: "1.4.16",
        source: {
          kind: "git",
          locator: "https://codeload.github.com/caido/javascript/tar.gz/abc",
          integrity: "sha512-abc",
        },
      },
      depPath,
      isWorkspace: false,
      isPrivate: false,
      optional: false,
    };

    const manifestDir = join(
      workspaceDir,
      "node_modules",
      ".pnpm",
      depPathToFilename(depPath, 120),
      "node_modules",
      "@lezer",
      "javascript",
    );
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "package.json"),
      JSON.stringify({
        name: "@lezer/javascript",
        version: "1.4.16",
        license: "MIT",
      }),
    );

    expect(readInstalledManifest(workspaceDir, instance)).toMatchObject({
      name: "@lezer/javascript",
      license: "MIT",
    });
  });
});
