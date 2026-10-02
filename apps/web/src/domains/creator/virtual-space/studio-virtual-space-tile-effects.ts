/**
 * 타일 이펙트 순수 상태 머신 (로컬 상태 + UI 범위).
 *
 * ZEP 스타일 타일 효과(통과불가/스폰/포털/지정영역/스포트라이트/유튜브/웹링크/BGM)
 * 아이디어만 참고했고, 외부 코드는 차용하지 않았다. 실제 아바타 이동 판정·미디어 재생·서버 연동은 하지 않는다.
 *
 * - createTileEffect: 편집 입력을 살균(sanitize)해 타일 이펙트 정의를 만든다.
 * - resolveTileEffectTrigger: 아바타 탐침(월드 픽셀 좌표)이 타일에 진입/접촉했을 때
 *   발동할 효과를 판정하고 적용 결과(포털 목적지·구역 태그·미디어 URL 등)를 반환한다.
 * - createStudioTilePortalPair / 콘티룸↔녹음부스 프리셋: 양방향 포털 쌍을 만든다.
 */

import type { StudioOfficeZoneType } from "./studio-virtual-space-office-zones";

/** 타일 이펙트 종류. */
export type StudioTileEffectKind =
  | "spawn" // 스폰 지점
  | "portal" // 다른 구역/방으로 이동
  | "blocked" // 통과 불가
  | "zone" // 지정 영역 (프라이빗/silent 태그)
  | "spotlight" // 발표 스포트라이트 (무대 구역)
  | "youtube" // 유튜브 임베드 타일
  | "weblink" // 웹 링크 타일
  | "app" // 인월드 앱 임베드 타일 (근접 시 패널로 웹페이지/내장 앱 오픈)
  | "bgm"; // 분위기 BGM 타일 (반경 기반 재생 범위)

export const STUDIO_TILE_EFFECT_KINDS: readonly StudioTileEffectKind[] = [
  "spawn",
  "portal",
  "blocked",
  "zone",
  "spotlight",
  "youtube",
  "weblink",
  "app",
  "bgm",
];

/** 지정 영역 태그. */
export type StudioTileZoneTag = "private" | "silent";

/**
 * 타일 한 칸의 픽셀 크기 정본. 저작 도구(DecorationEditor 기본값)와 실행
 * 판정(캔버스·페이지)이 같은 값을 써야 배치와 발동이 어긋나지 않는다.
 */
export const STUDIO_TILE_EFFECT_TILE_SIZE: StudioTilePixelSize = Object.freeze({ width: 16, height: 16 });

export const STUDIO_TILE_ZONE_TAGS: readonly StudioTileZoneTag[] = ["private", "silent"];

interface StudioTileEffectBase {
  readonly id: string;
  readonly name: string;
  /** 타일 단위 좌표 (0 이상 정수). */
  readonly tileX: number;
  readonly tileY: number;
  /** 타일 단위 크기 (1 이상 정수). */
  readonly width: number;
  readonly height: number;
}

/** 살균을 마친 타일 이펙트 정의. kind별로 필요한 속성이 채워져 있다. */
export type StudioTileEffectDefinition =
  | (StudioTileEffectBase & { readonly kind: "spawn" })
  | (StudioTileEffectBase & { readonly kind: "blocked" })
  | (StudioTileEffectBase & { readonly kind: "zone"; readonly zoneTag: StudioTileZoneTag })
  | (StudioTileEffectBase & { readonly kind: "spotlight" })
  | (StudioTileEffectBase & {
    readonly kind: "portal";
    readonly destinationRoom: string;
    readonly destinationTileX: number;
    readonly destinationTileY: number;
  })
  | (StudioTileEffectBase & { readonly kind: "youtube"; readonly url: string; readonly embedUrl: string })
  | (StudioTileEffectBase & { readonly kind: "weblink"; readonly url: string })
  | (StudioTileEffectBase & {
    readonly kind: "app";
    /** http(s) 웹페이지 또는 내장 앱 주소(toonstudio://…). */
    readonly url: string;
    /** true일 때만 샌드박스 iframe에 postMessage API 브리지를 허용한다. */
    readonly allowApi: boolean;
    /** 패널 제목. 비어 있으면 이펙트 이름을 쓴다. */
    readonly title: string;
  })
  | (StudioTileEffectBase & {
    readonly kind: "bgm";
    readonly url: string;
    /** 재생 범위 반경 (타일 단위). 진입 시 재생·퇴장 시 정지 의도. */
    readonly radius: number;
    /** 0~1 볼륨. */
    readonly volume: number;
  });

