import { parseStudioDrawingAssistDocument } from "../brush/studio-drawing-assist-document";
import { PAPER_GRAIN_KINDS } from "../brush/studio-paper-texture";
import { parseStudioLayerComps } from "../layer/studio-layer-comps-document";
import { copyStudioAdvancedRulerAsJson, type StudioAdvancedRulerDocument } from "../studio-advanced-ruler-document";

import {
  boundedString,
  cloneJsonObject,
  finiteRange,
  jsonValue,
  type StudioCrdtJsonObject,
  type StudioCrdtJsonValue,
} from "./studio-crdt-json-value";

import type {
  StudioCrdtCompatibleElement,
  StudioCrdtCompatibleLayerGroup,
  StudioCrdtCompatiblePage,
} from "./studio-crdt-page-bridge";
import type { StudioDrawingAssistDocument } from "../brush/studio-drawing-assist-document";
import type { StudioPaperSurfaceSettings } from "../brush/studio-paper-granulation-runtime";
import type { StudioLayerComp } from "../layer/studio-layer-comps";
import type { StudioShared3dStagePersistedState } from "../studio-shared-3d-stage-collection";

const PAGE_PAYLOAD_KEYS = [
  "bg", "bgGrad", "canvasH", "name", "note", "hideMaster", "shotType", "cameraAngle",
  "drawingAssist", "paperSurface", "paperGrainVisible", "layerComps",
] as const;

export const STUDIO_CRDT_PAGE_PAYLOAD_VERSION = 1 as const;

export const STUDIO_CRDT_PAGE_MAX_BYTES = 8 * 1024;

export interface StudioCrdtPagePayload {
  version: typeof STUDIO_CRDT_PAGE_PAYLOAD_VERSION;
  props: StudioCrdtJsonObject;
}

export const STUDIO_CRDT_PAGE_PROPERTY_KEYS: ReadonlySet<string> = new Set(PAGE_PAYLOAD_KEYS);

const STUDIO_CRDT_PAPER_GRAIN_KIND_SET: ReadonlySet<string> = new Set(PAPER_GRAIN_KINDS);
const STUDIO_CRDT_PAPER_SURFACE_KEYS: ReadonlySet<string> = new Set(["kind", "seed"]);
const STUDIO_CRDT_PAPER_SURFACE_MAX_SEED = 0xffff_ffff;
const MAX_COORDINATE = 10_000_000;
const TEXT_ENCODER = new TextEncoder();

export interface StudioCrdtCompatibleOrderedPage<
  TElement extends StudioCrdtCompatibleElement,
> extends StudioCrdtCompatiblePage<TElement> {
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  name?: string;
  note?: string;
  hideMaster?: boolean;
  shotType?: string;
  cameraAngle?: string;
  drawingAssist?: StudioDrawingAssistDocument;
  paperSurface?: StudioPaperSurfaceSettings;
  paperGrainVisible?: boolean;
  layerComps?: readonly StudioLayerComp[];
  /** Synchronized through the dedicated per-stage CRDT sidecar, never the 8 KiB page envelope. */
  shared3dStage?: StudioShared3dStagePersistedState;
  groups?: StudioCrdtCompatibleLayerGroup[];
}

export type StudioCrdtPageMetadata = Pick<
  StudioCrdtCompatibleOrderedPage<StudioCrdtCompatibleElement>,
  "id" | typeof PAGE_PAYLOAD_KEYS[number]
>;

/** Immutable metadata identity permits stroke-only edits without serializing the page again. */
export function hasSameStudioCrdtPageMetadata<TPage extends StudioCrdtPageMetadata>(
  previous: StudioCrdtPageMetadata | null | undefined,
  page: TPage,
): boolean {
  return previous != null && PAGE_PAYLOAD_KEYS.every((key) => Object.is(previous[key], page[key]));
}

export function studioPageToCrdtPage<TPage extends StudioCrdtPageMetadata>(
  page: TPage,
) {
  const props: StudioCrdtJsonObject = { bg: page.bg, bgGrad: page.bgGrad, canvasH: page.canvasH };
  for (const key of PAGE_PAYLOAD_KEYS.slice(3)) {
    const normalized = jsonValue(page[key]);
    if (normalized !== undefined) props[key] = normalized;
  }
  return {
    id: page.id,
    payload: validateStudioCrdtPagePayload({ version: STUDIO_CRDT_PAGE_PAYLOAD_VERSION, props }),
  };
}

function copyStudioAdvancedRulerDocument(
  document: StudioAdvancedRulerDocument
): StudioCrdtJsonObject {
  // 종별 필드 복사는 문서 모듈이 담당한다 — 새 자(ruler) 종류가 늘어도 이 스키마는 무수정.
  const rulers: StudioCrdtJsonObject[] = document.rulers.map(
    (ruler) => copyStudioAdvancedRulerAsJson(ruler) as StudioCrdtJsonObject
  );
  return {
    version: document.version,
    rulers,
    activeSnapRulerId: document.activeSnapRulerId,
    selectedRulerId: document.selectedRulerId,
  };
}

