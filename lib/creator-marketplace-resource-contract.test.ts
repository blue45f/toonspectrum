import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND,
  CREATOR_MARKETPLACE_RESOURCE_KINDS,
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplacePortablePayloadSchema,
  CreatorMarketplaceResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "./creator-marketplace-resource-contract";

import type {
  CreatorMarketplaceJsonValue,
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceManifest,
} from "./creator-marketplace-resource-contract";

const MEDIA_TYPE_BY_KIND = {
  asset: "application/vnd.toonspectrum.asset+json",
  brush: "application/vnd.toonspectrum.brush+json",
  filter: "application/vnd.toonspectrum.filter+json",
  palette: "application/vnd.toonspectrum.palette+json",
  template: "application/vnd.toonspectrum.template+json",
  "3d-preset": "application/vnd.toonspectrum.3d-preset+json",
} as const;

function definitionFor(
  kind: CreatorMarketplaceResourceKind
): Record<string, CreatorMarketplaceJsonValue> {
  switch (kind) {
    case "brush":
      return {
        snapshot: {
          presetId: "starter-ink",
          renderer: "perfect-freehand",
          settings: { opacity: 1, size: 7 },
        },
      };
    case "filter":
      return {
        engine: "studio-filter-stack-v1",
        values: { pipeline: ["levels", "halftone"], strength: 0.75 },
      };
    case "palette":
      return { colors: ["#111827", "#ef4444", "#f8fafc"] };
    case "template":
      return { templateId: "webtoon.vertical.basic" };
    case "asset":
      return {
        recipeId: "speech-bubble.rounded",
        parameters: { padding: 24, tail: "bottom" },
      };
    case "3d-preset":
      return {
        recipeId: "background.classroom",
        parameters: { lighting: "day" },
      };
  }
}

function hashPayload(payload: Record<string, CreatorMarketplaceJsonValue>): string {
  return createHash("sha256")
    .update(canonicalizeCreatorMarketplaceJson(payload))
    .digest("hex");
}

function manifestFor(
  kind: CreatorMarketplaceResourceKind
): CreatorMarketplaceResourceManifest {
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: kind,
    runtime: ({
      asset: "studio-procedural-asset-v1",
      brush: "studio-brush-v1",
      filter: "studio-filter-v1",
      palette: "studio-palette-v1",
      template: "studio-template-v1",
      "3d-preset": "studio-bg3d-preset-v1",
    } as const)[kind],
    definition: definitionFor(kind),
  };
  const delivery =
    kind === "asset" || kind === "3d-preset"
      ? {
          mode: "procedural-recipe" as const,
          mediaType: MEDIA_TYPE_BY_KIND[kind],
          payload,
          byteSize: creatorMarketplaceJsonByteSize(payload),
          sha256: hashPayload(payload),
        }
      : {
          mode: "portable-json" as const,
          mediaType: MEDIA_TYPE_BY_KIND[kind],
          payload,
          byteSize: creatorMarketplaceJsonByteSize(payload),
          sha256: hashPayload(payload),
        };
  return {
    schemaVersion: 1 as const,
    packageId: `original/${kind}/starter`,
    name: `${kind} 시작 팩`,
    description: "직접 제작한 무료 리소스",
    kind,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["무료", "오리지널"],
    license: "toonspectrum-standard" as const,
    attributionText: "",
    containsAi: false,
    rightsConfirmed: true as const,
    provenance: {
      origin: "original" as const,
      authoredByPublisher: true as const,
    },
    compatibility: { engines: ["canvas2d" as const] },
    entries: [{
      id: `${kind}/starter`,
      kind,
      name: "시작 리소스",
      delivery,
    }],
  } as CreatorMarketplaceResourceManifest;
}

