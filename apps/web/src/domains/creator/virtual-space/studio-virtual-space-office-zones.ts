import type {
  StudioVirtualSpacePoint,
  StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import type { PlaceWorkMode } from "./studio-virtual-space-place-modes";
import { parsePlaceWorkMode } from "./studio-virtual-space-place-modes";

/**
 * 오피스 존 시스템 (Track D).
 *
 * 게더타운식 가상 오피스의 방 단위 규칙·분위기 레이어다. 기존 월드 룸(manifest.rooms)
 * 위에 얹히는 오버레이 개념이라, 룸과 1:1이 아니어도 된다 (룸 안의 서브 존, 예: 라운지
 * 안의 카페 코너). 순수 함수만 두며, 실제 음소거·오디오·렌더링은 호출자가 수행한다.
 *
 * - createOfficeZone: 편집 입력을 살균해 존 정의를 만든다.
 * - studioOfficeZoneContains / zoneAtPoint: 점이 속한 존 판정 (겹치면 가장 좁은 존 우선).
 * - resolveOfficeZoneTransition: 존 입장/퇴장/전환 감지.
 * - validateOfficeZones: manifest 검증에서 쓰는 구조 검사.
 */

/** 오피스 존 종류 — 최소 8종. */
export type StudioOfficeZoneType =
  | "lobby"        // 로비
  | "reception"    // 리셉션
  | "meeting-room" // 회의실
  | "event-hall"   // 이벤트홀
  | "lounge"       // 라운지
  | "cafe"         // 카페
  | "focus-zone"   // 집중존 (사일런트)
  | "phone-booth"  // 통화부스
  | "studio"       // 스튜디오
  | "library";     // 자료실

export const STUDIO_OFFICE_ZONE_TYPES: readonly StudioOfficeZoneType[] = Object.freeze([
  "lobby", "reception", "meeting-room", "event-hall", "lounge",
  "cafe", "focus-zone", "phone-booth", "studio", "library",
]);

/** 미니맵 표시 분류. minimap 모듈의 StudioMinimapZoneKind와 구조적으로 같다. */
export type StudioOfficeZoneDisplayKind = "public" | "private" | "silent" | "spotlight";

export interface StudioOfficeZoneTypeMeta {
  readonly type: StudioOfficeZoneType;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly displayKind: StudioOfficeZoneDisplayKind;
  readonly minimapFill: string;
  readonly minimapStroke: string;
}

const TYPE_METAS: Record<StudioOfficeZoneType, StudioOfficeZoneTypeMeta> = {
  lobby: {
    type: "lobby", labelKo: "로비", labelEn: "Lobby",
    descriptionKo: "오늘 일정과 초대를 확인하고 캠퍼스로 입장하는 관문이에요.",
    descriptionEn: "The gateway where you check today's agenda and invitations before entering the campus.",
    displayKind: "public", minimapFill: "#e8f1ff", minimapStroke: "#5b8def",
  },
  reception: {
    type: "reception", labelKo: "리셉션", labelEn: "Reception",
    descriptionKo: "방문객을 맞이하고 안내를 받는 접대 공간이에요.",
    descriptionEn: "A welcoming desk for visitors and guidance.",
    displayKind: "public", minimapFill: "#eef4ff", minimapStroke: "#7aa2f0",
  },
  "meeting-room": {
    type: "meeting-room", labelKo: "회의실", labelEn: "Meeting Room",
    descriptionKo: "문이 닫히면 외부 소리가 차단되는 비공개 회의 공간이에요.",
    descriptionEn: "A private meeting space sealed from outside sound when the door closes.",
    displayKind: "private", minimapFill: "#f3e8ff", minimapStroke: "#9a6ee8",
  },
  "event-hall": {
    type: "event-hall", labelKo: "이벤트홀", labelEn: "Event Hall",
    descriptionKo: "발표·상영·타운홀 미팅이 열리는 큰 열린 공간이에요.",
    descriptionEn: "A large open space for talks, screenings and town-hall meetings.",
    displayKind: "spotlight", minimapFill: "#fff3d6", minimapStroke: "#e8a13c",
  },
  lounge: {
    type: "lounge", labelKo: "라운지", labelEn: "Lounge",
    descriptionKo: "가볍게 쉬어가며 팀원과 수다를 나누는 공용 휴게 공간이에요.",
    descriptionEn: "A common lounge to rest and chat lightly with teammates.",
    displayKind: "public", minimapFill: "#e9fbf0", minimapStroke: "#4caf7d",
  },
  cafe: {
    type: "cafe", labelKo: "카페", labelEn: "Cafe",
    descriptionKo: "커피 한 잔과 함께 편하게 모이는 카페 코너예요.",
    descriptionEn: "A cozy cafe corner to gather over coffee.",
    displayKind: "public", minimapFill: "#fdf0e4", minimapStroke: "#d08a4a",
  },
  "focus-zone": {
    type: "focus-zone", labelKo: "집중존", labelEn: "Focus Zone",
    descriptionKo: "말소리를 자제하고 깊이 집중하는 조용한 공간이에요. 입장하면 음소거를 권장해요.",
    descriptionEn: "A quiet space for deep focus. Muting is recommended on entry.",
    displayKind: "silent", minimapFill: "#e9edf5", minimapStroke: "#6b7a99",
  },
  "phone-booth": {
    type: "phone-booth", labelKo: "통화부스", labelEn: "Phone Booth",
    descriptionKo: "1인용 비공개 통화 공간이에요. 통화할 때만 이용해요.",
    descriptionEn: "A private one-person booth for calls only.",
    displayKind: "private", minimapFill: "#f0eaf9", minimapStroke: "#8a6fd6",
  },
  studio: {
    type: "studio", labelKo: "스튜디오", labelEn: "Studio",
    descriptionKo: "녹화·라이브·제작이 이뤄지는 스튜디오예요. 작업 중 방해를 자제해요.",
    descriptionEn: "A studio for recording, live sessions and production. Please avoid interruptions during work.",
    displayKind: "spotlight", minimapFill: "#ffeef4", minimapStroke: "#e86a9a",
  },
  library: {
    type: "library", labelKo: "자료실", labelEn: "Library",
    descriptionKo: "레퍼런스와 기록을 조용히 열람하는 공간이에요. 음소거를 권장해요.",
    descriptionEn: "A quiet space to browse references and records. Muting is recommended.",
    displayKind: "silent", minimapFill: "#edf3ea", minimapStroke: "#7d9a72",
  },
};

/** 존 종류 메타데이터 조회. */
export function officeZoneTypeMeta(type: StudioOfficeZoneType): StudioOfficeZoneTypeMeta {
  return TYPE_METAS[type];
}

/** 존 영역: 사각형 또는 다각형. */
export type StudioOfficeZoneShape =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: "polygon"; readonly points: readonly StudioVirtualSpacePoint[] };