export function validateStudioCrdtPagePayload(payload: StudioCrdtPagePayload): StudioCrdtPagePayload {
  if (payload.version !== STUDIO_CRDT_PAGE_PAYLOAD_VERSION) {
    throw new Error("지원하지 않는 페이지 페이로드 버전입니다.");
  }
  const props = cloneJsonObject(payload.props);
  for (const key of Object.keys(props)) {
    if (!STUDIO_CRDT_PAGE_PROPERTY_KEYS.has(key)) {
      throw new Error(`페이지의 ${key} 속성은 동기화할 수 없습니다.`);
    }
  }
  if (!boundedString(props.bg, 512)) throw new Error("페이지 배경이 올바르지 않습니다.");
  finiteRange(props.canvasH, 1, MAX_COORDINATE, "canvasH");
  const bgGrad = props.bgGrad;
  if (bgGrad !== null && (!Array.isArray(bgGrad) || bgGrad.length > 32 ||
    bgGrad.some((color) => !boundedString(color, 512)))) {
    throw new Error("페이지 그라데이션이 올바르지 않습니다.");
  }
  for (const key of ["name", "note", "shotType", "cameraAngle"] as const) {
    if (key in props && !boundedString(props[key], key === "note" ? 8_192 : 512)) {
      throw new Error(`페이지의 ${key} 값이 올바르지 않습니다.`);
    }
  }
  if ("hideMaster" in props && typeof props.hideMaster !== "boolean") {
    throw new Error("페이지 마스터 표시 값이 올바르지 않습니다.");
  }
  if ("paperGrainVisible" in props && typeof props.paperGrainVisible !== "boolean") {
    throw new Error("페이지 종이 결 표시 값이 올바르지 않습니다.");
  }
  if ("paperSurface" in props) {
    const paperSurface = props.paperSurface;
    if (
      paperSurface === null ||
      typeof paperSurface !== "object" ||
      Array.isArray(paperSurface) ||
      Object.keys(paperSurface).length !== STUDIO_CRDT_PAPER_SURFACE_KEYS.size ||
      !Object.keys(paperSurface).every((key) => STUDIO_CRDT_PAPER_SURFACE_KEYS.has(key)) ||
      typeof paperSurface.kind !== "string" ||
      !STUDIO_CRDT_PAPER_GRAIN_KIND_SET.has(paperSurface.kind) ||
      typeof paperSurface.seed !== "number" ||
      !Number.isInteger(paperSurface.seed) ||
      paperSurface.seed < 0 ||
      paperSurface.seed > STUDIO_CRDT_PAPER_SURFACE_MAX_SEED
    ) {
      throw new Error("페이지 종이 표면 설정이 올바르지 않습니다.");
    }
  }
  if ("layerComps" in props) {
    const layerComps = parseStudioLayerComps(props.layerComps);
    if (!layerComps) throw new Error("페이지 레이어 콤프가 올바르지 않습니다.");
    // The document parser returns detached, finite JSON values and drops unknown fields.
    props.layerComps = layerComps as unknown as StudioCrdtJsonValue;
  }
  if ("drawingAssist" in props) {
    const drawingAssist = parseStudioDrawingAssistDocument(props.drawingAssist);
    if (!drawingAssist) {
      throw new Error("페이지 드로잉 보조 설정이 손상되었거나 지원하지 않는 버전입니다.");
    }
    props.drawingAssist = {
      version: drawingAssist.version,
      perspective: {
        active: drawingAssist.perspective.active,
        points: drawingAssist.perspective.points.map((point) => ({
          id: point.id,
          x: point.x,
          y: point.y,
        })),
        eyeLevelY: drawingAssist.perspective.eyeLevelY,
        lockHorizon: drawingAssist.perspective.lockHorizon,
      },
      isometric: {
        active: drawingAssist.isometric.active,
        angleDeg: drawingAssist.isometric.angleDeg,
        cellSize: drawingAssist.isometric.cellSize,
        originX: drawingAssist.isometric.originX,
        originY: drawingAssist.isometric.originY,
      },
      advanced: copyStudioAdvancedRulerDocument(drawingAssist.advanced),
    };
  }
  if (TEXT_ENCODER.encode(JSON.stringify({ version: payload.version, props })).byteLength >
    STUDIO_CRDT_PAGE_MAX_BYTES) {
    throw new Error("페이지 정보가 실시간 동기화 8KiB 한도를 초과했습니다.");
  }
  return { version: payload.version, props };
}
