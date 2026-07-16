import { STUDIO_FILTER_CATALOG } from "./studio-filter-catalog";
import {
  normalizeStudioToolHintStableId,
  studioToolHint,
  type StudioToolHintSpec,
} from "./studio-tool-hints";

import type { StudioToolHintPreviewKind } from "./components/StudioToolHintPreview";

const STUDIO_ACTION_PREVIEW_BY_ID: Readonly<Record<string, StudioToolHintPreviewKind>> = {
  select: "select",
  transform: "select",
  pen: "ink",
  "pixel-pencil": "ink",
  eraser: "erase",
  fill: "fill",
  "advanced-fill": "fill",
  eyedropper: "sample",
  "smart-shape": "shape",
  "shape-rect": "shape",
  "shape-ellipse": "shape",
  perspective: "shape",
  shape: "shape",
  text: "text",
  bubble: "bubble",
  comment: "bubble",
  image: "image",
  reference: "image",
  "frame-anim": "image",
  filter: "filter",
  liquify: "filter",
  blend: "filter",
  lasso: "lasso",
  "poly-lasso": "lasso",
  "pixel-select": "lasso",
  "marquee-rect": "lasso",
  "marquee-circle": "lasso",
  rect: "lasso",
  ellipse: "lasso",
  "lasso-fill": "lasso",
  "brush-settings": "brush-size",
  "brush-size": "brush-size",
  "stroke-width": "brush-size",
  opacity: "opacity",
  "stroke-opacity": "opacity",
  "layer-opacity": "opacity",
  stabilizer: "stabilizer",
  smoothing: "stabilizer",
  "stroke-stabilizer": "stabilizer",
  pressure: "pressure",
  "pen-pressure": "pressure",
  symmetry: "symmetry",
  "mirror-drawing": "symmetry",
  "zoom-view": "zoom-view",
  zoom: "zoom-view",
  "zoom-fit": "zoom-view",
  "fit-width": "zoom-view",
  "rotate-view": "zoom-view",
  "flip-view": "zoom-view",
  hand: "zoom-view",
  pan: "zoom-view",
  history: "history",
  undo: "history",
  redo: "history",
  layer: "layer",
  layers: "layer",
  "add-layer": "layer",
  "duplicate-layer": "layer",
};

const STUDIO_FILTER_ENGINE_IDS = new Set(
  STUDIO_FILTER_CATALOG.map((entry) => normalizeStudioToolHintStableId(entry.engine))
);

function stableIdCandidates(value: string): readonly string[] {
  const normalized = normalizeStudioToolHintStableId(value);
  const leaf = normalized.split(/[:/]/u).at(-1) ?? normalized;
  return leaf === normalized ? [normalized] : [normalized, leaf];
}

function semanticTokens(value: string): ReadonlySet<string> {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .split(/[^a-z0-9가-힣]+/u)
      .filter(Boolean)
  );
}

function tokensIncludeAny(tokens: ReadonlySet<string>, values: readonly string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function previewFromIdentityTokens(tokens: ReadonlySet<string>): StudioToolHintPreviewKind | null {
  if (tokensIncludeAny(tokens, ["지우개", "지우기", "eraser", "erase"])) return "erase";
  if (tokensIncludeAny(tokens, ["스포이드", "색추출", "eyedropper", "sample"])) return "sample";
  if (tokensIncludeAny(tokens, ["올가미", "라쏘", "lasso"])) return "lasso";
  if (tokensIncludeAny(tokens, ["채우기", "채움", "fill", "bucket"])) return "fill";
  if (tokensIncludeAny(tokens, ["불투명도", "opacity"])) return "opacity";
  if (tokensIncludeAny(tokens, ["필압", "pressure"])) return "pressure";
  if (tokensIncludeAny(tokens, ["보정", "안정화", "stabilizer", "smoothing"])) return "stabilizer";
  if (tokensIncludeAny(tokens, ["대칭", "symmetry", "mirror"])) return "symmetry";
  if (tokensIncludeAny(tokens, ["굵기", "brushsize"])) return "brush-size";
  if (tokensIncludeAny(tokens, ["되돌리기", "실행취소", "다시실행", "undo", "redo", "history"])) return "history";
  if (tokensIncludeAny(tokens, ["레이어", "layer", "layers"])) return "layer";
  if (tokensIncludeAny(tokens, ["확대", "축소", "줌", "zoom", "pan"])) return "zoom-view";
  if (tokensIncludeAny(tokens, ["펜", "연필", "브러시", "pen", "pencil", "brush", "ink"])) return "ink";
  if (tokensIncludeAny(tokens, ["말풍선", "대사", "댓글", "bubble", "comment"])) return "bubble";
  if (tokensIncludeAny(tokens, ["텍스트", "글자", "자막", "text"])) return "text";
  if (tokensIncludeAny(tokens, ["이미지", "사진", "프레임", "애니메이션", "소재", "image", "photo", "frame", "asset"])) return "image";
  if (tokensIncludeAny(tokens, ["도형", "사각형", "타원", "원근", "그리드", "shape", "rect", "ellipse", "grid"])) return "shape";
  if (tokensIncludeAny(tokens, ["필터", "블러", "왜곡", "리퀴파이", "혼합", "filter", "blur", "liquify", "blend"])) return "filter";
  return null;
}

/** Resolve a meaningful visual only after the rich coach has been requested. */
export function studioToolHintPreview(
  hint: Pick<StudioToolHintSpec, "id" | "title" | "description" | "preview">
): StudioToolHintPreviewKind {
  if (hint.preview) return hint.preview;
  const ids = stableIdCandidates(hint.id);

  // Stable engine/action identities are authoritative. This avoids incidental
  // substring collisions such as `sharpen` → pen or `invert` → view/shape.
  if (ids.some((id) => STUDIO_FILTER_ENGINE_IDS.has(id))) return "filter";
  for (const id of ids) {
    const actionPreview = STUDIO_ACTION_PREVIEW_BY_ID[id];
    if (actionPreview) return actionPreview;
    const registeredPreview = studioToolHint(id)?.preview;
    if (registeredPreview) return registeredPreview;
  }

  // Unknown integrations receive a deliberately conservative exact-token
  // fallback. Help prose never overrides the tool's semantic identity.
  return previewFromIdentityTokens(semanticTokens(`${hint.id} ${hint.title}`)) ?? "select";
}