export type StudioTileEffectOf<Kind extends StudioTileEffectKind> = Extract<
  StudioTileEffectDefinition,
  { readonly kind: Kind }
>;

/** 아바타 탐침 위치 (월드 픽셀 좌표). */
export interface StudioTileTriggerProbe {
  readonly x: number;
  readonly y: number;
}

/** 타일 한 칸의 픽셀 크기. */
export interface StudioTilePixelSize {
  readonly width: number;
  readonly height: number;
}

/** 타일 진입/접촉 시 발동하는 이펙트 적용 결과. */
export type StudioTileEffectTrigger =
  | { readonly kind: "spawn"; readonly effect: StudioTileEffectOf<"spawn">; readonly tileX: number; readonly tileY: number }
  | {
    readonly kind: "portal";
    readonly effect: StudioTileEffectOf<"portal">;
    readonly room: string;
    readonly tileX: number;
    readonly tileY: number;
  }
  | { readonly kind: "blocked"; readonly effect: StudioTileEffectOf<"blocked"> }
  | { readonly kind: "zone"; readonly effect: StudioTileEffectOf<"zone">; readonly tag: StudioTileZoneTag }
  | { readonly kind: "spotlight"; readonly effect: StudioTileEffectOf<"spotlight">; readonly tileX: number; readonly tileY: number }
  | { readonly kind: "youtube"; readonly effect: StudioTileEffectOf<"youtube">; readonly url: string; readonly embedUrl: string }
  | { readonly kind: "weblink"; readonly effect: StudioTileEffectOf<"weblink">; readonly url: string }
  | {
    readonly kind: "app";
    readonly effect: StudioTileEffectOf<"app">;
    readonly url: string;
    readonly allowApi: boolean;
    readonly title: string;
  }
  | {
    readonly kind: "bgm";
    readonly effect: StudioTileEffectOf<"bgm">;
    readonly url: string;
    readonly radius: number;
    readonly volume: number;
  };

/** 미살균 편집 입력. 모든 필드는 unknown으로 받고 createTileEffect가 검증한다. */
export interface StudioTileEffectInput {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly name?: unknown;
  readonly tileX?: unknown;
  readonly tileY?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly destinationRoom?: unknown;
  readonly destinationTileX?: unknown;
  readonly destinationTileY?: unknown;
  readonly zoneTag?: unknown;
  readonly url?: unknown;
  readonly radius?: unknown;
  readonly volume?: unknown;
  /** 인월드 앱 임베드: true일 때만 postMessage API 브리지 허용. */
  readonly allowApi?: unknown;
  /** 인월드 앱 임베드: 패널 제목. */
  readonly title?: unknown;
}

export type StudioTileEffectErrorCode =
  | "unknown-kind"
  | "invalid-id"
  | "duplicate-id"
  | "invalid-tile-x"
  | "invalid-tile-y"
  | "invalid-size"
  | "missing-destination-room"
  | "invalid-destination-point"
  | "invalid-zone-tag"
  | "missing-url"
  | "invalid-url"
  | "unsupported-url-scheme"
  | "invalid-youtube-url"
  | "invalid-radius"
  | "invalid-volume";

export interface StudioTileEffectError {
  readonly code: StudioTileEffectErrorCode;
  readonly field: string;
}

export type StudioTileEffectCreateResult =
  | { readonly ok: true; readonly effect: StudioTileEffectDefinition; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly StudioTileEffectError[] };

const MAX_TILE_EFFECT_SPAN = 32;
const MAX_BGM_RADIUS_TILES = 24;
const DEFAULT_BGM_RADIUS_TILES = 3;
const DEFAULT_BGM_VOLUME = 0.6;
/** 인월드 앱 타일의 내장 앱 주소 패턴 (예: toonstudio://timer). */
export const STUDIO_APP_TILE_BUILTIN_URL_PATTERN = /^toonstudio:\/\/[a-z0-9][a-z0-9-]*$/;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const EFFECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isTileEffectKind(value: unknown): value is StudioTileEffectKind {
  return typeof value === "string" && (STUDIO_TILE_EFFECT_KINDS as readonly string[]).includes(value);
}

