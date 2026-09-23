import { describe, expect, it } from "vitest";

import { parsePnpmLicenseInventory } from "./generate-third-party-notices.mjs";

function packageRecord(name, version = "4.0.514") {
  return {
    name,
    versions: [version],
    paths: [`/virtual/node_modules/${name}`],
    license: "Unknown",
  };
}

describe("Remotion production license boundary", () => {
  it("maps only the reviewed 4.0.514 packages onto the custom license", () => {
    const inventory = parsePnpmLicenseInventory(JSON.stringify({
      Unknown: [
        packageRecord("@remotion/player"),
        packageRecord("remotion"),
      ],
    }));

    expect(inventory.map(({ name, license, versions }) => ({
      name,
      license,
      versions,
    }))).toEqual([
      {
        name: "@remotion/player",
        license: "Remotion License",
        versions: ["4.0.514"],
      },
      {
        name: "remotion",
        license: "Remotion License",
        versions: ["4.0.514"],
      },
    ]);
  });

  it("rejects an unreviewed Remotion version", () => {
    expect(() => parsePnpmLicenseInventory(JSON.stringify({
      Unknown: [packageRecord("@remotion/player", "4.0.515")],
    }))).toThrow(/Reviewed license metadata changed/u);
  });

  it("does not turn unrelated unknown licenses into an approved expression", () => {
    expect(() => parsePnpmLicenseInventory(JSON.stringify({
      Unknown: [packageRecord("unreviewed-package", "1.0.0")],
    }))).toThrow(
      /Unreviewed production license expression: Unknown \(unreviewed-package@1\.0\.0\)/u,
    );
  });
});