export type StudioOfficeZoneRuleSeverity = "info" | "suggestion" | "required";

export interface StudioOfficeZoneRule {
  readonly id: string;
  readonly severity: StudioOfficeZoneRuleSeverity;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioOfficeZone {
  readonly id: string;
  readonly type: StudioOfficeZoneType;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  readonly shape: StudioOfficeZoneShape;
  /** 연결된 월드 룸 id. 없으면 월드 전역 오버레이로 취급. */
  readonly roomId?: StudioVirtualSpaceZoneId;
  readonly rules: readonly StudioOfficeZoneRule[];
  readonly ambientHintKo?: string;
  readonly ambientHintEn?: string;
  /** 입장 시 자동 음소거를 제안 (집중존·자료실). 실제 음소거는 호출자가 수행. */
  readonly suggestMuteOnEnter?: boolean;
  /** 비공개 음향 (회의실·통화부스). */
  readonly privateAudio?: boolean;
  /**
   * 장소 업무 모드 (Track 6). 없으면 존 종류 폴백 매핑(placeWorkModeForZoneType)을 쓴다.
   * conference(회의실) | focus-desk(책상) | stage(스테이지) | lounge(휴게실) | none
   */
  readonly workMode?: PlaceWorkMode;
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/iu;

function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function cleanRectShape(shape: {
  readonly x: unknown; readonly y: unknown; readonly width: unknown; readonly height: unknown;
}): StudioOfficeZoneShape | null {
  const { x, y, width, height } = shape;
  const values = [x, y, width, height];
  if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value))) return null;
  if ((width as number) <= 0 || (height as number) <= 0) return null;
  if ((x as number) < 0 || (y as number) < 0 || (x as number) > 100_000 || (y as number) > 100_000) return null;
  return Object.freeze({ kind: "rect", x: x as number, y: y as number, width: width as number, height: height as number });
}

