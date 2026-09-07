import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  authoritativeMarketCacheKey,
  authoringUpdateResourceId,
  marketAuthorityErrorMessage,
  parseAuthoritativeMarketManifest,
} from "./market-authority";

import { canonicalizeCreatorMarketplaceJson } from "@/shared/lib/creator-marketplace-resource-contract";

const VALID_MANIFEST = {
  schemaVersion: 1,
  packageId: "community/template/authority-test",
  name: "권한 경계 템플릿",
  description: "서버 게시 검증 테스트",
  releaseNotes: "첫 공개",
  kind: "template",
  resourceVersion: "1.0.0",
  minimumStudioVersion: "1.0.0",
  tags: ["테스트"],
  license: "cc0-1.0",
  attributionText: "",
  containsAi: false,
  rightsConfirmed: true,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["canvas2d"] },
  entries: [
    {
      id: "template/authority-test",
      kind: "template",
      name: "권한 경계 템플릿",
      delivery: {
        mode: "builtin-ref",
        runtimeRef: "studio-scene-template:authority-test",
        byteSize: 0,
        sha256: "0".repeat(64),
      },
    },
  ],
} as const;

const BRUSH_AUTHORING_ENVELOPE = {
  format: "toonspectrum.creator-marketplace-authoring",
  schemaVersion: 2,
  resource: {
    draftId: "draft-brush-authority-test",
    kind: "brush",
    title: "한글 잉크 브러시",
    summary: "빠른 선과 필압 선화를 위한 브러시",
    description: "Brush Studio 원본 엔진 프로그램을 보존한 테스트 저작 초안입니다.",
    tags: ["선화", "잉크", "필압"],
  },
  source: {
    mode: "brush-studio",
    name: "한글 잉크 브러시",
    studioSnapshot: {
      presetId: "brush-studio-authority-test",
      renderer: "perfect-freehand",
      settings: { size: 12, opacity: 1 },
    },
  },
  brush: {
    deterministicSeed: 1207,
    presetFamily: "inking",
    intendedUse: ["inking"],
    engineNodes: [{ id: "engine-1", engine: "solid-path", enabled: true }],
    enginePrograms: [{ id: "native-program-1", backend: "canvas2d" }],
    studioSnapshot: {
      presetId: "brush-studio-authority-test",
      renderer: "perfect-freehand",
      settings: { size: 12, opacity: 1 },
    },
  },
  technical: {
    qualityScenarios: ["brush-fast-slow", "brush-pressure", "brush-crossing"],
    containsAi: false,
  },
  compatibility: {
    canvas2d: true,
    webgl2: true,
    webgpu: false,
    minAppVersion: "1.0.0",
  },
  media: [{
    id: "media-1",
    kind: "stroke-sheet",
    name: "필압 스트로크",
    alt: "빠른 선과 느린 필압 선 비교",
  }],
  bundle: [],
  release: {
    mode: "new",
    version: "1.2.0",
    changelog: "Brush Studio handoff 공개",
    migrationNotes: "",
    breaking: false,
  },
  rights: {
    license: "toonspectrum-standard",
    commercialUse: true,
    redistribution: false,
    aiTrainingAllowed: false,
    containsThirdPartyContent: false,
    thirdPartyAttribution: "",
    originalWorkAttested: true,
    previewRightsAttested: true,
  },
  reviewNotes: "",
} as const;

