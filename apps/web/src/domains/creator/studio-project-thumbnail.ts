/**
 * 프로젝트 대표 썸네일 — 에디터 저장 시점에 대표 페이지를 작은 래스터로 구워
 * 내 홈·작품 목록의 `thumbnailUrl`이 실제로 가리키게 하는 쓰기 경로.
 *
 * 왜 로케이터인가:
 * - 라이브러리 항목(`studio-project-library-reader`)의 `thumbnailUrl`은 2,048자로
 *   절단되는 URL 문자열이고, 라이브러리 전체가 localStorage 한 키에 산다. 수십 KB짜리
 *   data URL을 항목마다 넣으면 리더가 잘라 깨뜨리고, 쿼터 초과 시 라이브러리의 모든
 *   쓰기(이름 변경·열기 기록까지)가 함께 실패한다.
 * - 그래서 이미지 바이트는 전용 IndexedDB(`toonstudio-project-thumbnails`)에 Blob으로
 *   두고, 항목에는 `studio-thumbnail:v1/<projectId>` 로케이터만 기록한다. 읽는 쪽
 *   (useResolvedStudioProjectThumbnailUrl)이 로케이터만 골라 Blob URL로 해석하고,
 *   http(s) 등 일반 URL은 기존처럼 그대로 통과시킨다.
 *
 * 생성 경로:
 * - 대표 페이지는 자동저장 페이로드에서 고른다(현재 페이지 우선, 그다음 순서대로
 *   요소가 있는 첫 페이지 — 로비 카드 미리보기와 같은 규칙).
 * - 렌더는 새 스택을 만들지 않고 페이지 스트립이 쓰는 경량 SVG 프록시 스펙
 *   (`buildThumbNodes`)을 SVG 문자열로 직렬화해 캔버스에 그린다. Konva 스테이지를
 *   건드리지 않으므로 저장 흐름·그리기 세션을 방해하지 않는다.
 * - 내용 지문(sha256)이 저장된 기록과 같으면 다시 굽지 않는다. 저장할 때마다
 *   무조건 재생성하지 않기 위한 변경 감지다.
 * - 썸네일은 부가 정보라 어떤 단계가 실패해도 이 모듈은 throw 하지 않고 상태만
 *   돌려준다. 저장은 썸네일과 무관하게 성공한 것으로 취급한다.
 */

import { parseStudioWorkAssetSourceUri } from "@/shared/lib/studio-work-asset-contract";

import { CANVAS_W } from "./studio-assets";
import { canvasToBlob } from "./export/studio-export";
import {
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  type PageGrade,
} from "./studio-page-grade";
import type { StudioAutosavePayload } from "./studio-autosave";
import {
  buildThumbNodes,
  type ThumbElement,
  type ThumbNode,
  type ThumbPageLike,
} from "./studio-page-thumbs";
import { sha256HexPortable } from "./studio-sha256";
import {
  readStudioProjectLibrary,
  type StudioProjectLibraryEventTarget,
  type StudioProjectLibraryStorage,
} from "./studio-project-library-reader";
import { updateStudioProjectThumbnailUrl } from "./studio-project-library-store";

export const STUDIO_PROJECT_THUMBNAIL_DATABASE_NAME = "toonstudio-project-thumbnails";
const THUMBNAIL_STORE_NAME = "thumbnails";
const THUMBNAIL_DATABASE_VERSION = 1;

/** 라이브러리 항목의 thumbnailUrl에 기록되는 로케이터 접두사. */
export const STUDIO_PROJECT_THUMBNAIL_LOCATOR_PREFIX = "studio-thumbnail:v1/";

/** 파생본 크기 — 커버 표시 높이 128px의 레티나 2배를 넉넉히 덮는 가로 배너. */
export const STUDIO_PROJECT_THUMBNAIL_WIDTH = 768;
export const STUDIO_PROJECT_THUMBNAIL_HEIGHT = 288;

const TEXT_ENCODER = new TextEncoder();

export function studioProjectThumbnailLocator(projectId: string): string {
  return `${STUDIO_PROJECT_THUMBNAIL_LOCATOR_PREFIX}${projectId}`;
}