function isTileZoneTag(value: unknown): value is StudioTileZoneTag {
  return typeof value === "string" && (STUDIO_TILE_ZONE_TAGS as readonly string[]).includes(value);
}

function trimmedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return undefined;
  return value;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function nextEffectId(kind: StudioTileEffectKind, existingIds: readonly string[]): string {
  const taken = new Set(existingIds);
  let index = existingIds.length + 1;
  let candidate = `tile-effect-${kind}-${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `tile-effect-${kind}-${index}`;
  }
  return candidate;
}

function parseHttpUrl(raw: string): { readonly ok: true; readonly url: URL } | { readonly ok: false } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
  return { ok: true, url: parsed };
}

/** 유튜브 시청/공유/shorts/embed URL에서 영상 ID를 뽑아 embed URL을 만든다. */
function studioTileYoutubeEmbedUrl(raw: string): string | undefined {
  const parsed = parseHttpUrl(raw);
  if (!parsed.ok) return undefined;
  const host = parsed.url.hostname.toLowerCase();
  const youtubeHost =
    host === "youtube.com" || host.endsWith(".youtube.com") ||
    host === "youtu.be" || host.endsWith(".youtu.be") ||
    host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
  if (!youtubeHost) return undefined;
  const path = parsed.url.pathname;
  const candidates: readonly (string | null)[] = (() => {
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const segment = path.split("/").filter((part) => part.length > 0)[0];
      return [segment ?? null];
    }
    if (path === "/watch") return [parsed.url.searchParams.get("v")];
    if (path.startsWith("/embed/") || path.startsWith("/shorts/") || path.startsWith("/live/")) {
      return [path.split("/")[2] ?? null];
    }
    return [];
  })();
  for (const candidate of candidates) {
    if (candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate)) {
      return `https://www.youtube.com/embed/${candidate}`;
    }
  }
  return undefined;
}

function sanitizeSize(value: unknown, field: string, errors: StudioTileEffectError[], warnings: string[]): number | undefined {
  if (value === undefined) return 1;
  const size = toInteger(value);
  if (size === undefined) {
    errors.push({ code: "invalid-size", field });
    return undefined;
  }
  if (size < 1) {
    warnings.push(`${field} 값을 1로 보정했습니다.`);
    return 1;
  }
  if (size > MAX_TILE_EFFECT_SPAN) {
    warnings.push(`${field} 값을 ${MAX_TILE_EFFECT_SPAN}로 보정했습니다.`);
    return MAX_TILE_EFFECT_SPAN;
  }
  return size;
}

/**
 * 편집 입력을 살균해 타일 이펙트 정의를 만든다. 순수 함수: 같은 입력이면 항상 같은 결과.
 * @param input 미살균 편집 입력
 * @param existingIds 이미 배치된 이펙트 id 목록 (중복 방지·자동 id 생성용)
 */
