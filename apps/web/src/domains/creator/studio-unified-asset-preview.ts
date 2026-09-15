import { summarizeStudioSceneTemplate } from "./catalog/studio-scene-template-summary";
import { PRIMITIVE_DEFS, type BgPrimitiveKind } from "./studio-background-3d-metadata";
import { propDefById } from "./vrm/studio-vrm-props";

import type { StudioSceneTemplateSummary } from "./catalog/studio-scene-template-summary";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export type StudioUnifiedThreePreviewSource =
  | {
      readonly kind: "gltf";
      readonly url: `/assets/3d/${string}.glb`;
      readonly propId: string;
    }
  | {
      readonly kind: "procedural-prop";
      readonly propId: string;
    }
  | {
      readonly kind: "primitive";
      readonly primitiveKind: BgPrimitiveKind;
    }
  | {
      readonly kind: "scene-template";
      readonly templateId: string;
    };

export type StudioUnifiedAssetRichPreview =
  | {
      readonly kind: "image";
      readonly src: string;
      readonly alt: string;
      readonly aspectRatio: number | null;
      readonly facts: readonly string[];
    }
  | {
      readonly kind: "svg";
      readonly svg: string;
      readonly alt: string;
      readonly aspectRatio: number | null;
      readonly facts: readonly string[];
    }
  | {
      readonly kind: "scene-template";
      readonly summary: StudioSceneTemplateSummary;
      readonly alt: string;
      readonly facts: readonly string[];
    }
  | {
      readonly kind: "three";
      readonly source: StudioUnifiedThreePreviewSource;
      readonly cacheKey: string;
      readonly alt: string;
      readonly facts: readonly string[];
    }
  | {
      readonly kind: "generated-poster";
      readonly label: string;
      readonly category: string;
      readonly alt: string;
      readonly facts: readonly string[];
      readonly reason: "native-tool" | "missing-source" | "invalid-source";
    };

export interface StudioUnifiedAssetPreviewAudit {
  readonly total: number;
  readonly visual: number;
  readonly interactive3d: number;
  readonly templates: number;
  readonly generatedFallbacks: number;
  readonly coveragePercent: number;
}

function positiveAspectRatio(width: number | undefined, height: number | undefined): number | null {
  if (
    typeof width !== "number"
    || typeof height !== "number"
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) return null;
  return width / height;
}

function isBgPrimitiveKind(value: string): value is BgPrimitiveKind {
  return Object.prototype.hasOwnProperty.call(PRIMITIVE_DEFS, value);
}

function generatedPoster(
  item: StudioUnifiedAssetItem,
  reason: "native-tool" | "missing-source" | "invalid-source",
): StudioUnifiedAssetRichPreview {
  return {
    kind: "generated-poster",
    label: item.title,
    category: item.categoryLabel,
    alt: `${item.title} 기능 포스터`,
    facts: Object.freeze([
      item.categoryLabel,
      item.useMode === "open" ? "전용 편집 도구" : "Studio 에셋",
    ]),
    reason,
  };
}

