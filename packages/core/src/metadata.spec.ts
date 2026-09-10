import { describe, expect, it } from "vitest";

import {
  createRegistryMetadataService,
  licenseFromPackumentVersion,
} from "./metadata.js";

describe("licenseFromPackumentVersion", () => {
  it("reads string licenses", () => {
    expect(licenseFromPackumentVersion({ license: "MIT" })).toBe("MIT");
  });

  it("reads SPDX type objects like config-chain@1.1.13", () => {
    expect(
      licenseFromPackumentVersion({
        license: {
          type: "MIT",
          url: "https://raw.githubusercontent.com/dominictarr/config-chain/master/LICENCE",
        },
      }),
    ).toBe("MIT");
  });

  it("reads legacy licenses arrays like older config-chain", () => {
    expect(
      licenseFromPackumentVersion({
        licenses: [
          {
            type: "MIT",
            url: "https://raw.githubusercontent.com/dominictarr/config-chain/master/LICENCE",
          },
        ],
      }),
    ).toBe("MIT");
  });
});

describe("createRegistryMetadataService", () => {
  it("surfaces object licenses from the packument", async () => {
    const service = createRegistryMetadataService({
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              name: "config-chain",
              versions: {
                "1.1.13": {
                  name: "config-chain",
                  version: "1.1.13",
                  license: {
                    type: "MIT",
                    url: "https://example.com/LICENCE",
                  },
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
    });

    await expect(
      service.getPackageMetadata("config-chain", "1.1.13"),
    ).resolves.toMatchObject({
      name: "config-chain",
      version: "1.1.13",
      license: "MIT",
    });
  });
});