function cleanPolygonShape(points: unknown): StudioOfficeZoneShape | null {
  if (!Array.isArray(points) || points.length < 3 || points.length > 128) return null;
  const cleaned: StudioVirtualSpacePoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== "object") return null;
    const { x, y } = point as { readonly x: unknown; readonly y: unknown };
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || y < 0 || x > 100_000 || y > 100_000) return null;
    cleaned.push(Object.freeze({ x, y }));
  }
  return Object.freeze({ kind: "polygon", points: Object.freeze(cleaned) });
}

function cleanRule(rule: unknown): StudioOfficeZoneRule | null {
  if (!rule || typeof rule !== "object") return null;
  const { id, severity, labelKo, labelEn } = rule as {
    readonly id: unknown; readonly severity: unknown; readonly labelKo: unknown; readonly labelEn: unknown;
  };
  const cleanId = typeof id === "string" && SAFE_ID.test(id.trim()) ? id.trim() : null;
  const ko = cleanLabel(labelKo, 120);
  const en = cleanLabel(labelEn, 160);
  if (!cleanId || !ko || !en) return null;
  if (severity !== "info" && severity !== "suggestion" && severity !== "required") return null;
  return Object.freeze({ id: cleanId, severity, labelKo: ko, labelEn: en });
}

export interface StudioOfficeZoneInput {
  readonly id: unknown;
  readonly type: unknown;
  readonly labelKo: unknown;
  readonly labelEn: unknown;
  readonly descriptionKo?: unknown;
  readonly descriptionEn?: unknown;
  readonly shape: unknown;
  readonly roomId?: unknown;
  readonly rules?: unknown;
  readonly ambientHintKo?: unknown;
  readonly ambientHintEn?: unknown;
  readonly suggestMuteOnEnter?: unknown;
  readonly privateAudio?: unknown;
  readonly workMode?: unknown;
}

function cleanShape(shape: unknown): StudioOfficeZoneShape | null {
  if (!shape || typeof shape !== "object") return null;
  const candidate = shape as {
    readonly kind: unknown; readonly x: unknown; readonly y: unknown;
    readonly width: unknown; readonly height: unknown; readonly points: unknown;
  };
  if (candidate.kind === "rect") return cleanRectShape(candidate);
  if (candidate.kind === "polygon") return cleanPolygonShape(candidate.points);
  return null;
}

