import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import {
  createStudioCommunityPublishManifest,
  listStudioCommunityShareCandidates,
  projectCreatorMarketplaceRecordToAssets,
  projectCreatorMarketplaceRecordToStudioPack,
} from "./studio-community-marketplace";
import { validateStudioCreatorPack } from "./studio-creator-pack-runtime";

import type {
  CreatorMarketplaceJsonValue,
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

function record(
  kind: CreatorMarketplaceResourceKind,
  definition: Record<string, CreatorMarketplaceJsonValue>,
  options: {
    mode?: "portable-json" | "procedural-recipe";
    entryName?: string;
  } = {},
): CreatorMarketplaceResourceRecord {
  const mode = options.mode
    ?? (kind === "asset" || kind === "3d-preset"
      ? "procedural-recipe"
      : "portable-json");
  const runtime = {
    asset: "studio-procedural-asset-v1",
    brush: "studio-brush-v1",
    filter: "studio-filter-v1",
    palette: "studio-palette-v1",
    template: "studio-template-v1",
    "3d-preset": "studio-bg3d-preset-v1",
  } as const;
  const mediaType = {
    asset: "application/vnd.toonspectrum.asset+json",
    brush: "application/vnd.toonspectrum.brush+json",
    filter: "application/vnd.toonspectrum.filter+json",
    palette: "application/vnd.toonspectrum.palette+json",
    template: "application/vnd.toonspectrum.template+json",
    "3d-preset": "application/vnd.toonspectrum.3d-preset+json",
  } as const;
  return {
    schemaVersion: 1,
    id: "123e4567-e89b-42d3-a456-426614174000",
    packageId: `community/${kind}/fixture`,
    name: `${kind} 공유 팩`,
    description: "테스트 공유 팩",
    kind,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    tags: [kind],
    license: "cc0-1.0",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: `${kind}/fixture`,
      kind,
      name: options.entryName ?? `${kind} 항목`,
      delivery: {
        mode,
        mediaType: mediaType[kind],
        payload: {
          schemaVersion: 1,
          resourceKind: kind,
          runtime: runtime[kind],
          definition,
        },
        byteSize: 120,
        sha256: "a".repeat(64),
      },
    }],
    manifestHash: "b".repeat(64),
    manifestByteSize: 500,
    publisher: { id: "artist-1", name: "테스트 작가", avatar: null },
    createdAt: "2026-07-26T01:00:00.000Z",
    updatedAt: "2026-07-26T01:00:00.000Z",
    isOwner: false,
    access: "free",
  };
}

