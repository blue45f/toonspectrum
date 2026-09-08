import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseStudioCc0Catalog,
  studioCc0AssetUrl,
  type StudioCc0OriginalDelivery,
} from "./studio-cc0-asset-delivery";
import { isStudioCc0EligibleForNewSelection } from "./studio-cc0-curation";

interface RawAsset extends Record<string, unknown> {
  id: string;
  kind: string;
  path: string;
  bytes: number;
  sha256: string;
  license: {
    id: string;
    url: string;
    sourceUrl: string;
    commercialUse: boolean;
    redistributionAllowed: boolean;
  };
  original?: StudioCc0OriginalDelivery;
}

interface RawManifest extends Record<string, unknown> {
  assets: RawAsset[];
}

interface PublicationReport {
  addedIds: string[];
  catalogCount: number;
  afterManifestSha256: string;
}

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const publicPack = path.join(root, "apps/web/public/assets/studio/cc0-20260906");
const evidencePack = path.join(root, "artifacts/studio-asset-expansion/pbr-20260908");
const publicationReportPath = path.join(evidencePack, "publication-report.json");
const originalVariantsReportPath = path.join(
  evidencePack,
  "original-variants-publication-report.json",
);
const hasPublicationEvidence =
  existsSync(publicationReportPath) && existsSync(originalVariantsReportPath);