/** 오피스 존 생성. id·이름·영역을 살균하고, 무효 입력이면 null. */
export function createOfficeZone(input: StudioOfficeZoneInput): StudioOfficeZone | null {
  const id = typeof input.id === "string" && SAFE_ID.test(input.id.trim()) ? input.id.trim() : null;
  const type = typeof input.type === "string" && (STUDIO_OFFICE_ZONE_TYPES as readonly string[]).includes(input.type)
    ? (input.type as StudioOfficeZoneType) : null;
  const labelKo = cleanLabel(input.labelKo, 40);
  const labelEn = cleanLabel(input.labelEn, 60);
  const shape = cleanShape(input.shape);
  if (!id || !type || !labelKo || !labelEn || !shape) return null;
  const descriptionKo = input.descriptionKo === undefined ? undefined : cleanLabel(input.descriptionKo, 200) ?? undefined;
  const descriptionEn = input.descriptionEn === undefined ? undefined : cleanLabel(input.descriptionEn, 280) ?? undefined;
  const roomId = input.roomId === undefined ? undefined
    : typeof input.roomId === "string" && SAFE_ID.test(input.roomId.trim()) ? input.roomId.trim() : null;
  if (input.roomId !== undefined && roomId == null) return null;
  const rules = input.rules === undefined ? [] : Array.isArray(input.rules) ? input.rules : null;
  if (rules === null) return null;
  const cleanedRules: StudioOfficeZoneRule[] = [];
  for (const rule of rules) {
    const cleaned = cleanRule(rule);
    if (!cleaned) return null;
    cleanedRules.push(cleaned);
  }
  const ambientHintKo = input.ambientHintKo === undefined ? undefined : cleanLabel(input.ambientHintKo, 120) ?? undefined;
  const ambientHintEn = input.ambientHintEn === undefined ? undefined : cleanLabel(input.ambientHintEn, 160) ?? undefined;
  const workMode = input.workMode === undefined ? undefined : parsePlaceWorkMode(input.workMode) ?? null;
  if (workMode === null) return null;
  return Object.freeze({
    id, type, labelKo, labelEn,
    ...(descriptionKo ? { descriptionKo } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    shape,
    ...(roomId ? { roomId } : {}),
    rules: Object.freeze(cleanedRules),
    ...(ambientHintKo ? { ambientHintKo } : {}),
    ...(ambientHintEn ? { ambientHintEn } : {}),
    ...(input.suggestMuteOnEnter === true ? { suggestMuteOnEnter: true as const } : {}),
    ...(input.privateAudio === true ? { privateAudio: true as const } : {}),
    ...(workMode ? { workMode } : {}),
  });
}

/** 존의 바운딩 사각형. */
export function officeZoneBounds(zone: StudioOfficeZone): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  if (zone.shape.kind === "rect") {
    const { x, y, width, height } = zone.shape;
    return Object.freeze({ x, y, width, height });
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of zone.shape.points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

/** 존 면적 (zoneAtPoint의 구체성 판정용). 다각형은 바운딩 박스 면적을 쓴다. */
export function officeZoneArea(zone: StudioOfficeZone): number {
  const bounds = officeZoneBounds(zone);
  return Math.max(0, bounds.width * bounds.height);
}

function pointInPolygon(points: readonly StudioVirtualSpacePoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 점이 존 안에 있는지 판정 (경계 포함). */
export function studioOfficeZoneContains(zone: StudioOfficeZone, point: StudioVirtualSpacePoint): boolean {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (zone.shape.kind === "rect") {
    const { x, y, width, height } = zone.shape;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }
  return pointInPolygon(zone.shape.points, point.x, point.y);
}

/**
 * 점이 속한 오피스 존. 여러 존이 겹치면 면적이 가장 좁은(구체적인) 존을 반환한다.
 * 속한 존이 없으면 null.
 */
export function zoneAtPoint(
  zones: readonly StudioOfficeZone[],
  point: StudioVirtualSpacePoint,
): StudioOfficeZone | null {
  let best: StudioOfficeZone | null = null;
  let bestArea = Infinity;
  for (const zone of zones) {
    if (!studioOfficeZoneContains(zone, point)) continue;
    const area = officeZoneArea(zone);
    if (area < bestArea) {
      best = zone;
      bestArea = area;
    }
  }
  return best;
}

export type StudioOfficeZoneTransition = "enter" | "exit" | "switch" | "stay-inside" | "stay-outside";

/**
 * 존 전이 판정. 이전에 속한 존과 지금 속한 존을 비교한다.
 * - enter: 밖 → 안, exit: 안 → 밖, switch: 존 A → 존 B
 * - stay-inside / stay-outside: 변화 없음
 */
export function resolveOfficeZoneTransition(
  previous: StudioOfficeZone | null,
  current: StudioOfficeZone | null,
): StudioOfficeZoneTransition {
  if (previous === null && current === null) return "stay-outside";
  if (previous !== null && current !== null) return previous.id === current.id ? "stay-inside" : "switch";
  return previous === null ? "enter" : "exit";
}

/** 입장 안내 문구 (토스트·미니맵 aria-label 공용). */
export function officeZoneEntryCopy(
  zone: StudioOfficeZone,
  locale: "ko" | "en" = "ko",
): { readonly title: string; readonly rules: readonly string[]; readonly ambientHint: string | null } {
  const title = locale === "ko" ? zone.labelKo : zone.labelEn;
  const rules = zone.rules.map((rule) => (locale === "ko" ? rule.labelKo : rule.labelEn));
  const ambientHint = locale === "ko" ? zone.ambientHintKo ?? null : zone.ambientHintEn ?? null;
  return { title, rules: Object.freeze(rules), ambientHint };
}

/** 접근성용 존 설명 텍스트 (미니맵 aria-label 등). */
export function officeZoneAriaLabel(zone: StudioOfficeZone, locale: "ko" | "en" = "ko"): string {
  const meta = officeZoneTypeMeta(zone.type);
  const kindKo = meta.displayKind === "private" ? "비공개 구역"
    : meta.displayKind === "silent" ? "조용한 구역"
      : meta.displayKind === "spotlight" ? "주목 구역" : "공용 구역";
  const kindEn = meta.displayKind === "private" ? "private area"
    : meta.displayKind === "silent" ? "quiet area"
      : meta.displayKind === "spotlight" ? "spotlight area" : "public area";
  const label = locale === "ko" ? zone.labelKo : zone.labelEn;
  const kind = locale === "ko" ? kindKo : kindEn;
  const mute = zone.suggestMuteOnEnter
    ? (locale === "ko" ? " · 입장 시 음소거 권장" : " · muting recommended on entry")
    : "";
  return `${label} · ${kind}${mute}`;
}

/**
 * 오피스 존 구조 검증. manifest 검증에서 호출하며, 월드 경계·id·라벨·규칙을 검사한다.
 * bounds는 월드 크기 { width, height }.
 */
export function validateOfficeZones(
  zones: readonly StudioOfficeZone[],
  bounds: { readonly width: number; readonly height: number },
): readonly string[] {
  const errors: string[] = [];
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const ids = new Set<string>();
  for (const zone of zones) {
    if (!zone || typeof zone !== "object") { errors.push("office zone is invalid"); continue; }
    if (typeof zone.id !== "string" || !SAFE_ID.test(zone.id)) errors.push(`invalid office zone id: ${String(zone.id)}`);
    else if (ids.has(zone.id)) errors.push(`duplicate office zone id: ${zone.id}`);
    else ids.add(zone.id);
    if (!(STUDIO_OFFICE_ZONE_TYPES as readonly string[]).includes(zone.type)) errors.push(`unknown office zone type: ${zone.id}`);
    if (typeof zone.labelKo !== "string" || !zone.labelKo.trim() || zone.labelKo.length > 40
      || typeof zone.labelEn !== "string" || !zone.labelEn.trim() || zone.labelEn.length > 60) {
      errors.push(`office zone label is invalid: ${zone.id}`);
    }
    if (zone.workMode !== undefined && parsePlaceWorkMode(zone.workMode) === null) {
      errors.push(`office zone workMode is invalid: ${zone.id}`);
    }
    const shape = zone.shape;
    if (shape?.kind === "rect") {
      if (![shape.x, shape.y, shape.width, shape.height].every(finite) || shape.width <= 0 || shape.height <= 0
        || shape.x < 0 || shape.y < 0 || shape.x + shape.width > bounds.width || shape.y + shape.height > bounds.height) {
        errors.push(`office zone geometry is invalid: ${zone.id}`);
      }
    } else if (shape?.kind === "polygon") {
      const points = shape.points;
      if (!Array.isArray(points) || points.length < 3 || points.length > 128
        || points.some((point) => !point || !finite(point.x) || !finite(point.y)
          || point.x < 0 || point.y < 0 || point.x > bounds.width || point.y > bounds.height)) {
        errors.push(`office zone polygon is invalid: ${zone.id}`);
      }
    } else {
      errors.push(`office zone shape is invalid: ${zone.id}`);
    }
    if (!Array.isArray(zone.rules) || zone.rules.length > 8) errors.push(`office zone rules are invalid: ${zone.id}`);
    else {
      const ruleIds = new Set<string>();
      for (const rule of zone.rules) {
        if (!rule || typeof rule.id !== "string" || !SAFE_ID.test(rule.id) || ruleIds.has(rule.id)) {
          errors.push(`office zone rule id is invalid: ${zone.id}`); continue;
        }
        ruleIds.add(rule.id);
        if (rule.severity !== "info" && rule.severity !== "suggestion" && rule.severity !== "required") {
          errors.push(`office zone rule severity is invalid: ${zone.id}/${rule.id}`);
        }
        if (typeof rule.labelKo !== "string" || !rule.labelKo.trim() || typeof rule.labelEn !== "string" || !rule.labelEn.trim()) {
          errors.push(`office zone rule label is invalid: ${zone.id}/${rule.id}`);
        }
      }
    }
  }
  return Object.freeze(errors);
}

function zone(def: {
  readonly id: string; readonly type: StudioOfficeZoneType;
  readonly labelKo: string; readonly labelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly roomId: string;
  readonly rules: readonly (readonly [string, StudioOfficeZoneRuleSeverity, string, string])[];
  readonly ambientHintKo: string; readonly ambientHintEn: string;
  readonly suggestMuteOnEnter?: true; readonly privateAudio?: true;
  readonly workMode?: PlaceWorkMode;
}): StudioOfficeZone {
  return Object.freeze({
    id: def.id, type: def.type, labelKo: def.labelKo, labelEn: def.labelEn,
    descriptionKo: def.descriptionKo, descriptionEn: def.descriptionEn,
    shape: Object.freeze({ kind: "rect", x: def.x, y: def.y, width: def.width, height: def.height }),
    roomId: def.roomId,
    rules: Object.freeze(def.rules.map(([id, severity, labelKo, labelEn]) =>
      Object.freeze({ id, severity, labelKo, labelEn }))),
    ambientHintKo: def.ambientHintKo, ambientHintEn: def.ambientHintEn,
    ...(def.suggestMuteOnEnter ? { suggestMuteOnEnter: true as const } : {}),
    ...(def.privateAudio ? { privateAudio: true as const } : {}),
    ...(def.workMode ? { workMode: def.workMode } : {}),
  });
}

/**
 * 기본 캠퍼스(1280×960)의 오피스 존 10종. manifest.rooms 좌표와 같은 공간을 공유한다.
 * 서브 존(리셉션·카페·통화부스)은 부모 존 안에 겹쳐 두며, zoneAtPoint가 좁은 존을 우선한다.
 */
export const STUDIO_DEFAULT_OFFICE_ZONES: readonly StudioOfficeZone[] = Object.freeze([
  zone({
    id: "zone-lobby", type: "lobby", labelKo: "로비", labelEn: "Lobby",
    descriptionKo: "오늘 일정과 초대를 확인하고 캠퍼스로 입장하는 관문이에요.",
    descriptionEn: "Check today's agenda and invitations before entering the campus.",
    x: 640, y: 840, width: 280, height: 100, roomId: "lobby",
    rules: [
      ["welcome", "info", "입장하면 오늘의 일정판을 먼저 확인해 보세요.", "Check today's board when you arrive."],
      ["invite", "info", "초대받은 방은 미니맵에서 바로 이동할 수 있어요.", "Invited rooms are reachable from the minimap."],
    ],
    ambientHintKo: "은은한 로비 음악이 흘러요.", ambientHintEn: "Soft lobby music plays here.",
  }),
  zone({
    id: "zone-reception", type: "reception", labelKo: "리셉션", labelEn: "Reception",
    descriptionKo: "방문객을 맞이하고 안내를 받는 접대 공간이에요.",
    descriptionEn: "A welcoming desk for visitors and guidance.",
    x: 700, y: 880, width: 160, height: 60, roomId: "lobby",
    rules: [
      ["greet", "suggestion", "처음 온 손님에게는 말을 걸어 안내해 주세요.", "Greet first-time visitors and guide them."],
    ],
    ambientHintKo: "밝은 환영 멜로디가 흘러요.", ambientHintEn: "A bright welcoming melody plays here.",
  }),
  zone({
    id: "zone-meeting", type: "meeting-room", labelKo: "회의실", labelEn: "Meeting Room",
    descriptionKo: "문이 닫히면 외부 소리가 차단되는 비공개 회의 공간이에요.",
    descriptionEn: "A private meeting space sealed from outside sound when the door closes.",
    x: 950, y: 590, width: 290, height: 260, roomId: "meeting",
    rules: [
      ["private-audio", "required", "회의 내용은 밖으로 새지 않아요. 녹음 전 동의를 구하세요.", "Meeting audio stays inside. Ask for consent before recording."],
      ["mic-etiquette", "suggestion", "발언하지 않을 때는 마이크를 꺼 두는 게 좋아요.", "Keep your mic off when you are not speaking."],
    ],
    ambientHintKo: "조용한 회의실 공기, 문 닫힘 소리가 울려요.", ambientHintEn: "Quiet meeting-room air with a soft door echo.",
    privateAudio: true,
    workMode: "conference",
  }),
  zone({
    id: "zone-event-hall", type: "event-hall", labelKo: "이벤트홀", labelEn: "Event Hall",
    descriptionKo: "발표·상영·타운홀 미팅이 열리는 큰 열린 공간이에요.",
    descriptionEn: "A large open space for talks, screenings and town-hall meetings.",
    x: 640, y: 590, width: 280, height: 220, roomId: "live",
    rules: [
      ["stage", "info", "발표 중에는 무대 앞쪽 자리를 비워 두세요.", "Keep the front seats clear during talks."],
      ["applause", "suggestion", "발표가 끝나면 이모티콘으로 박수를 보내 보세요.", "Send applause emotes when a talk ends."],
    ],
    ambientHintKo: "웅성거리는 기대감이 감돌아요.", ambientHintEn: "A buzz of anticipation fills the air.",
    workMode: "stage",
  }),
  zone({
    id: "zone-lounge", type: "lounge", labelKo: "라운지", labelEn: "Lounge",
    descriptionKo: "가볍게 쉬어가며 팀원과 수다를 나누는 공용 휴게 공간이에요.",
    descriptionEn: "A common lounge to rest and chat lightly with teammates.",
    x: 370, y: 590, width: 240, height: 180, roomId: "lounge",
    rules: [
      ["casual", "info", "업무 이야기도, 수다도 자유롭게 나눠요.", "Work talk and small talk are both welcome."],
    ],
    ambientHintKo: "나긋한 재즈가 흘러요.", ambientHintEn: "Mellow jazz plays here.",
    workMode: "lounge",
  }),
  zone({
    id: "zone-cafe", type: "cafe", labelKo: "카페", labelEn: "Cafe",
    descriptionKo: "커피 한 잔과 함께 편하게 모이는 카페 코너예요.",
    descriptionEn: "A cozy cafe corner to gather over coffee.",
    x: 490, y: 590, width: 120, height: 180, roomId: "lounge",
    rules: [
      ["order", "suggestion", "커피 머신에서 음료를 골라 보세요.", "Pick a drink at the coffee machine."],
    ],
    ambientHintKo: "커피 향과 잔 부딪히는 소리.", ambientHintEn: "Coffee aroma and clinking cups.",
    workMode: "lounge",
  }),
  zone({
    id: "zone-focus", type: "focus-zone", labelKo: "집중존", labelEn: "Focus Zone",
    descriptionKo: "말소리를 자제하고 깊이 집중하는 조용한 공간이에요.",
    descriptionEn: "A quiet space for deep focus. Keep voices down.",
    x: 40, y: 40, width: 270, height: 210, roomId: "assets",
    rules: [
      ["mute", "suggestion", "입장하면 자동 음소거를 권장해요.", "Muting on entry is recommended."],
      ["chat-first", "suggestion", "대화는 채팅으로 먼저 시도해 보세요.", "Try chat first for conversations."],
      ["quiet", "required", "큰 소리·음악 재생은 삼가 주세요.", "Please avoid loud sounds and music."],
    ],
    ambientHintKo: "빗소리 같은 백색소음이 은은하게.", ambientHintEn: "Faint white noise, like soft rain.",
    suggestMuteOnEnter: true,
    workMode: "focus-desk",
  }),
  zone({
    id: "zone-phone-booth", type: "phone-booth", labelKo: "통화부스", labelEn: "Phone Booth",
    descriptionKo: "1인용 비공개 통화 공간이에요.",
    descriptionEn: "A private one-person booth for calls.",
    x: 50, y: 600, width: 80, height: 90, roomId: "teams",
    rules: [
      ["call-only", "required", "통화할 때만 이용해요. 통화가 끝나면 바로 나와 주세요.", "Calls only. Please step out when your call ends."],
      ["one-person", "required", "한 번에 한 사람만 들어갈 수 있어요.", "One person at a time."],
    ],
    ambientHintKo: "밖 소리가 차단된 고요함.", ambientHintEn: "Sealed quiet, cut off from outside.",
    privateAudio: true,
  }),
  zone({
    id: "zone-studio", type: "studio", labelKo: "스튜디오", labelEn: "Studio",
    descriptionKo: "녹화·라이브·제작이 이뤄지는 스튜디오예요.",
    descriptionEn: "A studio for recording, live sessions and production.",
    x: 340, y: 300, width: 290, height: 230, roomId: "drawing",
    rules: [
      ["on-air", "required", "빨간불이 켜지면(녹화·방송 중) 들어오지 마세요.", "Do not enter while the red light is on (recording/live)."],
      ["quiet-set", "suggestion", "장비에는 손대지 말고 자리에서 관람해요.", "Please do not touch the equipment."],
    ],
    ambientHintKo: "장비 팬 돌아가는 소리와 긴장감.", ambientHintEn: "Humming gear and a focused tension.",
    workMode: "stage",
  }),
  zone({
    id: "zone-library", type: "library", labelKo: "자료실", labelEn: "Library",
    descriptionKo: "레퍼런스와 기록을 조용히 열람하는 공간이에요.",
    descriptionEn: "A quiet space to browse references and records.",
    x: 40, y: 300, width: 270, height: 230, roomId: "writers",
    rules: [
      ["mute", "suggestion", "입장하면 자동 음소거를 권장해요.", "Muting on entry is recommended."],
      ["quiet-reading", "required", "열람 중 대화는 속삭이거나 채팅으로.", "Whisper or use chat while browsing."],
    ],
    ambientHintKo: "종이 넘기는 소리 같은 정적.", ambientHintEn: "A paper-quiet stillness.",
    suggestMuteOnEnter: true,
    workMode: "focus-desk",
  }),
]);

/** 기본 존에서 id로 찾기. */
export function officeZoneById(
  zones: readonly StudioOfficeZone[] = STUDIO_DEFAULT_OFFICE_ZONES,
  id: string,
): StudioOfficeZone | null {
  return zones.find((zone) => zone.id === id) ?? null;
}

/** 기본 존에서 종류로 찾기. */
export function officeZonesByType(
  zones: readonly StudioOfficeZone[] = STUDIO_DEFAULT_OFFICE_ZONES,
  type: StudioOfficeZoneType,
): readonly StudioOfficeZone[] {
  return Object.freeze(zones.filter((zone) => zone.type === type));
}

/** 음소거를 제안하는 존들 (집중존·자료실). */
export function officeMuteSuggestionZones(
  zones: readonly StudioOfficeZone[] = STUDIO_DEFAULT_OFFICE_ZONES,
): readonly StudioOfficeZone[] {
  return Object.freeze(zones.filter((zone) => zone.suggestMuteOnEnter));
}
