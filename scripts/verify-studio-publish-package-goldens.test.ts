import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_PUBLISH_GOLDEN_DIRECTORY,
  STUDIO_PUBLISH_GOLDEN_GENERATED_AT,
  createStudioPublishPackageGolden,
  verifyStudioPublishPackageGoldens,
} from "./verify-studio-publish-package-goldens.mts";

describe("Studio publish package golden certification", () => {
  it.each(["generic", "webtoon", "tapas"] as const)(
    "builds a finalized, privacy-safe %s package receipt",
    (destination) => {
      const receipt = createStudioPublishPackageGolden(destination);
      expect(receipt).toMatchObject({
        schemaVersion: 1,
        destination,
        generatedAt: STUDIO_PUBLISH_GOLDEN_GENERATED_AT,
        canExport: true,
        errorCodes: [],
        privacyMarkersAbsent: true,
        manifest: {
          destination,
          generatedAt: STUDIO_PUBLISH_GOLDEN_GENERATED_AT,
          validation: { canExport: true, errorCount: 0 },
        },
      });
      expect(receipt.manifest.artifacts.at(-1)).toMatchObject({
        role: "manifest",
        fileName: "manifest.json",
        state: "planned",
      });
      expect(
        receipt.manifest.artifacts
          .filter((artifact) => artifact.role !== "manifest")
          .every((artifact) =>
            artifact.state === "ready"
            && typeof artifact.sha256 === "string"
            && artifact.sha256.length === 64
            && typeof artifact.byteSize === "number"),
      ).toBe(true);
      expect(JSON.stringify(receipt.manifest)).not.toMatch(
        /canvas-internal-|render-internal-|thumbnail-internal-|\/Users\/creator|do-not-publish/u,
      );
    },
  );

  it("keeps the committed three-destination corpus byte-for-byte current", async () => {
    await expect(verifyStudioPublishPackageGoldens()).resolves.toMatchObject({
      destinations: 3,
      changed: [],
    });
    const generic = JSON.parse(await readFile(
      resolve(STUDIO_PUBLISH_GOLDEN_DIRECTORY, "generic.json"),
      "utf8",
    )) as { manifestSha256?: unknown };
    expect(generic.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