const manifestBytes = readFileSync(path.join(publicPack, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8")) as RawManifest;
const originals = [
  {
    id: "polyhaven-cassette-player",
    bytes: 3_958_756,
    sha256: "0dfed816e40cd3f905143b89e2503b9a97d10e8c5949a3453b06c13d0e0db828",
    equivalent: true,
  },
  {
    id: "polyhaven-brass-goblets",
    bytes: 17_272_720,
    sha256: "aa3e15e1f2d1221df2e784ab584177a58a8d0c85668bd5df22f062e84b6875a8",
    equivalent: false,
  },
  {
    id: "polyhaven-korean-fire-extinguisher-01",
    bytes: 5_474_548,
    sha256: "ca8c2b3febb6a268591df230d2f8851d4d9073d3024a71a15bd531b025ad7441",
    equivalent: false,
  },
] as const;
const cassette = manifest.assets.find(({ id }) => id === originals[0].id)!;
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

function readPublicationReport() {
  return JSON.parse(
    readFileSync(publicationReportPath, "utf8"),
  ) as PublicationReport;
}

function parseOriginal(original: unknown, patch: Record<string, unknown> = {}) {
  return parseStudioCc0Catalog({
    ...manifest,
    assets: [{ ...cassette, ...patch, original }],
  })[0]!;
}

describe("CC0 optional original delivery", () => {
  it("preserves immutable original metadata without changing the optimized primary tuple", () => {
    const asset = parseOriginal(cassette.original);
    expect(asset.original).toEqual(cassette.original);
    expect(Object.isFrozen(asset.original)).toBe(true);
    expect(asset.original).not.toBe(cassette.original);
    expect(asset).toMatchObject({
      path: cassette.path,
      bytes: cassette.bytes,
      sha256: cassette.sha256,
    });
    expect(studioCc0AssetUrl(asset.original!.path)).toBe(
      `/assets/studio/cc0-20260906/${asset.original!.path}`,
    );
  });

  it("keeps older entries without an original variant unchanged", () => {
    const asset = parseOriginal(undefined);
    expect(asset).not.toHaveProperty("original");
    expect(asset.path).toBe(cassette.path);
    expect(asset.sha256).toBe(cassette.sha256);
  });

  it.each([null, "original.glb", 3, true])(
    "rejects a non-object variant: %s",
    (original) => {
      expect(() => parseOriginal(original)).toThrow(TypeError);
    },
  );

  it.each([
    {
      label: "external URL",
      patch: { path: "https://example.test/original.glb" },
    },
    {
      label: "absolute path",
      patch: { path: "/assets/polyhaven-cassette-player/original.glb" },
    },
    {
      label: "parent traversal",
      patch: {
        path: "assets/polyhaven-cassette-player/../original.glb",
      },
    },
    {
      label: "encoded traversal",
      patch: { path: "assets/polyhaven-cassette-player/%2e%2e.glb" },
    },
    {
      label: "cross-asset path",
      patch: { path: "assets/polyhaven-brass-goblets/original.glb" },
    },
    { label: "same primary path", patch: { path: cassette.path } },
    {
      label: "non-GLB file",
      patch: { path: "assets/polyhaven-cassette-player/original.png" },
    },
    { label: "empty size", patch: { bytes: 0 } },
    { label: "negative size", patch: { bytes: -1 } },
    { label: "fractional size", patch: { bytes: 1.5 } },
    {
      label: "unsafe size",
      patch: { bytes: Number.MAX_SAFE_INTEGER + 1 },
    },
    { label: "non-number size", patch: { bytes: "3958756" } },
    { label: "short hash", patch: { sha256: "a".repeat(63) } },
    { label: "non-hex hash", patch: { sha256: "z".repeat(64) } },
    { label: "empty decoded memory", patch: { estimatedDecodedImageBytes: 0 } },
    {
      label: "infinite decoded memory",
      patch: { estimatedDecodedImageBytes: Infinity },
    },
    { label: "non-CC0 license", patch: { licenseId: "CC-BY-4.0" } },
    {
      label: "different source",
      patch: { sourceUrl: "https://example.test/cassette_player" },
    },
    {
      label: "non-HTTPS source",
      patch: { sourceUrl: "http://polyhaven.com/a/cassette_player" },
    },
    {
      label: "truthy string",
      patch: { visuallyEquivalentToDefault: "true" },
    },
  ])("rejects $label", ({ patch }) => {
    expect(() => parseOriginal({ ...cassette.original, ...patch })).toThrow(
      TypeError,
    );
  });

  it("rejects variants on 2D assets or without matching parent CC0 rights", () => {
    expect(() =>
      parseOriginal(cassette.original, { kind: "surface-texture" }),
    ).toThrow(TypeError);
    expect(() =>
      parseOriginal(cassette.original, {
        license: { ...cassette.license, id: "CC-BY-4.0" },
      }),
    ).toThrow(TypeError);
  });

  it("does not turn original provenance into a visual quality approval", () => {
    const asset = parseOriginal(cassette.original, {
      visualReviewed: false,
      visualReviewLevel: "unreviewed",
      curationStatus: "unreviewed",
    });
    expect(asset.original).toBeDefined();
    expect(asset.visualReviewed).toBe(false);
    expect(isStudioCc0EligibleForNewSelection(asset)).toBe(false);
  });
});

describe("published CC0 original bytes and provenance", () => {
  it.each(originals)(
    "$id is an exact published CC0 original with its recorded source hash",
    (expected) => {
      const asset = manifest.assets.find(({ id }) => id === expected.id)!;
      const original = asset.original!;
      const publicBytes = readFileSync(path.join(publicPack, original.path));
      expect(publicBytes.byteLength).toBe(expected.bytes);
      expect(digest(publicBytes)).toBe(expected.sha256);
      expect(original).toMatchObject({
        bytes: expected.bytes,
        sha256: expected.sha256,
        licenseId: "CC0-1.0",
        sourceUrl: asset.license.sourceUrl,
        estimatedDecodedImageBytes: 144 * 1024 * 1024,
        visuallyEquivalentToDefault: expected.equivalent,
      });
      expect(asset.license).toMatchObject({
        id: "CC0-1.0",
        url: "https://creativecommons.org/publicdomain/zero/1.0/",
        commercialUse: true,
        redistributionAllowed: true,
      });
      expect(original.path).not.toBe(asset.path);
    },
  );
});

describe.skipIf(!hasPublicationEvidence)("CC0 local publication evidence", () => {
  it("preserves all 1212 primary entries and the prior publication digest after removing only three variants", () => {
    const publication = readPublicationReport();
    expect(manifest.assets).toHaveLength(1212);
    expect(manifest.assets).toHaveLength(publication.catalogCount);
    expect(manifest.assets.filter(({ original }) => original)).toHaveLength(3);
    const beforeOriginals = {
      ...manifest,
      assets: manifest.assets.map((asset) => {
        const { original: _original, ...primary } = asset;
        return primary;
      }),
    };
    expect(digest(`${JSON.stringify(beforeOriginals, null, 2)}\n`)).toBe(
      publication.afterManifestSha256,
    );
  });

  it("preserves every approved expansion primary ID, URL, size, hash and actual file", () => {
    const publication = readPublicationReport();
    expect(publication.addedIds).toHaveLength(69);
    expect(new Set(publication.addedIds).size).toBe(69);
    for (const id of publication.addedIds) {
      const asset = manifest.assets.find((entry) => entry.id === id)!;
      expect(asset, id).toBeDefined();
      const bytes = readFileSync(path.join(publicPack, asset.path));
      expect(bytes.byteLength, id).toBe(asset.bytes);
      expect(digest(bytes), id).toBe(asset.sha256);
    }
  });

  it("records the optional-variant manifest change in a separate publication report", () => {
    const publication = readPublicationReport();
    const report = JSON.parse(
      readFileSync(originalVariantsReportPath, "utf8"),
    ) as Record<string, unknown>;
    expect(report).toMatchObject({
      beforeManifestSha256: publication.afterManifestSha256,
      afterManifestSha256: digest(manifestBytes),
      catalogCount: 1212,
      addedCatalogItems: 0,
      addedOriginalVariants: 3,
      primaryManifestUnchanged: true,
      productionPublished: false,
    });
  });
});