export function parseStudioProjectThumbnailLocator(value: string): string | null {
  if (!value.startsWith(STUDIO_PROJECT_THUMBNAIL_LOCATOR_PREFIX)) return null;
  const projectId = value.slice(STUDIO_PROJECT_THUMBNAIL_LOCATOR_PREFIX.length).trim();
  return projectId ? projectId : null;
}

export function isStudioProjectThumbnailLocator(value: string): boolean {
  return parseStudioProjectThumbnailLocator(value) !== null;
}

// ── IndexedDB 기록 저장소 (실패해도 throw 하지 않는 idb-kv와 같은 규율) ─────────────

export interface StudioProjectThumbnailRecord {
  readonly fingerprint: string;
  readonly updatedAt: string;
  readonly width: number;
  readonly height: number;
  readonly blob: Blob;
}

/** IDB에 실제로 저장되는 형태 — Blob을 ArrayBuffer+타입으로 바꿔 구조화 복제 경계를 안전하게 넘긴다. */
interface StoredThumbnailRecord {
  readonly fingerprint: string;
  readonly updatedAt: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly bytes: ArrayBuffer;
}

interface CachedConnection {
  readonly factory: IDBFactory;
  readonly promise: Promise<IDBDatabase | null>;
}

let cachedConnection: CachedConnection | null = null;

function currentFactory(): IDBFactory | null {
  try {
    return typeof indexedDB !== "undefined" ? indexedDB : null;
  } catch {
    return null;
  }
}

function openThumbnailDatabase(): Promise<IDBDatabase | null> {
  const factory = currentFactory();
  if (!factory) return Promise.resolve(null);
  if (cachedConnection && cachedConnection.factory === factory) return cachedConnection.promise;
  const promise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(STUDIO_PROJECT_THUMBNAIL_DATABASE_NAME, THUMBNAIL_DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        database.createObjectStore(THUMBNAIL_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  cachedConnection = { factory, promise };
  void promise.then((database) => {
    if (!database && cachedConnection?.promise === promise) cachedConnection = null;
  });
  return promise;
}

function validThumbnailRecord(value: unknown): StudioProjectThumbnailRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.fingerprint !== "string" || !record.fingerprint) return null;
  if (typeof record.updatedAt !== "string" || !record.updatedAt) return null;
  if (typeof record.mimeType !== "string" || !record.mimeType.startsWith("image/")) return null;
  // 구조화 복제를 거친 ArrayBuffer는 realm이 달라 instanceof가 실패할 수 있어 태그로 판정한다.
  const bytes = record.bytes;
  if (
    Object.prototype.toString.call(bytes) !== "[object ArrayBuffer]"
    || typeof (bytes as { byteLength?: unknown }).byteLength !== "number"
    || (bytes as { byteLength: number }).byteLength <= 0
  ) {
    return null;
  }
  const view = new Uint8Array(bytes as ArrayBuffer);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return {
    fingerprint: record.fingerprint,
    updatedAt: record.updatedAt,
    width: typeof record.width === "number" && record.width > 0 ? record.width : STUDIO_PROJECT_THUMBNAIL_WIDTH,
    height: typeof record.height === "number" && record.height > 0 ? record.height : STUDIO_PROJECT_THUMBNAIL_HEIGHT,
    blob: new Blob([copy], { type: record.mimeType }),
  };
}

