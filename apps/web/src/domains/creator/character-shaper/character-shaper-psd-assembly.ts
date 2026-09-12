/** Pure PSD assembly: no scene, renderer, DOM canvas, or capture code is imported. */
import { writePsd, type BlendMode, type Layer, type Psd } from "ag-psd";

import { isEmptyPass, maskMultiply } from "./character-shaper-image-math";
import { validateCharacterPsdPasses, CHARACTER_PSD_MAX_OUTPUT_BYTES } from "./character-shaper-psd-worker-protocol";

import type { CharacterPsdExportReceipt, CharacterSemanticPass, CharacterSemanticPassId } from "./character-shaper-contract";

export type CharacterSemanticMaskId = Extract<CharacterSemanticPassId, `mask-${string}`>;
export interface CharacterSemanticSkip {
  readonly pass: CharacterSemanticPassId;
  readonly reason: string;
}
export interface BuildCharacterSemanticPsdOptions {
  readonly title: string;
}
export interface CharacterSemanticPsdResult {
  readonly blob: Blob;
  readonly receipt: CharacterPsdExportReceipt;
}

export const PSD_MIME = "image/vnd.adobe.photoshop";

/** Photoshop top-to-bottom order inside 「밑색」 — detail on top, skin underneath everything. */
export const CHARACTER_SEMANTIC_MASK_ORDER: readonly CharacterSemanticMaskId[] = Object.freeze([
  "mask-eyes",
  "mask-face",
  "mask-hair",
  "mask-accessory",
  "mask-top",
  "mask-bottom",
  "mask-shoes",
  "mask-skin",
]);

export const CHARACTER_SEMANTIC_MASK_LABELS: Readonly<Record<CharacterSemanticMaskId, string>> =
  Object.freeze({
    "mask-face": "얼굴",
    "mask-eyes": "눈",
    "mask-hair": "머리",
    "mask-skin": "피부",
    "mask-top": "상의",
    "mask-bottom": "하의",
    "mask-shoes": "신발",
    "mask-accessory": "액세서리",
  });

/** Group names, and the single layer each non-mask group starts with. */
export const CHARACTER_PSD_GROUP_NAMES = Object.freeze({
  flats: "밑색",
  shadow: "음영",
  highlight: "하이라이트",
  paint: "표면 드로잉",
  line: "주선",
});

/** The colourist keeps adding layers into these groups, so the first child names the pixels. */
const CHARACTER_PSD_CHILD_NAMES = Object.freeze({
  shadow: "어두운 면",
  highlight: "밝은 면",
  paint: "브러시 획",
  line: "윤곽선",
  flatsWhole: "밑색 (전체)",
});

/** Hidden reference frame at the bottom of the stack — what the viewport actually showed. */
export const CHARACTER_PSD_PREVIEW_LAYER_NAME = "미리보기 (Beauty)";

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function titleXmp(title: string): string {
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("");
}

function rasterLayer(
  name: string,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  extra: Partial<Layer> = {},
): Layer {
  return {
    name,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    opacity: 1,
    blendMode: "normal",
    imageData: { width, height, data },
    ...extra,
  };
}

function group(name: string, blendMode: BlendMode, children: Layer[]): Layer {
  return { name, opened: true, blendMode, opacity: 1, children };
}

function collectLayerNames(layers: readonly Layer[]): string[] {
  const names: string[] = [];
  for (const layer of layers) {
    names.push(layer.name ?? "");
    if (layer.children) names.push(...collectLayerNames(layer.children));
  }
  return names;
}

function firstVisibleRaster(layers: readonly Layer[]): Layer["imageData"] {
  for (const layer of layers) {
    if (layer.hidden) continue;
    const image = layer.imageData ?? (layer.children ? firstVisibleRaster(layer.children) : undefined);
    if (image) return image;
  }
  return undefined;
}

/**
 * Assemble the passes into one PSD in the order a colourist expects to find them:
 * 주선 → 표면 드로잉 → 하이라이트 → 음영 → 밑색 → 미리보기, top to bottom.
 *
 * `ag-psd` writes `children[0]` as the topmost layer, so this array is already in panel order — no
 * reversal. Passes that never arrived, and masks that came back empty, are added to the receipt's
 * `skipped` list instead of becoming blank layers.
 */