describe("creator marketplace resource manifest contract", () => {
  it.each(CREATOR_MARKETPLACE_RESOURCE_KINDS)(
    "%s 패키지의 실제 portable/procedural 콘텐츠를 허용한다",
    (kind) => {
      expect(
        CreatorMarketplaceResourceManifestSchema.safeParse(manifestFor(kind)).success
      ).toBe(true);
    }
  );

  it("동일 JSON은 키 순서와 무관하게 같은 canonical body와 크기를 만든다", () => {
    const left = { b: 2, nested: { y: true, x: "a" }, a: 1 };
    const right = { a: 1, nested: { x: "a", y: true }, b: 2 };

    expect(canonicalizeCreatorMarketplaceJson(left)).toBe(
      '{"a":1,"b":2,"nested":{"x":"a","y":true}}'
    );
    expect(canonicalizeCreatorMarketplaceJson(left)).toBe(
      canonicalizeCreatorMarketplaceJson(right)
    );
    expect(creatorMarketplaceJsonByteSize(left)).toBe(
      creatorMarketplaceJsonByteSize(right)
    );
  });

  it("외부 허용 리소스를 자체 표준 사용권으로 재라이선스하지 못하게 한다", () => {
    const manifest = {
      ...manifestFor("brush"),
      provenance: {
        origin: "permissive" as const,
        authoredByPublisher: false as const,
        sourceName: "CC brush recipe",
        sourceUrl: "https://example.com/source",
        sourceLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    };

    expect(CreatorMarketplaceResourceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("CC BY 계열은 출처 문구를 요구하고 strict extra field를 거절한다", () => {
    const manifest = {
      ...manifestFor("palette"),
      license: "cc-by-4.0" as const,
      attributionText: "",
      copiedCommercialThumbnail: "forbidden",
    };

    expect(CreatorMarketplaceResourceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it.each([
    ["dataUrl", "data:image/png;base64,AAAA"],
    ["remote", "https://commercial.example/paid.glb"],
    ["blob", "blob:https://example.test/id"],
    ["javascript", "javascript:alert(1)"],
    ["protocolRelative", "//commercial.example/paid.glb"],
    ["windowsShare", "\\\\commercial.example\\paid.glb"],
    ["control", `preset${String.fromCharCode(1)}name`],
  ])("portable JSON의 %s 바이너리·원격 전달을 거절한다", (_label, source) => {
    const manifest = manifestFor("brush");
    const payload = {
      schemaVersion: 1 as const,
      resourceKind: "brush" as const,
      runtime: "studio-brush-v1" as const,
      definition: { snapshot: { source } },
    };
    const invalid = {
      ...manifest,
      entries: [{
        ...manifest.entries[0],
        delivery: {
          ...manifest.entries[0]!.delivery,
          payload,
          byteSize: creatorMarketplaceJsonByteSize(payload),
          sha256: hashPayload(payload),
        },
      }],
    };

    expect(CreatorMarketplaceResourceManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("2D/3D는 portable blob 대용 JSON이 아니라 절차형 recipe나 built-in 참조만 허용한다", () => {
    const manifest = manifestFor("3d-preset");
    const invalid = {
      ...manifest,
      entries: [{
        ...manifest.entries[0],
        delivery: {
          ...manifest.entries[0]!.delivery,
          mode: "portable-json" as const,
        },
      }],
    };

    expect(CreatorMarketplaceResourceManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("종류별 미디어 타입과 실제 canonical byteSize의 불일치를 거절한다", () => {
    const manifest = manifestFor("filter");
    const invalid = {
      ...manifest,
      entries: [{
        ...manifest.entries[0],
        delivery: {
          ...manifest.entries[0]!.delivery,
          mediaType: "application/vnd.toonspectrum.brush+json" as const,
          byteSize: manifest.entries[0]!.delivery.byteSize + 1,
        },
      }],
    };

    expect(CreatorMarketplaceResourceManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("portable payload의 schemaVersion·resourceKind·runtime discriminant를 종류별 강제한다", () => {
    const manifest = manifestFor("palette");
    const invalid = structuredClone(manifest);
    const delivery = invalid.entries[0]!.delivery;
    if (delivery.mode === "builtin-ref") throw new Error("fixture mismatch");
    delivery.payload.resourceKind = "brush";
    delivery.payload.runtime = "studio-brush-v1";
    delivery.byteSize = creatorMarketplaceJsonByteSize(delivery.payload);
    delivery.sha256 = hashPayload(delivery.payload);

    expect(CreatorMarketplaceResourceManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it("브러시·필터·팔레트의 종류별 최소 definition과 exact key를 강제한다", () => {
    const cases: Array<
      [CreatorMarketplaceResourceKind, Record<string, CreatorMarketplaceJsonValue>]
    > = [
      ["brush", { snapshot: {}, extra: true }],
      ["filter", { engine: "studio-filter-stack-v1", values: {} }],
      ["palette", { colors: ["#FFFFFF", "#ffffff"] }],
      ["template", { templateId: "valid", extra: true }],
      ["asset", { parameters: {} }],
      ["3d-preset", { recipeId: "valid", sourceUrl: "https://example.test/a.glb" }],
    ];

    for (const [kind, definition] of cases) {
      const manifest = manifestFor(kind);
      const payload = {
        schemaVersion: 1 as const,
        resourceKind: kind,
        runtime: CREATOR_MARKETPLACE_RUNTIME_BY_KIND[kind],
        definition,
      };
      const delivery = manifest.entries[0]!.delivery;
      if (delivery.mode === "builtin-ref") throw new Error("fixture mismatch");
      delivery.payload = payload as typeof delivery.payload;
      delivery.byteSize = creatorMarketplaceJsonByteSize(payload);
      delivery.sha256 = hashPayload(payload);
      expect(
        CreatorMarketplaceResourceManifestSchema.safeParse(manifest).success,
        `${kind} must reject an invalid definition`
      ).toBe(false);
    }
  });

  it("builtin-ref는 허용 종류와 종류별 안정 prefix를 강제한다", () => {
    for (const kind of ["asset", "template", "3d-preset"] as const) {
      const manifest = manifestFor(kind);
      const runtimeRef = `${CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND[kind]}starter`;
      manifest.entries[0]!.delivery = {
        mode: "builtin-ref",
        runtimeRef,
        byteSize: 0,
        sha256: hashPayload({ mode: "builtin-ref", runtimeRef }),
      };
      expect(CreatorMarketplaceResourceManifestSchema.safeParse(manifest).success).toBe(true);
    }

    const brush = manifestFor("brush");
    const runtimeRef = "studio-asset:starter";
    brush.entries[0]!.delivery = {
      mode: "builtin-ref",
      runtimeRef,
      byteSize: 0,
      sha256: hashPayload({ mode: "builtin-ref", runtimeRef }),
    };
    expect(CreatorMarketplaceResourceManifestSchema.safeParse(brush).success).toBe(false);

    const wrongPrefix = manifestFor("template");
    wrongPrefix.entries[0]!.delivery = {
      mode: "builtin-ref",
      runtimeRef: "studio-asset:starter",
      byteSize: 0,
      sha256: hashPayload({
        mode: "builtin-ref",
        runtimeRef: "studio-asset:starter",
      }),
    };
    expect(CreatorMarketplaceResourceManifestSchema.safeParse(wrongPrefix).success).toBe(false);
  });

  it("매우 깊은 payload와 순환·공유 참조를 call-stack 오류 없이 거절한다", () => {
    const deepRoot: Record<string, unknown> = {};
    let cursor = deepRoot;
    for (let index = 0; index < 10_000; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    expect(() =>
      CreatorMarketplacePortablePayloadSchema.safeParse({
        schemaVersion: 1,
        resourceKind: "brush",
        runtime: "studio-brush-v1",
        definition: { snapshot: deepRoot },
      })
    ).not.toThrow();
    expect(
      CreatorMarketplacePortablePayloadSchema.safeParse({
        schemaVersion: 1,
        resourceKind: "brush",
        runtime: "studio-brush-v1",
        definition: { snapshot: deepRoot },
      }).success
    ).toBe(false);
    expect(() => canonicalizeCreatorMarketplaceJson(deepRoot)).toThrow(TypeError);

    const shared = { size: 7 };
    expect(
      CreatorMarketplacePortablePayloadSchema.safeParse({
        schemaVersion: 1,
        resourceKind: "brush",
        runtime: "studio-brush-v1",
        definition: { snapshot: { first: shared, second: shared } },
      }).success
    ).toBe(false);
  });
});