describe("market authority", () => {
  it("requires a complete server-publishable manifest", () => {
    expect(parseAuthoritativeMarketManifest(" ").state).toBe("empty");
    expect(parseAuthoritativeMarketManifest("{ invalid").state).toBe("invalid");
    expect(parseAuthoritativeMarketManifest(JSON.stringify({
      ...VALID_MANIFEST,
      rightsConfirmed: false,
    })).state).toBe("invalid");

    const parsed = parseAuthoritativeMarketManifest(JSON.stringify(VALID_MANIFEST));
    expect(parsed.state).toBe("valid");
    if (parsed.state === "valid") {
      expect(parsed.manifest.packageId).toBe(VALID_MANIFEST.packageId);
      expect(parsed.manifest.resourceVersion).toBe("1.0.0");
    }
  });

  it("converts a Brush Studio authoring envelope into a strict publish manifest", () => {
    const parsed = parseAuthoritativeMarketManifest(
      JSON.stringify(BRUSH_AUTHORING_ENVELOPE),
    );

    expect(parsed.state).toBe("valid");
    if (parsed.state !== "valid") return;
    expect(parsed.manifest.schemaVersion).toBe(1);
    expect(parsed.manifest.kind).toBe("brush");
    expect(parsed.manifest.packageId).toMatch(/^community\/brush\/[0-9a-f]{32}$/u);
    expect(parsed.manifest.name).toBe("한글 잉크 브러시");
    expect(parsed.manifest.resourceVersion).toBe("1.2.0");
    expect(parsed.manifest.compatibility.engines).toEqual(["canvas2d", "webgl2"]);
    expect(parsed.message).toContain("서버 게시 준비 완료");

    const entry = parsed.manifest.entries[0];
    expect(entry?.kind).toBe("brush");
    expect(entry?.delivery.mode).toBe("portable-json");
    if (!entry || entry.delivery.mode === "builtin-ref") return;
    const expectedHash = createHash("sha256")
      .update(canonicalizeCreatorMarketplaceJson(entry.delivery.payload))
      .digest("hex");
    expect(entry.delivery.sha256).toBe(expectedHash);
    expect(entry.delivery.byteSize).toBeGreaterThan(0);
  });

  it("does not convert authoring envelopes without completed rights attestations", () => {
    const parsed = parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      rights: {
        ...BRUSH_AUTHORING_ENVELOPE.rights,
        previewRightsAttested: false,
      },
    }));

    expect(parsed.state).toBe("invalid");
    expect(parsed.message).toContain("권리");
  });

  it("does not silently publish unsupported authoring kinds", () => {
    const parsed = parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      resource: {
        ...BRUSH_AUTHORING_ENVELOPE.resource,
        kind: "3d",
      },
    }));

    expect(parsed.state).toBe("invalid");
    expect(parsed.message).toContain("자동 변환을 지원하지 않습니다");
  });

  it("isolates authoritative cache entries from the legacy mixed cache generation", () => {
    const key = authoritativeMarketCacheKey(JSON.stringify({ limit: 12, sort: "newest" }));
    expect(key).toBe('authority:v2:{"limit":12,"sort":"newest"}');
  });

  it.each(["personal", "custom", "unknown"])("rejects unsupported authoring license %s without granting broader rights", (license) => {
    const parsed = parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      rights: { ...BRUSH_AUTHORING_ENVELOPE.rights, license },
    }));
    expect(parsed.state).toBe("invalid");
    expect(parsed.message).toContain("사용권");
  });

  it.each(["free", "commercial", "toonspectrum-standard", "cc0-1.0", "cc-by-4.0"])
  ("rejects commercial permission broadening for %s", (license) => {
    expect(parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      rights: { ...BRUSH_AUTHORING_ENVELOPE.rights, license, commercialUse: false,
        redistribution: true, attributionText: "Original artist" },
    })).state).toBe("invalid");
  });

  it.each(["cc0-1.0", "cc-by-4.0", "cc-by-nc-4.0"])
  ("rejects redistribution broadening for %s", (license) => {
    expect(parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      rights: { ...BRUSH_AUTHORING_ENVELOPE.rights, license, attributionText: "Original artist" },
    })).state).toBe("invalid");
  });

  it.each(["free", "commercial", "toonspectrum-standard"])("preserves the explicit workshop standard rights for %s", (license) => {
    expect(parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      rights: { ...BRUSH_AUTHORING_ENVELOPE.rights, license },
    }))).toMatchObject({ state: "valid", manifest: { license: "toonspectrum-standard" } });
  });

  it("preserves explicit non-commercial rights and required attribution", () => {
    const rights = { ...BRUSH_AUTHORING_ENVELOPE.rights, license: "cc-by-nc-4.0",
      commercialUse: false, redistribution: true, attributionText: "Original artist" };
    expect(parseAuthoritativeMarketManifest(JSON.stringify({ ...BRUSH_AUTHORING_ENVELOPE, rights })))
      .toMatchObject({ state: "valid", manifest: { license: "cc-by-nc-4.0", attributionText: "Original artist" } });
    expect(parseAuthoritativeMarketManifest(JSON.stringify({ ...BRUSH_AUTHORING_ENVELOPE,
      rights: { ...rights, attributionText: "" } })).state).toBe("invalid");
  });

  it("keeps new package identity through renaming and separates same-title drafts", () => {
    const parse = (draftId: string, title: string) => parseAuthoritativeMarketManifest(JSON.stringify({
      ...BRUSH_AUTHORING_ENVELOPE,
      resource: { ...BRUSH_AUTHORING_ENVELOPE.resource, draftId, title },
    }));
    const original = parse("draft-one", "같은 이름");
    const renamed = parse("draft-one", "바꾼 이름");
    const different = parse("draft-two", "같은 이름");
    expect(original.state).toBe("valid");
    expect(renamed.state).toBe("valid");
    expect(different.state).toBe("valid");
    expect(renamed.manifest?.packageId).toBe(original.manifest?.packageId);
    expect(different.manifest?.packageId).not.toBe(original.manifest?.packageId);
  });

  it("requires a stable draft ID instead of guessing new identity from the name", () => {
    expect(parseAuthoritativeMarketManifest(JSON.stringify({ ...BRUSH_AUTHORING_ENVELOPE,
      resource: { ...BRUSH_AUTHORING_ENVELOPE.resource, draftId: undefined } })).state).toBe("invalid");
  });

  it("resolves an update to the exact server parent package instead of its editable title", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const envelope = JSON.stringify({ ...BRUSH_AUTHORING_ENVELOPE,
      resource: { ...BRUSH_AUTHORING_ENVELOPE.resource, title: "업데이트 이름" },
      release: { ...BRUSH_AUTHORING_ENVELOPE.release, mode: "update", previousResourceId: id } });
    const parent = { id, publisherId: "owner-a", packageId: "community/brush/original-package",
      kind: "brush", availability: "listed" } as const;
    expect(authoringUpdateResourceId(envelope)).toBe(id);
    expect(parseAuthoritativeMarketManifest(envelope).state).toBe("invalid");
    expect(parseAuthoritativeMarketManifest(envelope, { ...parent, id: "20000000-0000-4000-8000-000000000002" }).state).toBe("invalid");
    expect(parseAuthoritativeMarketManifest(envelope, { ...parent, kind: "template" }).state).toBe("invalid");
    expect(parseAuthoritativeMarketManifest(envelope, parent)).toMatchObject({ state: "valid",
      manifest: { packageId: parent.packageId, name: "업데이트 이름" } });
  });

  it.each(["", "{", "not-a-release-id"])("rejects invalid update identity %s", (previousResourceId) => {
    const source = JSON.stringify({ ...BRUSH_AUTHORING_ENVELOPE,
      release: { ...BRUSH_AUTHORING_ENVELOPE.release, mode: "update", previousResourceId } });
    expect(authoringUpdateResourceId(source)).toBeNull();
    expect(parseAuthoritativeMarketManifest(source).state).toBe("invalid");
  });

  it("keeps actionable server errors and falls back for opaque failures", () => {
    expect(marketAuthorityErrorMessage(new Error("게시 거절"), "fallback")).toBe("게시 거절");
    expect(marketAuthorityErrorMessage(null, "fallback")).toBe("fallback");
  });
});