export function createTileEffect(
  input: StudioTileEffectInput,
  existingIds: readonly string[] = [],
): StudioTileEffectCreateResult {
  const errors: StudioTileEffectError[] = [];
  const warnings: string[] = [];

  if (!isTileEffectKind(input.kind)) {
    return { ok: false, errors: [{ code: "unknown-kind", field: "kind" }] };
  }
  const kind = input.kind;

  const providedId = trimmedText(input.id);
  let id: string;
  if (providedId === undefined) {
    id = nextEffectId(kind, existingIds);
  } else if (!EFFECT_ID_PATTERN.test(providedId)) {
    errors.push({ code: "invalid-id", field: "id" });
    id = "";
  } else if (existingIds.includes(providedId)) {
    errors.push({ code: "duplicate-id", field: "id" });
    id = providedId;
  } else {
    id = providedId;
  }

  const name = trimmedText(input.name) ?? "";

  const tileX = toInteger(input.tileX);
  if (tileX === undefined || tileX < 0) errors.push({ code: "invalid-tile-x", field: "tileX" });
  const tileY = toInteger(input.tileY);
  if (tileY === undefined || tileY < 0) errors.push({ code: "invalid-tile-y", field: "tileY" });

  const width = sanitizeSize(input.width, "width", errors, warnings);
  const height = sanitizeSize(input.height, "height", errors, warnings);

  if (errors.length > 0 || tileX === undefined || tileY === undefined || width === undefined || height === undefined) {
    return { ok: false, errors };
  }

  const base = { id, name, tileX, tileY, width, height } as const;

  switch (kind) {
    case "spawn":
    case "blocked":
    case "spotlight":
      return { ok: true, effect: { ...base, kind }, warnings };
    case "portal": {
      const destinationRoom = trimmedText(input.destinationRoom);
      if (destinationRoom === undefined) {
        return { ok: false, errors: [...errors, { code: "missing-destination-room", field: "destinationRoom" }] };
      }
      const destinationTileX = input.destinationTileX === undefined ? 0 : toInteger(input.destinationTileX);
      const destinationTileY = input.destinationTileY === undefined ? 0 : toInteger(input.destinationTileY);
      if (destinationTileX === undefined || destinationTileX < 0 || destinationTileY === undefined || destinationTileY < 0) {
        return { ok: false, errors: [...errors, { code: "invalid-destination-point", field: "destinationTileX" }] };
      }
      return { ok: true, effect: { ...base, kind, destinationRoom, destinationTileX, destinationTileY }, warnings };
    }
    case "zone": {
      if (input.zoneTag !== undefined && !isTileZoneTag(input.zoneTag)) {
        return { ok: false, errors: [...errors, { code: "invalid-zone-tag", field: "zoneTag" }] };
      }
      const zoneTag: StudioTileZoneTag = isTileZoneTag(input.zoneTag) ? input.zoneTag : "private";
      return { ok: true, effect: { ...base, kind, zoneTag }, warnings };
    }
    case "youtube": {
      const raw = trimmedText(input.url);
      if (raw === undefined) {
        return { ok: false, errors: [...errors, { code: "missing-url", field: "url" }] };
      }
      const embedUrl = studioTileYoutubeEmbedUrl(raw);
      if (embedUrl === undefined) {
        const parsed = parseHttpUrl(raw);
        const code = parsed.ok ? "invalid-youtube-url" : "invalid-url";
        return { ok: false, errors: [...errors, { code, field: "url" }] };
      }
      return { ok: true, effect: { ...base, kind, url: raw, embedUrl }, warnings };
    }
    case "weblink": {
      const raw = trimmedText(input.url);
      if (raw === undefined) {
        return { ok: false, errors: [...errors, { code: "missing-url", field: "url" }] };
      }
      const parsed = parseHttpUrl(raw);
      if (!parsed.ok) {
        let absolute: URL | undefined;
        try { absolute = new URL(raw); } catch { absolute = undefined; }
        const code = absolute ? "unsupported-url-scheme" : "invalid-url";
        return { ok: false, errors: [...errors, { code, field: "url" }] };
      }
      return { ok: true, effect: { ...base, kind, url: raw }, warnings };
    }
    case "app": {
      const raw = trimmedText(input.url);
      if (raw === undefined) {
        return { ok: false, errors: [...errors, { code: "missing-url", field: "url" }] };
      }
      // 내장 앱(toonstudio://timer 등)은 http(s)가 아니어도 허용한다.
      // 그 외에는 weblink와 같은 기준으로 http(s)만 받는다.
      if (!STUDIO_APP_TILE_BUILTIN_URL_PATTERN.test(raw) && !parseHttpUrl(raw).ok) {
        let absolute: URL | undefined;
        try { absolute = new URL(raw); } catch { absolute = undefined; }
        const code = absolute ? "unsupported-url-scheme" : "invalid-url";
        return { ok: false, errors: [...errors, { code, field: "url" }] };
      }
      const allowApi = input.allowApi === true;
      const title = trimmedText(input.title) ?? name;
      return { ok: true, effect: { ...base, kind, url: raw, allowApi, title }, warnings };
    }
    case "bgm": {
      const raw = trimmedText(input.url);
      if (raw === undefined) {
        return { ok: false, errors: [...errors, { code: "missing-url", field: "url" }] };
      }
      const siteRelative = raw.startsWith("/");
      if (!siteRelative && !parseHttpUrl(raw).ok) {
        return { ok: false, errors: [...errors, { code: "invalid-url", field: "url" }] };
      }
      let radius = DEFAULT_BGM_RADIUS_TILES;
      if (input.radius !== undefined) {
        const parsedRadius = toNumber(input.radius);
        if (parsedRadius === undefined) {
          return { ok: false, errors: [...errors, { code: "invalid-radius", field: "radius" }] };
        }
        if (parsedRadius < 1) { warnings.push(`반경을 1타일로 보정했습니다.`); radius = 1; }
        else if (parsedRadius > MAX_BGM_RADIUS_TILES) { warnings.push(`반경을 ${MAX_BGM_RADIUS_TILES}타일로 보정했습니다.`); radius = MAX_BGM_RADIUS_TILES; }
        else radius = parsedRadius;
      }
      let volume = DEFAULT_BGM_VOLUME;
      if (input.volume !== undefined) {
        const parsedVolume = toNumber(input.volume);
        if (parsedVolume === undefined) {
          return { ok: false, errors: [...errors, { code: "invalid-volume", field: "volume" }] };
        }
        if (parsedVolume < 0) { warnings.push(`볼륨을 0으로 보정했습니다.`); volume = 0; }
        else if (parsedVolume > 1) { warnings.push(`볼륨을 1로 보정했습니다.`); volume = 1; }
        else volume = parsedVolume;
      }
      return { ok: true, effect: { ...base, kind, url: raw, radius, volume }, warnings };
    }
  }
}

