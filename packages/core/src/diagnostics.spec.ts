import { describe, expect, it } from "vitest";

import {
  formatCheckSummary,
  formatFindingHuman,
  formatInclusionTree,
  type GraphPackageLabel,
} from "./diagnostics.js";
import type { Finding, InclusionPath } from "./types.js";

const packages = new Map<string, GraphPackageLabel>([
  ["workspace:app", { name: "app", version: "0.1.0" }],
  ["workspace:api", { name: "api", version: "0.1.0" }],
  ["actix-http@3.12.1", { name: "actix-http", version: "3.12.1" }],
  ["actix-files@0.6.10", { name: "actix-files", version: "0.6.10" }],
  ["actix-web@4.13.0", { name: "actix-web", version: "4.13.0" }],
  ["foldhash@0.1.5", { name: "foldhash", version: "0.1.5" }],
]);

describe("formatInclusionTree", () => {
  it("merges reverse dependency paths into a tree", () => {
    const paths: InclusionPath[] = [
      {
        rootId: "workspace:app",
        hops: [
          {
            alias: "actix-files",
            packageId: "actix-files@0.6.10",
            field: "dependencies",
          },
          {
            alias: "actix-http",
            packageId: "actix-http@3.12.1",
            field: "dependencies",
          },
          {
            alias: "foldhash",
            packageId: "foldhash@0.1.5",
            field: "dependencies",
          },
        ],
      },
      {
        rootId: "workspace:api",
        hops: [
          {
            alias: "actix-web",
            packageId: "actix-web@4.13.0",
            field: "dependencies",
          },
          {
            alias: "actix-http",
            packageId: "actix-http@3.12.1",
            field: "dependencies",
          },
          {
            alias: "foldhash",
            packageId: "foldhash@0.1.5",
            field: "dependencies",
          },
        ],
      },
    ];

    expect(formatInclusionTree("foldhash@0.1.5", paths, packages)).toBe(
      [
        "foldhash@0.1.5",
        "└── actix-http@3.12.1",
        "    ├── actix-files@0.6.10",
        "    │   └── app@0.1.0",
        "    └── actix-web@4.13.0",
        "        └── api@0.1.0",
      ].join("\n"),
    );
  });
});

describe("formatFindingHuman", () => {
  it("renders cargo-deny style rejected license diagnostics", () => {
    const finding: Finding = {
      check: "licenses",
      code: "rejected",
      level: "deny",
      message: "failed to satisfy license requirements",
      packageId: "foldhash@0.1.5",
      packageName: "foldhash",
      packageVersion: "0.1.5",
      labels: {
        expression: "Zlib",
        reason: "license is not explicitly allowed",
        licenses: "Zlib",
      },
      inclusionPaths: [
        {
          rootId: "workspace:app",
          hops: [
            {
              alias: "actix-http",
              packageId: "actix-http@3.12.1",
              field: "dependencies",
            },
            {
              alias: "foldhash",
              packageId: "foldhash@0.1.5",
              field: "dependencies",
            },
          ],
        },
      ],
    };

    expect(formatFindingHuman(finding, packages, { color: false })).toBe(
      [
        "error[rejected]: failed to satisfy license requirements",
        "   ┌─ foldhash@0.1.5",
        "   │",
        '   │  license = "Zlib"',
        "   │             ━━━━",
        "   │             │",
        "   │             rejected: license is not explicitly allowed",
        "   │",
        "   ├ Zlib",
        "   ├ foldhash@0.1.5",
        "     └── actix-http@3.12.1",
        "         └── app@0.1.0",
      ].join("\n"),
    );
  });

  it("colors severity markers when enabled", () => {
    const finding: Finding = {
      check: "licenses",
      code: "rejected",
      level: "deny",
      message: "failed to satisfy license requirements",
      packageId: "foldhash@0.1.5",
      packageName: "foldhash",
      packageVersion: "0.1.5",
      labels: {
        expression: "Zlib",
        reason: "license is not explicitly allowed",
      },
    };
    const rendered = formatFindingHuman(finding, packages, { color: true });
    expect(rendered).toContain("\u001B[91m");
    expect(rendered).toContain("\u001B[36m");
    expect(rendered).toContain("\u001B[0m");
  });

  it("hides the inclusion graph when requested", () => {
    const finding: Finding = {
      check: "licenses",
      code: "rejected",
      level: "deny",
      message: "failed to satisfy license requirements",
      packageId: "foldhash@0.1.5",
      packageName: "foldhash",
      packageVersion: "0.1.5",
      labels: {
        expression: "Zlib",
        reason: "license is not explicitly allowed",
        licenses: "Zlib",
      },
      inclusionPaths: [
        {
          rootId: "workspace:app",
          hops: [
            {
              alias: "actix-http",
              packageId: "actix-http@3.12.1",
              field: "dependencies",
            },
            {
              alias: "foldhash",
              packageId: "foldhash@0.1.5",
              field: "dependencies",
            },
          ],
        },
      ],
    };

    const rendered = formatFindingHuman(finding, packages, {
      color: false,
      hideInclusionGraph: true,
    });
    expect(rendered).toContain("   ├ Zlib");
    expect(rendered).not.toContain("actix-http@3.12.1");
    expect(rendered).not.toContain("└──");
  });
});

describe("formatCheckSummary", () => {
  it("renders ok and FAILED statuses", () => {
    expect(
      formatCheckSummary(
        [
          {
            check: "advisories",
            findings: [],
            stats: { check: "advisories", errors: 0, warnings: 1, notes: 0 },
          },
          {
            check: "licenses",
            findings: [],
            stats: { check: "licenses", errors: 2, warnings: 0, notes: 0 },
          },
        ],
        { color: false },
      ),
    ).toBe("advisories ok licenses FAILED");
  });
});