export async function readStudioProjectThumbnailRecord(
  projectId: string,
): Promise<StudioProjectThumbnailRecord | null> {
  const database = await openThumbnailDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(THUMBNAIL_STORE_NAME, "readonly");
      const request = transaction.objectStore(THUMBNAIL_STORE_NAME).get(projectId);
      request.onsuccess = () => resolve(validThumbnailRecord(request.result));
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readStudioProjectThumbnailBlob(projectId: string): Promise<Blob | null> {
  const record = await readStudioProjectThumbnailRecord(projectId);
  return record?.blob ?? null;
}

async function writeStudioProjectThumbnailRecord(
  projectId: string,
  record: StudioProjectThumbnailRecord,
): Promise<boolean> {
  const database = await openThumbnailDatabase();
  if (!database) return false;
  let stored: StoredThumbnailRecord;
  try {
    stored = {
      fingerprint: record.fingerprint,
      updatedAt: record.updatedAt,
      width: record.width,
      height: record.height,
      mimeType: record.blob.type || "image/webp",
      bytes: await record.blob.arrayBuffer(),
    };
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(THUMBNAIL_STORE_NAME, "readwrite");
      transaction.objectStore(THUMBNAIL_STORE_NAME).put({ ...stored }, projectId);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function deleteStudioProjectThumbnail(projectId: string): Promise<void> {
  const database = await openThumbnailDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(THUMBNAIL_STORE_NAME, "readwrite");
      transaction.objectStore(THUMBNAIL_STORE_NAME).delete(projectId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ── 대표 페이지 선택 (로비 카드 미리보기의 정규화 규칙과 동일) ───────────────────────

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function thumbElementsOf(value: unknown): ThumbElement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((element): element is ThumbElement => {
    const item = recordOf(element);
    return item !== null
      && typeof item.id === "string"
      && item.id.trim().length > 0
      && typeof item.type === "string"
      && item.type.trim().length > 0;
  });
}

function normalizeThumbnailPage(value: unknown, fallbackId: string): ThumbPageLike | null {
  const page = recordOf(value);
  if (!page) return null;
  const elements = thumbElementsOf(page.elements);
  if (elements.length === 0) return null;
  const rawGradient = Array.isArray(page.bgGrad)
    ? page.bgGrad.filter((color): color is string => typeof color === "string")
    : [];
  const canvasH = typeof page.canvasH === "number"
    && Number.isFinite(page.canvasH)
    && page.canvasH > 0
    ? page.canvasH
    : 1080;
  return {
    id: typeof page.id === "string" && page.id.trim() ? page.id : fallbackId,
    elements,
    bg: typeof page.bg === "string" && page.bg.trim() ? page.bg : "#ffffff",
    bgGrad: rawGradient.length >= 2 ? rawGradient.slice(0, 2) : null,
    canvasH,
    grade: page.grade,
  };
}

/**
 * 자동저장 페이로드에서 썸네일로 구울 대표 페이지를 고른다.
 * 지금 보고 있는 페이지(currentPageId)를 먼저, 없으면 순서대로 요소가 있는 첫 페이지.
 */
export function selectStudioProjectThumbnailPage(
  payload: StudioAutosavePayload,
): ThumbPageLike | null {
  const currentIndex = payload.currentPageId
    ? payload.pagesList.findIndex((page) => page.id === payload.currentPageId)
    : -1;
  const pages = currentIndex >= 0
    ? [payload.pagesList[currentIndex], ...payload.pagesList.filter((_, index) => index !== currentIndex)]
    : payload.pagesList;
  for (let index = 0; index < pages.length; index += 1) {
    const page = normalizeThumbnailPage(pages[index], `thumbnail-page-${index + 1}`);
    if (page) return page;
  }
  return null;
}

/** 대표 페이지의 내용 지문 — 같으면 다시 굽지 않는다. */
export function studioProjectThumbnailFingerprint(page: ThumbPageLike): string {
  const grade = normalizePageGrade(page.grade as Partial<PageGrade> | undefined);
  return sha256HexPortable(TEXT_ENCODER.encode(JSON.stringify({
    id: page.id,
    bg: page.bg,
    bgGrad: page.bgGrad,
    canvasH: page.canvasH,
    grade: isDefaultPageGrade(grade) ? null : grade,
    elements: page.elements,
  })));
}

// ── SVG 직렬화 (StudioPageThumbnails의 노드 매핑과 같은 그림을 문자열로) ────────────

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function num(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}

function attrs(entries: readonly (readonly [name: string, value: string | number | null | undefined])[]): string {
  let output = "";
  for (const [name, value] of entries) {
    if (value === null || value === undefined) continue;
    output += ` ${name}="${escapeXml(String(value))}"`;
  }
  return output;
}

function transformAttr(node: ThumbNode): string | null {
  return node.transform ?? null;
}

function serializeThumbNode(node: ThumbNode): string {
  switch (node.kind) {
    case "rect":
      return `<rect${attrs([
        ["x", num(node.x)], ["y", num(node.y)], ["width", num(node.w)], ["height", num(node.h)],
        ["rx", node.rx ? num(node.rx) : null],
        ["fill", node.fill ?? "none"],
        ["fill-opacity", node.fillOpacity !== 1 ? num(node.fillOpacity) : null],
        ["stroke", node.stroke],
        ["stroke-width", node.stroke ? num(node.strokeWidth) : null],
        ["stroke-dasharray", node.dashed ? "10 5" : null],
        ["transform", transformAttr(node)],
        ["opacity", num(node.opacity)],
      ])}/>`;
    case "ellipse":
      return `<ellipse${attrs([
        ["cx", num(node.cx)], ["cy", num(node.cy)], ["rx", num(node.rx)], ["ry", num(node.ry)],
        ["fill", node.fill ?? "none"],
        ["stroke", node.stroke],
        ["stroke-width", node.stroke ? num(node.strokeWidth) : null],
        ["transform", transformAttr(node)],
        ["opacity", num(node.opacity)],
      ])}/>`;
    case "polygon":
      return `<polygon${attrs([
        ["points", node.points],
        ["fill", node.fill ?? "none"],
        ["stroke", node.stroke],
        ["stroke-width", node.stroke ? num(node.strokeWidth) : null],
        ["stroke-linejoin", "round"],
        ["transform", transformAttr(node)],
        ["opacity", num(node.opacity)],
      ])}/>`;
    case "polyline":
      return `<polyline${attrs([
        ["points", node.points],
        ["fill", "none"],
        ["stroke", node.stroke],
        ["stroke-width", num(node.strokeWidth)],
        ["stroke-linecap", "round"],
        ["stroke-linejoin", "round"],
        ["transform", transformAttr(node)],
        ["opacity", num(node.opacity)],
      ])}/>`;
    case "path":
      return `<path${attrs([
        ["d", node.d],
        ["fill", node.fill ?? "none"],
        ["stroke", node.stroke],
        ["stroke-width", node.stroke ? num(node.strokeWidth) : null],
        ["stroke-dasharray", node.dashed ? "8 5" : null],
        ["stroke-linejoin", "round"],
        ["transform", transformAttr(node)],
        ["opacity", num(node.opacity)],
      ])}/>`;
    case "image":
      return serializeThumbImageNode(node);
    case "text": {
      const tspans = node.lines
        .map((line, index) => `<tspan x="${num(node.x)}" dy="${index === 0 ? 0 : num(node.lineStep)}">${escapeXml(line)}</tspan>`)
        .join("");
      return `<text${attrs([
        ["x", num(node.x)], ["y", num(node.y)],
        ["text-anchor", node.anchor],
        ["font-size", num(node.fontSize)],
        ["font-family", node.font],
        ["font-weight", node.bold ? 700 : 400],
        ["fill", node.fill],
        ["stroke", node.stroke],
        ["stroke-width", node.stroke ? num(node.strokeWidth) : null],
        ["style", node.stroke ? "paint-order:stroke" : null],
        ["transform", transformAttr(node)],
        ["opacity", num(node.opacity)],
      ])}>${tspans}</text>`;
    }
  }
}

type ThumbImageNode = Extract<ThumbNode, { readonly kind: "image" }>;

function serializeThumbImageNode(node: ThumbImageNode): string {
  // SVG를 <img>로 그리는 컨텍스트에서는 외부 리소스를 읽을 수 없다. data: 이미지만
  // 실제로 그리고, 작업 에셋 URI·원격 URL은 스트립 썸네일과 같은 자리표시자로 남긴다.
  const embeddable = node.src.startsWith("data:") && !parseStudioWorkAssetSourceUri(node.src);
  if (!embeddable) {
    const mountain = `M ${num(node.x + node.w * 0.2)} ${num(node.y + node.h * 0.62)}`
      + ` L ${num(node.x + node.w * 0.42)} ${num(node.y + node.h * 0.4)}`
      + ` L ${num(node.x + node.w * 0.56)} ${num(node.y + node.h * 0.54)}`
      + ` L ${num(node.x + node.w * 0.78)} ${num(node.y + node.h * 0.3)}`;
    return `<g${attrs([
      ["transform", transformAttr(node)],
      ["opacity", num(node.opacity)],
    ])}><rect${attrs([
      ["x", num(node.x)], ["y", num(node.y)], ["width", num(node.w)], ["height", num(node.h)],
      ["rx", 10],
      ["fill", "rgb(99 102 241 / 0.08)"],
      ["stroke", "rgb(99 102 241 / 0.55)"],
      ["stroke-width", 3],
      ["stroke-dasharray", "12 8"],
    ])}/><path${attrs([
      ["d", mountain],
      ["fill", "none"],
      ["stroke", "rgb(99 102 241 / 0.7)"],
      ["stroke-width", num(Math.max(3, Math.min(node.w, node.h) * 0.025))],
      ["stroke-linecap", "round"],
      ["stroke-linejoin", "round"],
    ])}/></g>`;
  }
  return `<image${attrs([
    ["href", node.src],
    ["x", num(node.x)], ["y", num(node.y)], ["width", num(node.w)], ["height", num(node.h)],
    ["preserveAspectRatio", node.cover ? "xMidYMid slice" : "none"],
    ["style", node.filterCss ? `filter:${node.filterCss}` : null],
    ["transform", transformAttr(node)],
    ["opacity", num(node.opacity)],
  ])}/>`;
}

/** 출력 캔버스(가로 배너)에 들어갈 만큼만 위에서 잘라 본다 — 커버가 보여 주는 영역과 같다. */
export function studioProjectThumbnailCropHeight(canvasH: number): number {
  const full = Math.ceil(CANVAS_W * STUDIO_PROJECT_THUMBNAIL_HEIGHT / STUDIO_PROJECT_THUMBNAIL_WIDTH);
  return Math.max(1, Math.min(canvasH, full));
}

/**
 * 대표 페이지를 독립 SVG 문자열로 직렬화한다. 순수 함수라 브라우저 없이 검증할 수 있고,
 * 기본 래스터라이저는 이 문자열을 Image로 그려 캔버스에 굽는다.
 */
export function buildStudioProjectThumbnailSvg(page: ThumbPageLike): string {
  const { nodes } = buildThumbNodes(page);
  const canvasH = page.canvasH > 0 ? page.canvasH : 1080;
  const cropHeight = studioProjectThumbnailCropHeight(canvasH);
  const grade = normalizePageGrade(page.grade as Partial<PageGrade> | undefined);
  const gradeFilter = isDefaultPageGrade(grade) ? null : pageGradeToCssFilter(grade);
  const hasGradient = Array.isArray(page.bgGrad) && page.bgGrad.length >= 2;
  const gradientId = "studio-project-thumbnail-bg-grad";
  const defs = hasGradient
    ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0" stop-color="${escapeXml(page.bgGrad?.[0] ?? "#ffffff")}"/>`
      + `<stop offset="1" stop-color="${escapeXml(page.bgGrad?.[1] ?? "#ffffff")}"/>`
      + `</linearGradient></defs>`
    : "";
  const background = `<rect x="0" y="0" width="${CANVAS_W}" height="${num(canvasH)}" fill="${escapeXml(hasGradient ? `url(#${gradientId})` : page.bg)}"/>`;
  const body = nodes.map(serializeThumbNode).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${num(cropHeight)}"`
    + ` viewBox="0 0 ${CANVAS_W} ${num(cropHeight)}"${gradeFilter ? ` style="filter:${escapeXml(gradeFilter)}"` : ""}>`
    + `${defs}${background}${body}</svg>`;
}

// ── 기본 래스터라이저 (SVG → Image → 캔버스 → Blob) ─────────────────────────────────

function loadSvgImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * 브라우저 기본 래스터라이저. WebP를 우선하고 코덱이 없으면 JPEG·PNG으로 내려간다
 * (canvasToBlob이 컨테이너 magic으로 코덱을 검증해 실패 시 throw 한다).
 * 어떤 단계가 실패해도 null — 호출자는 기존 썸네일을 유지한다.
 */
export async function rasterizeStudioProjectThumbnailSvg(svg: string): Promise<Blob | null> {
  if (
    typeof document === "undefined"
    || typeof Image === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadSvgImage(svgUrl);
    if (!image) return null;
    const canvas = document.createElement("canvas");
    canvas.width = STUDIO_PROJECT_THUMBNAIL_WIDTH;
    canvas.height = STUDIO_PROJECT_THUMBNAIL_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const drawHeight = Math.min(
      canvas.height,
      canvas.width * (image.height > 0 ? image.height : STUDIO_PROJECT_THUMBNAIL_HEIGHT)
        / (image.width > 0 ? image.width : STUDIO_PROJECT_THUMBNAIL_WIDTH),
    );
    context.drawImage(image, 0, (canvas.height - drawHeight) / 2, canvas.width, drawHeight);
    const attempts: readonly (readonly [mime: string, quality: number | undefined])[] = [
      ["image/webp", 0.82],
      ["image/jpeg", 0.85],
      ["image/png", undefined],
    ];
    for (const [mime, quality] of attempts) {
      try {
        return await canvasToBlob(canvas, mime, quality);
      } catch {
        // 다음 코덱으로 내려간다.
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

// ── 저장 후 동기화 ──────────────────────────────────────────────────────────────────

export type StudioProjectThumbnailSyncResult =
  | { readonly status: "updated" }
  | { readonly status: "unchanged" }
  | {
      readonly status: "skipped";
      readonly reason: "no-project" | "project-not-found" | "no-source-page" | "render-failed" | "storage-failed";
    };

export interface SyncStudioProjectThumbnailInput {
  readonly storage: StudioProjectLibraryStorage;
  readonly projectId: string | null;
  readonly payload: StudioAutosavePayload;
  readonly target?: StudioProjectLibraryEventTarget;
  /** 테스트·대체 렌더러 주입 지점. 기본값은 브라우저 래스터라이저. */
  readonly rasterize?: (svg: string) => Promise<Blob | null>;
  readonly now?: () => string;
}

/**
 * 자동저장 성공 직후에 호출하는 썸네일 동기화. 작품이 라이브러리에 없거나(서버 전용
 * 작업 등) 대표 페이지가 비어 있으면 조용히 건너뛰고, 지문이 같으면 다시 굽지 않으며,
 * 렌더·저장이 실패하면 기존 썸네일을 그대로 둔다. 절대 throw 하지 않는다.
 */
export async function syncStudioProjectThumbnailAfterSave(
  input: SyncStudioProjectThumbnailInput,
): Promise<StudioProjectThumbnailSyncResult> {
  const projectId = input.projectId?.trim() ? input.projectId : null;
  if (!projectId) return { status: "skipped", reason: "no-project" };
  try {
    const entry = readStudioProjectLibrary(input.storage).projects
      .find((project) => project.id === projectId) ?? null;
    if (!entry) return { status: "skipped", reason: "project-not-found" };

    const page = selectStudioProjectThumbnailPage(input.payload);
    if (!page) return { status: "skipped", reason: "no-source-page" };

    const fingerprint = studioProjectThumbnailFingerprint(page);
    const locator = studioProjectThumbnailLocator(projectId);
    const existing = await readStudioProjectThumbnailRecord(projectId);
    if (existing && existing.fingerprint === fingerprint) {
      if (entry.thumbnailUrl !== locator) {
        updateStudioProjectThumbnailUrl(input.storage, projectId, locator, { target: input.target });
      }
      return { status: "unchanged" };
    }

    const rasterize = input.rasterize ?? rasterizeStudioProjectThumbnailSvg;
    const blob = await rasterize(buildStudioProjectThumbnailSvg(page)).catch(() => null);
    if (!blob) return { status: "skipped", reason: "render-failed" };

    const stored = await writeStudioProjectThumbnailRecord(projectId, {
      fingerprint,
      updatedAt: input.now?.() ?? new Date().toISOString(),
      width: STUDIO_PROJECT_THUMBNAIL_WIDTH,
      height: STUDIO_PROJECT_THUMBNAIL_HEIGHT,
      blob,
    });
    if (!stored) return { status: "skipped", reason: "storage-failed" };

    if (entry.thumbnailUrl !== locator) {
      updateStudioProjectThumbnailUrl(input.storage, projectId, locator, { target: input.target });
    }
    return { status: "updated" };
  } catch {
    return { status: "skipped", reason: "storage-failed" };
  }
}