/** 탐침(probe)이 이펙트의 타일 사각형 안에 있는지 판정한다. */
export function studioTileEffectContains(
  effect: StudioTileEffectDefinition,
  probe: StudioTileTriggerProbe,
  tileSize: StudioTilePixelSize,
): boolean {
  if (!Number.isFinite(probe.x) || !Number.isFinite(probe.y)) return false;
  if (tileSize.width <= 0 || tileSize.height <= 0) return false;
  const left = effect.tileX * tileSize.width;
  const top = effect.tileY * tileSize.height;
  return probe.x >= left && probe.x < left + effect.width * tileSize.width
    && probe.y >= top && probe.y < top + effect.height * tileSize.height;
}

/**
 * BGM 타일의 반경 기반 재생 범위에 탐침이 들어와 있는지 판정한다.
 * 타일 사각형에서 타일 단위 거리(chebyshev가 아닌 유클리드)가 radius 이하이면 재생 의도,
 * 벗어나면 정지 의도다.
 */
export function studioTileBgmCovers(
  effect: StudioTileEffectOf<"bgm">,
  probe: StudioTileTriggerProbe,
  tileSize: StudioTilePixelSize,
): boolean {
  if (!Number.isFinite(probe.x) || !Number.isFinite(probe.y)) return false;
  if (tileSize.width <= 0 || tileSize.height <= 0) return false;
  const left = effect.tileX * tileSize.width;
  const top = effect.tileY * tileSize.height;
  const right = left + effect.width * tileSize.width;
  const bottom = top + effect.height * tileSize.height;
  const dxTiles = probe.x < left ? (left - probe.x) / tileSize.width : probe.x >= right ? (probe.x - right) / tileSize.width : 0;
  const dyTiles = probe.y < top ? (top - probe.y) / tileSize.height : probe.y >= bottom ? (probe.y - bottom) / tileSize.height : 0;
  return Math.hypot(dxTiles, dyTiles) <= effect.radius + 1e-9;
}

/**
 * 같은 타일을 여러 이펙트가 겹칠 때의 발동 우선순위.
 * blocked(통과 불가)가 가장 먼저 판정되고, spawn이 가장 나중이다.
 */
export const STUDIO_TILE_EFFECT_TRIGGER_PRIORITY: Readonly<Record<StudioTileEffectKind, number>> = {
  blocked: 0,
  portal: 1,
  zone: 2,
  spotlight: 3,
  youtube: 4,
  weblink: 5,
  app: 5,
  bgm: 6,
  spawn: 7,
};

function toTrigger(effect: StudioTileEffectDefinition): StudioTileEffectTrigger {
  switch (effect.kind) {
    case "spawn":
      return { kind: "spawn", effect, tileX: effect.tileX, tileY: effect.tileY };
    case "portal":
      return {
        kind: "portal", effect, room: effect.destinationRoom,
        tileX: effect.destinationTileX, tileY: effect.destinationTileY,
      };
    case "blocked":
      return { kind: "blocked", effect };
    case "zone":
      return { kind: "zone", effect, tag: effect.zoneTag };
    case "spotlight":
      return { kind: "spotlight", effect, tileX: effect.tileX, tileY: effect.tileY };
    case "youtube":
      return { kind: "youtube", effect, url: effect.url, embedUrl: effect.embedUrl };
    case "weblink":
      return { kind: "weblink", effect, url: effect.url };
    case "app":
      return { kind: "app", effect, url: effect.url, allowApi: effect.allowApi, title: effect.title };
    case "bgm":
      return { kind: "bgm", effect, url: effect.url, radius: effect.radius, volume: effect.volume };
  }
}