export function buildCharacterSemanticPsd(
  passes: readonly CharacterSemanticPass[],
  skipped: readonly CharacterSemanticSkip[],
  options: BuildCharacterSemanticPsdOptions,
): CharacterSemanticPsdResult {
  if (passes.length === 0) throw new Error("PSD로 저장할 렌더 패스가 없습니다.");
  validateCharacterPsdPasses(passes, skipped, options.title);
  const { width, height } = passes[0];
  const byId = new Map<CharacterSemanticPassId, CharacterSemanticPass>();
  for (const pass of passes) {
    if (pass.width !== width || pass.height !== height || pass.rgba.length !== width * height * 4) {
      throw new TypeError("렌더 패스 크기가 서로 달라 PSD를 만들 수 없습니다.");
    }
    byId.set(pass.id, pass);
  }

  const notes: CharacterSemanticSkip[] = [...skipped];
  const note = (pass: CharacterSemanticPassId, reason: string) => {
    if (notes.some((entry) => entry.pass === pass)) return;
    notes.push({ pass, reason });
  };

  const beauty = byId.get("beauty") ?? null;
  const flat = byId.get("flat") ?? null;
  const base = flat ?? beauty;

  const flatChildren: Layer[] = [];
  for (const mask of CHARACTER_SEMANTIC_MASK_ORDER) {
    const pass = byId.get(mask);
    if (!pass) continue;
    if (isEmptyPass(pass.rgba)) {
      note(mask, `${CHARACTER_SEMANTIC_MASK_LABELS[mask]} 마스크가 비어 있어 레이어를 만들지 않았습니다.`);
      continue;
    }
    const data = base ? maskMultiply(base.rgba, pass.rgba) : pass.rgba;
    flatChildren.push(rasterLayer(CHARACTER_SEMANTIC_MASK_LABELS[mask], width, height, data));
  }

  const children: Layer[] = [];
  const line = byId.get("line");
  if (line) {
    children.push(group(CHARACTER_PSD_GROUP_NAMES.line, "normal", [
      rasterLayer(CHARACTER_PSD_CHILD_NAMES.line, width, height, line.rgba),
    ]));
  }
  const paint = byId.get("surface-paint");
  if (paint) {
    children.push(group(CHARACTER_PSD_GROUP_NAMES.paint, "normal", [
      rasterLayer(CHARACTER_PSD_CHILD_NAMES.paint, width, height, paint.rgba),
    ]));
  }
  const highlight = byId.get("highlight");
  if (highlight) {
    children.push(group(CHARACTER_PSD_GROUP_NAMES.highlight, "screen", [
      rasterLayer(CHARACTER_PSD_CHILD_NAMES.highlight, width, height, highlight.rgba, {
        blendMode: "screen",
      }),
    ]));
  }
  const shadow = byId.get("shadow");
  if (shadow) {
    children.push(group(CHARACTER_PSD_GROUP_NAMES.shadow, "multiply", [
      rasterLayer(CHARACTER_PSD_CHILD_NAMES.shadow, width, height, shadow.rgba, {
        blendMode: "multiply",
      }),
    ]));
  }
  if (flatChildren.length > 0) {
    children.push(group(CHARACTER_PSD_GROUP_NAMES.flats, "normal", flatChildren));
  } else if (base) {
    // No mask separated cleanly — ship the un-split flat instead of an empty group, and say so.
    note("flat", "부위별 마스크를 분리하지 못해 밑색을 한 장으로 저장했습니다.");
    children.push(group(CHARACTER_PSD_GROUP_NAMES.flats, "normal", [
      rasterLayer(CHARACTER_PSD_CHILD_NAMES.flatsWhole, width, height, base.rgba),
    ]));
  }
  if (beauty) {
    children.push(rasterLayer(CHARACTER_PSD_PREVIEW_LAYER_NAME, width, height, beauty.rgba, {
      hidden: true,
    }));
  }
  if (children.length === 0) throw new Error("PSD로 저장할 레이어가 없습니다.");

  const psd: Psd = {
    width,
    height,
    children,
    // ag-psd does not composite layers and otherwise writes an opaque black merged image.
    // Store the actual captured appearance as the file preview; the editable semantic layers
    // retain their own masks/blend modes. This is not a claim of exact layer-stack equivalence.
    imageData: beauty ? { width, height, data: beauty.rgba }
      : flat ? { width, height, data: flat.rgba } : firstVisibleRaster(children),
    imageResources: { xmpMetadata: titleXmp(options.title) },
  };

  let buffer: ArrayBuffer;
  try {
    buffer = writePsd(psd, {
      noBackground: true,
      generateThumbnail: false,
      trimImageData: false,
    });
  } catch (error) {
    throw new Error(
      `PSD 파일을 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (buffer.byteLength > CHARACTER_PSD_MAX_OUTPUT_BYTES) throw new RangeError("PSD 파일 바이트 예산을 초과했습니다.");

  return {
    blob: new Blob([buffer], { type: PSD_MIME }),
    receipt: {
      width,
      height,
      layerNames: collectLayerNames(children),
      skipped: notes,
      byteLength: buffer.byteLength,
    },
  };
}