export function resolveStudioUnifiedAssetRichPreview(
  item: StudioUnifiedAssetItem,
): StudioUnifiedAssetRichPreview {
  if (item.source.kind === "scene-template") {
    try {
      const summary = summarizeStudioSceneTemplate(item.source.value);
      return {
        kind: "scene-template",
        summary,
        alt: `${item.title} 장면 구성 미리보기`,
        facts: Object.freeze([
          `프레임 ${summary.frames}`,
          `말풍선 ${summary.bubbles}`,
          `텍스트 ${summary.texts}`,
          `효과 ${summary.effects}`,
        ]),
      };
    } catch {
      return generatedPoster(item, "invalid-source");
    }
  }

  if (item.source.kind === "object-3d") {
    const object = item.source.value;
    const commonFacts = Object.freeze([
      object.familyLabel,
      `${object.defaultWidth} × ${object.defaultHeight}px 기본 배치`,
      "회전·확대 미리보기",
    ]);

    if (object.kind === "vrm-prop") {
      const definition = propDefById(object.sourceId);
      if (!definition) return generatedPoster(item, "missing-source");
      if (definition.geometrySource.kind === "gltf") {
        return {
          kind: "three",
          source: {
            kind: "gltf",
            url: definition.geometrySource.url,
            propId: definition.id,
          },
          cacheKey: `gltf:${definition.geometrySource.url}`,
          alt: `${item.title} 3D 모델 미리보기`,
          facts: Object.freeze([
            ...commonFacts,
            "GLB 원본 모델",
            definition.category === "hand"
              ? "손 부착 지원"
              : definition.category === "head"
                ? "머리 부착 지원"
                : "몸·장면 소품",
          ]),
        };
      }
      return {
        kind: "three",
        source: { kind: "procedural-prop", propId: definition.id },
        cacheKey: `procedural-prop:${definition.id}`,
        alt: `${item.title} 3D 모델 미리보기`,
        facts: Object.freeze([
          ...commonFacts,
          "편집 가능한 절차형 모델",
          definition.category === "hand"
            ? "손 부착 지원"
            : definition.category === "head"
              ? "머리 부착 지원"
              : "몸·장면 소품",
        ]),
      };
    }

    if (object.kind === "bg3d-primitive") {
      if (!isBgPrimitiveKind(object.sourceId)) {
        return generatedPoster(item, "invalid-source");
      }
      return {
        kind: "three",
        source: { kind: "primitive", primitiveKind: object.sourceId },
        cacheKey: `primitive:${object.sourceId}`,
        alt: `${item.title} 3D 도형 미리보기`,
        facts: Object.freeze([
          ...commonFacts,
          "편집 가능한 3D 도형",
          "재질·크기·회전 변경",
        ]),
      };
    }

    return {
      kind: "three",
      source: { kind: "scene-template", templateId: object.sourceId },
      cacheKey: `scene-template-3d:${object.sourceId}`,
      alt: `${item.title} 3D 장면 미리보기`,
      facts: Object.freeze([
        ...commonFacts,
        "편집 가능한 3D 장면",
        "카메라·조명 변경",
      ]),
    };
  }

  if (item.preview.kind === "image") {
    const source = item.source;
    const aspectRatio = source.kind === "background"
      ? positiveAspectRatio(source.value.width, source.value.height)
      : source.kind === "local"
        ? positiveAspectRatio(source.value.width, source.value.height)
        : null;
    return {
      kind: "image",
      src: item.preview.src,
      alt: `${item.title} 미리보기`,
      aspectRatio,
      facts: Object.freeze([
        item.categoryLabel,
        source.kind === "local" ? "내 에셋" : "이미지 에셋",
        aspectRatio ? `${Math.round(aspectRatio * 100) / 100}:1 비율` : "원본 비율 유지",
      ]),
    };
  }

  if (item.preview.kind === "svg") {
    const source = item.source;
    const aspectRatio = source.kind === "background"
      ? positiveAspectRatio(source.value.width, source.value.height)
      : source.kind === "element"
        ? positiveAspectRatio(source.value.width, source.value.height)
        : null;
    return {
      kind: "svg",
      svg: item.preview.svg,
      alt: `${item.title} 벡터 미리보기`,
      aspectRatio,
      facts: Object.freeze([
        item.categoryLabel,
        "해상도 독립 벡터",
        "크기·회전 편집 가능",
      ]),
    };
  }

  if (item.source.kind === "native-tool") {
    return generatedPoster(item, "native-tool");
  }

  return generatedPoster(item, "missing-source");
}

export function auditStudioUnifiedAssetPreviews(
  items: readonly StudioUnifiedAssetItem[],
): StudioUnifiedAssetPreviewAudit {
  let visual = 0;
  let interactive3d = 0;
  let templates = 0;
  let generatedFallbacks = 0;

  for (const item of items) {
    const preview = resolveStudioUnifiedAssetRichPreview(item);
    if (preview.kind === "three") {
      visual += 1;
      interactive3d += 1;
    } else if (preview.kind === "scene-template") {
      visual += 1;
      templates += 1;
    } else if (preview.kind === "generated-poster") {
      generatedFallbacks += 1;
    } else {
      visual += 1;
    }
  }

  const total = items.length;
  return Object.freeze({
    total,
    visual,
    interactive3d,
    templates,
    generatedFallbacks,
    coveragePercent: total === 0 ? 100 : Math.round((visual / total) * 100),
  });
}