/**
 * 아바타가 타일에 진입/접촉했을 때 발동할 효과를 판정한다. 순수 함수.
 * - bgm은 반경 기반 재생 범위(진입 시 재생·퇴장 시 정지 의도)로 판정한다.
 * - 겹치는 이펙트가 있으면 STUDIO_TILE_EFFECT_TRIGGER_PRIORITY 순서로 하나만 반환한다.
 * - 발동할 효과가 없으면 null을 반환한다.
 */
export function resolveTileEffectTrigger(
  effects: readonly StudioTileEffectDefinition[],
  probe: StudioTileTriggerProbe,
  tileSize: StudioTilePixelSize,
): StudioTileEffectTrigger | null {
  let best: { readonly priority: number; readonly trigger: StudioTileEffectTrigger } | null = null;
  for (const effect of effects) {
    const hit = effect.kind === "bgm"
      ? studioTileBgmCovers(effect, probe, tileSize)
      : studioTileEffectContains(effect, probe, tileSize);
    if (!hit) continue;
    const priority = STUDIO_TILE_EFFECT_TRIGGER_PRIORITY[effect.kind];
    if (best === null || priority < best.priority) {
      best = { priority, trigger: toTrigger(effect) };
    }
  }
  return best?.trigger ?? null;
}

export interface StudioTilePortalEndpoint {
  readonly room: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly width?: number;
  readonly height?: number;
}

export interface StudioTilePortalPairRequest {
  readonly endpointA: StudioTilePortalEndpoint;
  readonly endpointB: StudioTilePortalEndpoint;
  readonly nameA?: string;
  readonly nameB?: string;
  readonly idA?: string;
  readonly idB?: string;
  readonly existingIds?: readonly string[];
}

export type StudioTilePortalPairResult =
  | {
    readonly ok: true;
    readonly effects: readonly [StudioTileEffectDefinition, StudioTileEffectDefinition];
    readonly warnings: readonly string[];
  }
  | { readonly ok: false; readonly errors: readonly StudioTileEffectError[] };

function portalInputFor(
  endpoint: StudioTilePortalEndpoint,
  target: StudioTilePortalEndpoint,
  name: string | undefined,
  id: string | undefined,
): StudioTileEffectInput {
  return {
    kind: "portal",
    id,
    name,
    tileX: endpoint.tileX,
    tileY: endpoint.tileY,
    width: endpoint.width,
    height: endpoint.height,
    destinationRoom: target.room,
    destinationTileX: target.tileX,
    destinationTileY: target.tileY,
  };
}

/**
 * 양방향 포털 쌍을 만든다. A의 목적지는 B, B의 목적지는 A다.
 * 한쪽이라도 살균에 실패하면 쌍 전체가 실패한다.
 */
export function createStudioTilePortalPair(request: StudioTilePortalPairRequest): StudioTilePortalPairResult {
  const existingIds = request.existingIds ?? [];
  if (trimmedText(request.endpointA.room) === undefined || trimmedText(request.endpointB.room) === undefined) {
    return { ok: false, errors: [{ code: "missing-destination-room", field: "destinationRoom" }] };
  }
  const first = createTileEffect(portalInputFor(request.endpointA, request.endpointB, request.nameA, request.idA), existingIds);
  if (!first.ok) return first;
  const second = createTileEffect(
    portalInputFor(request.endpointB, request.endpointA, request.nameB, request.idB),
    [...existingIds, first.effect.id],
  );
  if (!second.ok) return second;
  const firstEffect = first.effect;
  const secondEffect = second.effect;
  if (firstEffect.kind !== "portal" || secondEffect.kind !== "portal") {
    return { ok: false, errors: [{ code: "unknown-kind", field: "kind" }] };
  }
  return { ok: true, effects: [firstEffect, secondEffect], warnings: [...first.warnings, ...second.warnings] };
}

