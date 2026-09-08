import { describe, expect, it } from "vitest";

import {
  decideStudioAssetAiReferenceUse,
  decideStudioAssetPublishUse,
  replaceStudioAssetRevision,
  sameStudioAssetRevision,
  validateStudioAssetLicenseRevisionV2,
  validateStudioAssetReferenceV2,
  type StudioAssetLicenseRevisionV2,
  type StudioAssetReferenceV2,
} from "./studio-asset-reference-v2";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const NOW = "2026-09-07T00:00:00.000Z";

function asset(patch: Partial<StudioAssetReferenceV2> = {}): StudioAssetReferenceV2 {
  return {
    version: 2,
    assetId: "asset-background-1",
    revisionId: "asset-background-1:r1",
    contentHash: HASH_A,
    mimeType: "image/png",
    byteLength: 1024,
    width: 800,
    height: 1280,
    durationMs: null,
    origin: "marketplace",
    createdAt: NOW,
    licenseRevisionId: "license-background-1:r1",
    ...patch,
  };
}

function license(
  patch: Partial<StudioAssetLicenseRevisionV2> = {},
): StudioAssetLicenseRevisionV2 {
  return {
    id: "license-background-1:r1",
    assetId: "asset-background-1",
    sourceName: "공식 배경 마켓",
    sourceUrl: "https://example.invalid/assets/background-1",
    creator: "배경 작가",
    commercialUse: "allowed",
    modification: "allowed",
    aiInput: "allowed",
    attributionRequired: true,
    attributionText: "Background by 배경 작가",
    redistribution: "prohibited",
    effectiveFrom: NOW,
    capturedAt: NOW,
    evidenceAssetRevisionId: null,
    ...patch,
  };
}

describe("Studio asset reference v2", () => {
  it("accepts a content-addressed immutable asset revision", () => {
    expect(validateStudioAssetReferenceV2(asset())).toEqual([]);
    expect(validateStudioAssetLicenseRevisionV2(asset(), license())).toEqual([]);
  });

  it("rejects malformed hashes, byte lengths, and dimensions", () => {
    const invalid = asset({
      contentHash: "not-a-digest",
      byteLength: 0,
      width: -1,
    });

    expect(validateStudioAssetReferenceV2(invalid).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid-content-hash",
        "invalid-byte-length",
        "invalid-dimensions",
      ]),
    );
  });

  it("fails closed when the pinned license is missing or belongs to another asset", () => {
    expect(validateStudioAssetLicenseRevisionV2(asset(), null).map((issue) => issue.code)).toContain(
      "license-revision-missing",
    );
    expect(validateStudioAssetLicenseRevisionV2(
      asset(),
      license({ assetId: "asset-other" }),
    ).map((issue) => issue.code)).toContain("license-asset-mismatch");
  });

  it("blocks AI reference use unless the pinned license explicitly allows it", () => {
    expect(decideStudioAssetAiReferenceUse(asset(), license()).allowed).toBe(true);
    const prohibited = decideStudioAssetAiReferenceUse(
      asset(),
      license({ aiInput: "prohibited" }),
    );
    expect(prohibited.allowed).toBe(false);
    expect(prohibited.issues.map((issue) => issue.code)).toContain("ai-input-prohibited");

    const unknown = decideStudioAssetAiReferenceUse(
      asset(),
      license({ aiInput: "unknown" }),
    );
    expect(unknown.allowed).toBe(false);
    expect(unknown.issues.map((issue) => issue.code)).toContain("ai-input-unknown");
  });

  it("requires commercial permission, modification permission, and attribution", () => {
    const decision = decideStudioAssetPublishUse(
      asset(),
      license({ commercialUse: "prohibited", modification: "prohibited" }),
      {
        commercial: true,
        modified: true,
        attributionIncluded: false,
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "commercial-use-prohibited",
        "modification-prohibited",
        "attribution-missing",
      ]),
    );
  });

  it.each(["unknown", "unrecognized", null, undefined])(
    "blocks modified publication without an explicit modification grant: %s",
    (modification) => {
      const unestablished = {
        ...license(),
        modification,
      } as unknown as StudioAssetLicenseRevisionV2;
      for (const commercial of [false, true]) {
        const decision = decideStudioAssetPublishUse(asset(), unestablished, {
          commercial,
          modified: true,
          attributionIncluded: true,
        });

        expect(decision.allowed).toBe(false);
        expect(decision.issues).toContainEqual(expect.objectContaining({
          code: "modification-unknown",
          blocking: true,
        }));
      }
    },
  );

  it.each([null, "license-background-1:r1"])(
    "blocks modified publication when its license is unavailable: %s",
    (licenseRevisionId) => {
      const decision = decideStudioAssetPublishUse(asset({ licenseRevisionId }), null, {
        commercial: false,
        modified: true,
        attributionIncluded: true,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.issues).toContainEqual(expect.objectContaining({
        code: "modification-unknown",
        blocking: true,
      }));
    },
  );

  it("does not require modification permission for unmodified publication", () => {
    expect(decideStudioAssetPublishUse(asset(), license({ modification: "unknown" }), {
      commercial: true,
      modified: false,
      attributionIncluded: true,
    }).allowed).toBe(true);
  });

  it("permits a pinned commercial asset only when required attribution is included", () => {
    expect(decideStudioAssetPublishUse(asset(), license(), {
      commercial: true,
      modified: true,
      attributionIncluded: true,
    }).allowed).toBe(true);
  });

  it("replaces only revisions of the same logical asset", () => {
    const current = asset();
    const next = asset({
      revisionId: "asset-background-1:r2",
      contentHash: HASH_B,
      createdAt: "2026-09-08T00:00:00.000Z",
    });

    expect(sameStudioAssetRevision(current, current)).toBe(true);
    expect(sameStudioAssetRevision(current, next)).toBe(false);
    expect(replaceStudioAssetRevision(current, next)).toBe(next);
    expect(() => replaceStudioAssetRevision(current, asset({
      assetId: "asset-other",
      revisionId: "asset-other:r1",
    }))).toThrow(/logical asset ID/u);
  });

  it("allows explicitly trusted built-in assets without manufacturing a license record", () => {
    const builtIn = asset({
      origin: "built-in",
      licenseRevisionId: null,
    });

    expect(decideStudioAssetAiReferenceUse(builtIn, null).allowed).toBe(true);
    expect(decideStudioAssetPublishUse(builtIn, null, {
      commercial: true,
      modified: true,
      attributionIncluded: false,
    }).allowed).toBe(true);
  });
});
