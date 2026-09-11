import { describe, expect, it } from "vitest";

import {
  evaluateStudioAssetUsage,
  isStudioAssetType,
  validateStudioAssetPassport,
  type StudioAssetPassport,
  type StudioAssetUsageContext,
  type StudioBrushQuality,
} from "./studio-asset-passport";

const BASE_BRUSH_QUALITY: StudioBrushQuality = Object.freeze<StudioBrushQuality>({
  kind: "brush",
  engineIds: ["raster-basic"],
  deterministic: true,
  gpuCost: "low",
  pressure: true,
  tilt: true,
});

const BASE_PASSPORT: StudioAssetPassport = Object.freeze<StudioAssetPassport>({
  schemaVersion: 1,
  assetId: "brush-ink-01",
  versionId: "v3",
  type: "brush",
  title: "웹툰 잉크 펜",
  source: {
    providerId: "toonstudio",
    providerName: "ToonStudio",
    authorName: "Studio Team",
    receiptId: "receipt-1",
    importedAt: "2026-09-01T00:00:00.000Z",
  },
  quality: {
    status: "verified",
    grade: "A",
    fileSizeBytes: 24_000,
    checksum: "sha256:1234567890abcdef",
    previewAvailable: true,
    compatibility: {
      minStudioVersion: "1.0.0",
      requiredCapabilities: ["brush.basic"],
      supportedPlatforms: ["web", "desktop", "mobile"],
      supportedFormats: ["toon-brush"],
    },
    details: BASE_BRUSH_QUALITY,
  },
  rights: {
    verified: true,
    licenseId: "commercial-standard",
    licenseName: "Commercial Standard",
    commercialUse: "allowed",
    modification: "allowed",
    clientWork: "allowed",
    publishing: "allowed",
    video: "allowed",
    merchandise: "conditional",
    appEmbedding: "prohibited",
    ebookEmbedding: "allowed",
    sourceRedistribution: "prohibited",
    aiGenerationReference: "conditional",
    aiTraining: "prohibited",
    attributionRequired: false,
    seatLimit: 5,
    expiresAt: "2030-12-31T23:59:59.000Z",
  },
  ai: {
    classification: "none",
    providerIds: [],
    modelNames: [],
    sourceReferencesCleared: true,
    disclosureRequired: false,
    editedByHuman: true,
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
});

const BASE_CONTEXT: StudioAssetUsageContext = Object.freeze<StudioAssetUsageContext>({
  destination: "webtoon",
  commercial: true,
  teamSeats: 3,
  modifiesAsset: true,
  deliversSourceFiles: false,
  usesAsAiReference: false,
  usesForAiTraining: false,
  attributionIncluded: false,
  now: "2026-09-11T00:00:00.000Z",
});

function passportWith(
  patch: Partial<StudioAssetPassport>,
): StudioAssetPassport {
  return {
    ...BASE_PASSPORT,
    ...patch,
  };
}

describe("Studio asset quality and rights passport", () => {
  it("accepts a verified asset for an allowed production purpose", () => {
    expect(validateStudioAssetPassport(BASE_PASSPORT)).toEqual([]);
    expect(evaluateStudioAssetUsage(BASE_PASSPORT, BASE_CONTEXT)).toMatchObject({
      status: "allowed",
      summaryKo: "현재 용도로 사용할 수 있습니다.",
      findings: [],
    });
  });

  it("turns conditional permissions into user-facing warnings", () => {
    const decision = evaluateStudioAssetUsage(BASE_PASSPORT, {
      ...BASE_CONTEXT,
      destination: "merchandise",
    });
    expect(decision.status).toBe("warning");
    expect(decision.findings).toContainEqual(
      expect.objectContaining({ code: "destination-merchandise", severity: "warning" }),
    );
  });

  it("blocks prohibited source delivery, app embedding and AI training", () => {
    const sourceDelivery = evaluateStudioAssetUsage(BASE_PASSPORT, {
      ...BASE_CONTEXT,
      deliversSourceFiles: true,
    });
    expect(sourceDelivery.status).toBe("blocked");
    expect(sourceDelivery.findings).toContainEqual(
      expect.objectContaining({ code: "source-redistribution", severity: "error" }),
    );

    const appEmbedding = evaluateStudioAssetUsage(BASE_PASSPORT, {
      ...BASE_CONTEXT,
      destination: "app",
    });
    expect(appEmbedding.status).toBe("blocked");

    const aiTraining = evaluateStudioAssetUsage(BASE_PASSPORT, {
      ...BASE_CONTEXT,
      usesForAiTraining: true,
    });
    expect(aiTraining.status).toBe("blocked");
    expect(aiTraining.findings).toContainEqual(
      expect.objectContaining({ code: "ai-training", severity: "error" }),
    );
  });

  it("blocks expired or under-licensed team use", () => {
    const expired = passportWith({
      rights: { ...BASE_PASSPORT.rights, expiresAt: "2025-01-01T00:00:00.000Z" },
    });
    expect(evaluateStudioAssetUsage(expired, BASE_CONTEXT)).toMatchObject({
      status: "blocked",
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "rights-expired" }),
      ]),
    });

    expect(evaluateStudioAssetUsage(BASE_PASSPORT, {
      ...BASE_CONTEXT,
      teamSeats: 6,
    })).toMatchObject({
      status: "blocked",
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "seat-limit-exceeded" }),
      ]),
    });
  });

  it("requires attribution and cleared AI references before external publishing", () => {
    const generated = passportWith({
      rights: {
        ...BASE_PASSPORT.rights,
        attributionRequired: true,
        attributionText: "Created with Example AI",
      },
      ai: {
        classification: "generated",
        providerIds: ["example-ai"],
        modelNames: ["example-v2"],
        sourceReferencesCleared: false,
        disclosureRequired: true,
        editedByHuman: true,
      },
    });
    const decision = evaluateStudioAssetUsage(generated, BASE_CONTEXT);
    expect(decision.status).toBe("blocked");
    expect(decision.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "attribution-missing", severity: "error" }),
      expect.objectContaining({ code: "ai-source-rights", severity: "error" }),
      expect.objectContaining({ code: "ai-disclosure", severity: "warning" }),
    ]));
  });

  it("validates type-specific quality information instead of trusting a thumbnail", () => {
    const mismatched = passportWith({
      type: "3d",
      quality: {
        ...BASE_PASSPORT.quality,
        details: BASE_BRUSH_QUALITY,
      },
    });
    expect(validateStudioAssetPassport(mismatched)).toContainEqual(
      expect.objectContaining({ code: "quality-kind-mismatch", severity: "error" }),
    );

    const badBrush = passportWith({
      quality: {
        ...BASE_PASSPORT.quality,
        details: {
          ...BASE_BRUSH_QUALITY,
          engineIds: [],
        },
      },
    });
    expect(validateStudioAssetPassport(badBrush)).toContainEqual(
      expect.objectContaining({ code: "brush-engine", severity: "error" }),
    );
  });

  it("keeps accepted asset types explicit", () => {
    expect(isStudioAssetType("font")).toBe(true);
    expect(isStudioAssetType("ai-reference")).toBe(true);
    expect(isStudioAssetType("arbitrary-file")).toBe(false);
  });
});