export interface StudioTilePortalPairPreset {
  readonly roomA: string;
  readonly roomB: string;
  readonly endpointA: { readonly tileX: number; readonly tileY: number; readonly width?: number; readonly height?: number };
  readonly endpointB: { readonly tileX: number; readonly tileY: number; readonly width?: number; readonly height?: number };
}

/** 콘티룸↔녹음부스 포털 예시 프리셋. 타일 좌표는 예시이며 호출자가 덮어쓸 수 있다. */
export const STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH: StudioTilePortalPairPreset = {
  roomA: "conti-room",
  roomB: "recording-booth",
  endpointA: { tileX: 6, tileY: 4 },
  endpointB: { tileX: 6, tileY: 4 },
};

/** 프리셋으로 양방향 포털 쌍을 만든다. */
export function createStudioTilePortalPairFromPreset(
  preset: StudioTilePortalPairPreset,
  options: {
    readonly nameA?: string;
    readonly nameB?: string;
    readonly idA?: string;
    readonly idB?: string;
    readonly tileA?: { readonly tileX: number; readonly tileY: number; readonly width?: number; readonly height?: number };
    readonly tileB?: { readonly tileX: number; readonly tileY: number; readonly width?: number; readonly height?: number };
    readonly existingIds?: readonly string[];
  } = {},
): StudioTilePortalPairResult {
  const tileA = options.tileA ?? preset.endpointA;
  const tileB = options.tileB ?? preset.endpointB;
  return createStudioTilePortalPair({
    endpointA: { room: preset.roomA, ...tileA },
    endpointB: { room: preset.roomB, ...tileB },
    nameA: options.nameA,
    nameB: options.nameB,
    idA: options.idA,
    idB: options.idB,
    existingIds: options.existingIds,
  });
}

/**
 * 오피스 존 입장 파티클 (Track D).
 *
 * 존에 입장할 때 한 번 재생되는 짧은 파티클 스펙. 기존 타일 이펙트 kind를
 * 확장하지 않는다 (consumer의 exhaustive switch를 보호하기 위함).
 * reducedMotion이 켜져 있으면 파티클을 끈다 — null을 반환한다.
 * 순수 데이터 + 순수 함수.
 */

export type StudioZoneEntryParticleShape = "sparkle" | "note" | "leaf" | "bubble" | "star";

export interface StudioZoneEntryParticle {
  readonly shape: StudioZoneEntryParticleShape;
  /** 파티클 색상 (hex). */
  readonly color: string;
  /** 파티클 개수. */
  readonly count: number;
  /** 재생 시간 (ms). */
  readonly durationMs: number;
}

export const STUDIO_ZONE_ENTRY_PARTICLES: Record<StudioOfficeZoneType, StudioZoneEntryParticle> = Object.freeze({
  lobby:          { shape: "sparkle", color: "#ffd97a", count: 8,  durationMs: 900 },
  reception:      { shape: "sparkle", color: "#ffe6a3", count: 6,  durationMs: 800 },
  "meeting-room": { shape: "bubble",  color: "#b9aef5", count: 7,  durationMs: 900 },
  "event-hall":   { shape: "star",    color: "#ffb45e", count: 12, durationMs: 1200 },
  lounge:         { shape: "leaf",    color: "#b8c98a", count: 6,  durationMs: 1400 },
  cafe:           { shape: "bubble",  color: "#d9a05e", count: 8,  durationMs: 1000 },
  "focus-zone":   { shape: "leaf",    color: "#9fb8a8", count: 5,  durationMs: 1600 },
  "phone-booth":  { shape: "bubble",  color: "#a8a8d4", count: 5,  durationMs: 800 },
  studio:         { shape: "sparkle", color: "#7ab8ff", count: 10, durationMs: 1000 },
  library:        { shape: "leaf",    color: "#c9b98a", count: 5,  durationMs: 1600 },
});

const PARTICLE_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * 존 입장 파티클 조회. reducedMotion이 켜져 있으면 null (파티클 off).
 */
export function zoneEntryParticles(
  zoneType: StudioOfficeZoneType,
  options: { readonly reducedMotion: boolean },
): StudioZoneEntryParticle | null {
  if (options.reducedMotion) return null;
  const spec = STUDIO_ZONE_ENTRY_PARTICLES[zoneType];
  if (!spec || !PARTICLE_COLOR.test(spec.color)) return null;
  return spec;
}