describe("studio community marketplace projection", () => {
  it("portable brush/filter/palette record를 실제 로컬 설치 팩으로 투영한다", () => {
    const brushRecord = record("brush", {
      snapshot: DEFAULT_STUDIO_BRUSH_SNAPSHOT as unknown as CreatorMarketplaceJsonValue,
    });
    const projection = projectCreatorMarketplaceRecordToStudioPack(brushRecord);

    expect(projection.status).toBe("installable");
    if (projection.status !== "installable") return;
    expect(projection.pack.metadata).toMatchObject({
      id: `community:${brushRecord.id}`,
      name: "brush 공유 팩",
      kind: "brush",
      access: "free",
      packageFingerprint: brushRecord.manifestHash,
    });
    expect(projection.pack.entries[0]).toMatchObject({
      kind: "brush",
      delivery: {
        mode: "portable-json",
        definition: { snapshot: DEFAULT_STUDIO_BRUSH_SNAPSHOT },
      },
    });
    expect(validateStudioCreatorPack(projection.pack)).toMatchObject({
      valid: true,
    });
  });

  it("로컬에 실제 존재하는 template recipe만 내장 참조로 승격한다", () => {
    const supported = projectCreatorMarketplaceRecordToStudioPack(
      record("template", { templateId: "confession" }),
    );
    const unsupported = projectCreatorMarketplaceRecordToStudioPack(
      record("template", { templateId: "missing-template" }),
    );

    expect(supported.status).toBe("installable");
    if (supported.status === "installable") {
      expect(supported.pack.entries[0]).toMatchObject({
        delivery: {
          mode: "builtin-ref",
          runtimeRef: "studio-scene-template:confession",
        },
      });
    }
    expect(unsupported).toMatchObject({
      status: "unsupported",
      pack: null,
    });
  });

  it("2D recipe는 검증된 원본 procedural asset allowlist와 일치할 때만 삽입 대상으로 투영한다", () => {
    const supported = projectCreatorMarketplaceRecordToAssets(
      record("asset", { recipeId: "original-sunlit-classroom" }),
    );
    const unsupported = projectCreatorMarketplaceRecordToAssets(
      record("asset", { recipeId: "unknown-commercial-copy" }),
    );

    expect(supported).toMatchObject({
      unsupportedCount: 0,
      reason: null,
    });
    expect(supported.assets.map((asset) => asset.id)).toEqual([
      "original-sunlit-classroom",
    ]);
    expect(unsupported).toMatchObject({
      assets: [],
      unsupportedCount: 1,
    });
  });

  it("저장된 브러시·필터·팔레트를 게시 가능한 최소 portable definition으로 정리한다", () => {
    const candidates = listStudioCommunityShareCandidates({
      brushes: [{
        ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
        id: "brush-1",
        name: "내 펜",
        createdAt: 1,
        updatedAt: 2,
        pinned: false,
        lastUsedAt: null,
      }],
      filters: [{
        id: "filter-1",
        packageId: "pack-1",
        entryId: "entry-1",
        name: "내 비네트",
        engine: "vignette",
        values: { darkness: 35, size: 45, roundness: 100, feather: 60 },
        installedAt: 1,
        updatedAt: 2,
      }],
      palettes: [{
        id: "palette-1",
        name: "내 색",
        createdAt: 1,
        updatedAt: 2,
        colors: ["#AABBCC", "#aabbcc", "#112233"],
      }],
    });

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      "brush",
      "filter",
      "palette",
    ]);
    expect(candidates[0]?.definition).toHaveProperty("snapshot.brushId");
    expect(candidates[0]?.definition).not.toHaveProperty("snapshot.id");
    expect(candidates[2]?.definition).toEqual({
      colors: ["#aabbcc", "#112233"],
    });
  });

  it("직접 제작 확인을 전제로 결정적인 무료 공유 manifest를 만든다", async () => {
    const candidate = listStudioCommunityShareCandidates({
      brushes: [],
      filters: [],
      palettes: [{
        id: "palette-1",
        name: "야간 팔레트",
        createdAt: 1,
        updatedAt: 2,
        colors: ["#111827", "#f8fafc"],
      }],
    })[0]!;

    const left = await createStudioCommunityPublishManifest(candidate, {
      description: "직접 만든 야간 색 조합",
      license: "cc0-1.0",
      attributionText: "",
      containsAi: false,
      creatorOwnsRights: true,
      recognizableMarketplaceDerivative: false,
    });
    const right = await createStudioCommunityPublishManifest(candidate, {
      description: "직접 만든 야간 색 조합",
      license: "cc0-1.0",
      attributionText: "",
      containsAi: false,
      creatorOwnsRights: true,
      recognizableMarketplaceDerivative: false,
    });

    expect(left).toEqual(right);
    expect(left).toMatchObject({
      packageId: expect.stringMatching(/^community\/palette\/[a-z0-9]+$/u),
      kind: "palette",
      rightsConfirmed: true,
      provenance: { origin: "original", authoredByPublisher: true },
      license: "cc0-1.0",
      containsAi: false,
      entries: [{
        kind: "palette",
        delivery: {
          mode: "portable-json",
          payload: {
            definition: { colors: ["#111827", "#f8fafc"] },
          },
        },
      }],
    });
  });

  it("권리 미확인 또는 타 마켓 식별 가능한 변형은 manifest 생성 경계에서 거부한다", async () => {
    const candidate = listStudioCommunityShareCandidates({
      brushes: [],
      filters: [],
      palettes: [{
        id: "palette-1",
        name: "팔레트",
        createdAt: 1,
        updatedAt: 2,
        colors: ["#111827"],
      }],
    })[0]!;

    await expect(createStudioCommunityPublishManifest(candidate, {
      license: "toonspectrum-standard",
      containsAi: false,
      creatorOwnsRights: false,
      recognizableMarketplaceDerivative: false,
    })).rejects.toThrow("권리");
    await expect(createStudioCommunityPublishManifest(candidate, {
      license: "toonspectrum-standard",
      containsAi: false,
      creatorOwnsRights: true,
      recognizableMarketplaceDerivative: true,
    })).rejects.toThrow("다른 마켓");
  });
});
