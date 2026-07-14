// Studio Brush Library — 이름 붙은 브러시 설정(펜 종류·크기·색상·손떨림 보정 등)을 저장·관리하고
// JSON으로 가져오기/내보내기 한다. ibisPaint의 브러시/머티리얼 라이브러리에 대응하는 기능.
//
// studio-palette-library.ts(색상 팔레트를 localStorage에 저장/불러오기)와 완전히 동일한 저장 패턴
// (localStorage 키 네이밍, MAX_* 개수 상한, 맨 앞에 추가하며 같은 id는 교체, rename은 순서 유지)을
// 그대로 재사용한다 — 이 모듈은 "팔레트 라이브러리의 브러시 버전"이다. 색상 팔레트는 GIMP .gpl이라는
// 기존 상호운용 포맷이 있어 그걸 썼지만, 브러시 설정(강도·필압 곡선 등)에는 그런 표준 포맷이 없으므로
// 내보내기/가져오기는 이 앱 전용 JSON 포맷(kind: "toonspectrum-studio-brush")을 쓴다.
//
// 저장소(localStorage 호환 인터페이스)를 주입받아 순수하게 동작한다(studio-palette-library.ts와 동일).

import { BRUSH_PRESETS, STABILIZER_MAX } from "./studio-brush";
import { normalizeHexColor } from "./studio-color-utils";
import {
  isStudioStabilizerMode,
  normalizeStudioStabilizerMode,
  type StudioStabilizerMode,
} from "./studio-stroke-stabilizer";

// ── 브러시 설정 스냅샷 ───────────────────────────────────────────────────
// StudioPage.tsx의 "그리기 도구 설정" 패널에서 drawMode === "pen"일 때 실제로 그리기에 쓰이는
// state를 그대로 미러링한 필드들. 정확한 대응은 docs/studio-brush-library-integration.md 참고.

export interface StudioBrushSnapshot {
  /** BRUSH_PRESETS[].id (studio-brush.ts). StudioPage의 `brush` state에 대응. */
  brushId: string;
  /** StudioPage의 `strokeWidth` state에 대응. UI 슬라이더 범위와 동일하게 1~48로 clamp. */
  strokeWidth: number;
  /** StudioPage의 `brushOpacity` state에 대응(0~1). UI 슬라이더 범위와 동일하게 0.1~1로 clamp. */
  brushOpacity: number;
  /** 정규화된 소문자 #rrggbb. StudioPage의 `color` state에 대응. */
  color: string;
  /** StudioPage의 `stabilizer` state에 대응(0~STABILIZER_MAX). */
  stabilizer: number;
  /** 라이브 입력 보정 알고리즘. 표준/속도 적응/정밀 추적. */
  stabilizerMode: StudioStabilizerMode;
  /** 펜을 놓은 뒤 적용하는 독립 후보정 강도(0~STABILIZER_MAX). */
  postCorrection: number;
  /** 후보정이 의도적인 각점을 둥글리지 않도록 보존할지 여부. */
  preserveCorners: boolean;
  /** StudioPage의 `pressureCurve` state에 대응. UI는 0.65(민감하게)/1.0(선형)/1.8(단단하게) 중 하나만
   *  설정하지만, 저장 데이터가 다른 값이어도 동작은 하므로 0.3~3 범위로만 clamp한다. */
  pressureCurve: number;
  /** StudioPage의 `useVelocityPressure` state에 대응. */
  useVelocityPressure: boolean;
  /** StudioPage의 `velocitySensitivity` state에 대응(0.1~1.0). */
  velocitySensitivity: number;
  /** 스타일러스 tiltX/tiltY/twist를 캘리그래피 펜촉에 반영할지 여부. */
  tiltEnabled: boolean;
  /** 틸트 입력이 없을 때 사용할 캘리그래피 펜촉 기본 각도(도). */
  tipAngle: number;
  /** 캘리그래피 펜촉의 단축/장축 비율(0.08=납작한 촉, 1=원형 촉). */
  tipRoundness: number;
}

export interface StudioSavedBrush extends StudioBrushSnapshot {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrushLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BRUSH_LIBRARY_KEY = "toonspectrum-studio-brush-library";
export const MAX_BRUSHES = 40; // studio-palette-library.ts의 MAX_PALETTES와 동일한 상한 정책을 따른다.
export const DEFAULT_BRUSH_NAME = "이름 없는 브러시";

export const BRUSH_STROKE_WIDTH_RANGE = [1, 48] as const;
export const BRUSH_OPACITY_RANGE = [0.1, 1] as const;
export const BRUSH_PRESSURE_CURVE_RANGE = [0.3, 3] as const;
export const BRUSH_VELOCITY_SENSITIVITY_RANGE = [0.1, 1] as const;
export const BRUSH_TIP_ANGLE_RANGE = [-180, 180] as const;
export const BRUSH_TIP_ROUNDNESS_RANGE = [0.08, 1] as const;

const DEFAULT_SNAPSHOT: StudioBrushSnapshot = {
  brushId: "pen",
  strokeWidth: 6,
  brushOpacity: 1,
  color: "#7c5cfc",
  stabilizer: 6,
  stabilizerMode: "adaptive",
  postCorrection: 4,
  preserveCorners: true,
  pressureCurve: 1.0,
  useVelocityPressure: true,
  velocitySensitivity: 0.65,
  tiltEnabled: true,
  tipAngle: -30,
  tipRoundness: 0.24,
};

function isKnownBrushId(id: unknown): id is string {
  return typeof id === "string" && BRUSH_PRESETS.some((p) => p.id === id);
}

function clampedNumberField(
  o: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback: number,
  adjusted: string[]
): number {
  const v = o[key];
  if (typeof v === "number" && Number.isFinite(v)) {
    const clamped = Math.min(max, Math.max(min, v));
    if (clamped !== v) adjusted.push(key);
    return clamped;
  }
  adjusted.push(key);
  return fallback;
}

/**
 * 신뢰할 수 없는 입력(가져오기 파일 등)을 유효한 StudioBrushSnapshot으로 정제한다.
 * 필드가 없거나 타입이 다르거나 범위를 벗어나면 기본값으로 대체/clamp하고 adjustedFields에 그
 * 필드 이름을 기록한다(어떤 값이 보정됐는지 호출부가 사용자에게 알릴 수 있게). 절대 던지지 않는다
 * — "파일 자체가 브러시 설정이 아님"의 판별은 importBrushFromJson의 kind 체크가 담당한다.
 */
export function sanitizeBrushSnapshot(raw: unknown): { snapshot: StudioBrushSnapshot; adjustedFields: string[] } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const adjustedFields: string[] = [];

  let brushId: string;
  if (isKnownBrushId(o.brushId)) {
    brushId = o.brushId;
  } else {
    adjustedFields.push("brushId");
    brushId = DEFAULT_SNAPSHOT.brushId;
  }
  const strokeWidth = clampedNumberField(
    o,
    "strokeWidth",
    BRUSH_STROKE_WIDTH_RANGE[0],
    BRUSH_STROKE_WIDTH_RANGE[1],
    DEFAULT_SNAPSHOT.strokeWidth,
    adjustedFields
  );
  const brushOpacity = clampedNumberField(
    o,
    "brushOpacity",
    BRUSH_OPACITY_RANGE[0],
    BRUSH_OPACITY_RANGE[1],
    DEFAULT_SNAPSHOT.brushOpacity,
    adjustedFields
  );
  const stabilizer = clampedNumberField(o, "stabilizer", 0, STABILIZER_MAX, DEFAULT_SNAPSHOT.stabilizer, adjustedFields);
  const postCorrection = clampedNumberField(
    o,
    "postCorrection",
    0,
    STABILIZER_MAX,
    DEFAULT_SNAPSHOT.postCorrection,
    adjustedFields
  );
  const stabilizerMode = isStudioStabilizerMode(o.stabilizerMode)
    ? o.stabilizerMode
    : normalizeStudioStabilizerMode(DEFAULT_SNAPSHOT.stabilizerMode);
  if (!isStudioStabilizerMode(o.stabilizerMode)) adjustedFields.push("stabilizerMode");
  const pressureCurve = clampedNumberField(
    o,
    "pressureCurve",
    BRUSH_PRESSURE_CURVE_RANGE[0],
    BRUSH_PRESSURE_CURVE_RANGE[1],
    DEFAULT_SNAPSHOT.pressureCurve,
    adjustedFields
  );
  const velocitySensitivity = clampedNumberField(
    o,
    "velocitySensitivity",
    BRUSH_VELOCITY_SENSITIVITY_RANGE[0],
    BRUSH_VELOCITY_SENSITIVITY_RANGE[1],
    DEFAULT_SNAPSHOT.velocitySensitivity,
    adjustedFields
  );
  const tipAngle = clampedNumberField(
    o,
    "tipAngle",
    BRUSH_TIP_ANGLE_RANGE[0],
    BRUSH_TIP_ANGLE_RANGE[1],
    DEFAULT_SNAPSHOT.tipAngle,
    adjustedFields
  );
  const tipRoundness = clampedNumberField(
    o,
    "tipRoundness",
    BRUSH_TIP_ROUNDNESS_RANGE[0],
    BRUSH_TIP_ROUNDNESS_RANGE[1],
    DEFAULT_SNAPSHOT.tipRoundness,
    adjustedFields
  );

  let useVelocityPressure: boolean;
  if (typeof o.useVelocityPressure === "boolean") {
    useVelocityPressure = o.useVelocityPressure;
  } else {
    adjustedFields.push("useVelocityPressure");
    useVelocityPressure = DEFAULT_SNAPSHOT.useVelocityPressure;
  }

  let preserveCorners: boolean;
  if (typeof o.preserveCorners === "boolean") {
    preserveCorners = o.preserveCorners;
  } else {
    adjustedFields.push("preserveCorners");
    preserveCorners = DEFAULT_SNAPSHOT.preserveCorners;
  }

  let tiltEnabled: boolean;
  if (typeof o.tiltEnabled === "boolean") {
    tiltEnabled = o.tiltEnabled;
  } else {
    adjustedFields.push("tiltEnabled");
    tiltEnabled = DEFAULT_SNAPSHOT.tiltEnabled;
  }

  const normalizedColor = typeof o.color === "string" ? normalizeHexColor(o.color) : null;
  let color: string;
  if (normalizedColor) {
    color = normalizedColor;
  } else {
    adjustedFields.push("color");
    color = DEFAULT_SNAPSHOT.color;
  }

  return {
    snapshot: {
      brushId,
      strokeWidth,
      brushOpacity,
      color,
      stabilizer,
      stabilizerMode,
      postCorrection,
      preserveCorners,
      pressureCurve,
      useVelocityPressure,
      velocitySensitivity,
      tiltEnabled,
      tipAngle,
      tipRoundness,
    },
    adjustedFields,
  };
}

function normalizeStoredBrush(v: unknown): StudioSavedBrush | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== "string"
    || typeof o.name !== "string"
    || typeof o.createdAt !== "number"
    || !Number.isFinite(o.createdAt)
    || typeof o.updatedAt !== "number"
    || !Number.isFinite(o.updatedAt)
  ) {
    return null;
  }
  const { snapshot } = sanitizeBrushSnapshot(o);
  return {
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    ...snapshot,
  };
}

// ── 저장소 CRUD (studio-palette-library.ts와 동일한 패턴) ──────────────

/** 저장된 브러시 목록(최근 저장·가져오기 순). 저장소 부재·파싱 실패 시 []. */
export function listBrushes(storage: BrushLibraryStorage | null | undefined): StudioSavedBrush[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(BRUSH_LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const brush = normalizeStoredBrush(value);
      return brush ? [brush] : [];
    });
  } catch {
    return [];
  }
}

function persist(storage: BrushLibraryStorage | null | undefined, brushes: StudioSavedBrush[]): void {
  if (!storage) return;
  try {
    storage.setItem(BRUSH_LIBRARY_KEY, JSON.stringify(brushes));
  } catch {
    // 저장 실패(쿼터 초과·시크릿 모드 등) — 무시. 팔레트 라이브러리와 동일한 정책.
  }
}

/** 저장(같은 id면 교체하며 맨 앞으로, 새 항목도 맨 앞). 새 목록 반환. */
export function saveBrush(storage: BrushLibraryStorage | null | undefined, brush: StudioSavedBrush): StudioSavedBrush[] {
  const next = [brush, ...listBrushes(storage).filter((b) => b.id !== brush.id)].slice(0, MAX_BRUSHES);
  persist(storage, next);
  return next;
}

/** 이름 변경(목록 순서는 유지 — 저장과 달리 맨 앞으로 옮기지 않는다). 빈 이름은 무시(원본 목록 그대로 반환). */
export function renameBrush(storage: BrushLibraryStorage | null | undefined, id: string, name: string): StudioSavedBrush[] {
  const trimmed = name.trim();
  const current = listBrushes(storage);
  if (!trimmed) return current;
  const next = current.map((b) => (b.id === id ? { ...b, name: trimmed, updatedAt: Date.now() } : b));
  persist(storage, next);
  return next;
}

/** 삭제. 새 목록 반환. */
export function deleteBrush(storage: BrushLibraryStorage | null | undefined, id: string): StudioSavedBrush[] {
  const next = listBrushes(storage).filter((b) => b.id !== id);
  persist(storage, next);
  return next;
}

/** 현재 라이브 브러시 설정(snapshot)에 이름을 붙여 저장 대상 레코드로 만든다. 절대 던지지 않는다
 *  (모든 필드를 방어적으로 clamp/정규화 — 호출부가 항상 유효한 값을 넘기더라도 이중 안전장치). */
export function createBrush(name: string, snapshot: StudioBrushSnapshot): StudioSavedBrush {
  const { snapshot: safe } = sanitizeBrushSnapshot(snapshot);
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || DEFAULT_BRUSH_NAME,
    createdAt: now,
    updatedAt: now,
    ...safe,
  };
}

// ── JSON 내보내기/가져오기(이 앱 전용 포맷 — 브러시 설정엔 GPL 같은 표준이 없다) ──────

export const BRUSH_EXPORT_KIND = "toonspectrum-studio-brush";
export const BRUSH_EXPORT_VERSION = 3;

/** StudioSavedBrush → JSON 텍스트(들여쓰기 2칸, 사람이 읽을 수 있게). */
export function writeBrushJson(brush: StudioSavedBrush): string {
  const payload = {
    kind: BRUSH_EXPORT_KIND,
    version: BRUSH_EXPORT_VERSION,
    name: brush.name,
    brushId: brush.brushId,
    strokeWidth: brush.strokeWidth,
    brushOpacity: brush.brushOpacity,
    color: brush.color,
    stabilizer: brush.stabilizer,
    stabilizerMode: brush.stabilizerMode,
    postCorrection: brush.postCorrection,
    preserveCorners: brush.preserveCorners,
    pressureCurve: brush.pressureCurve,
    useVelocityPressure: brush.useVelocityPressure,
    velocitySensitivity: brush.velocitySensitivity,
    tiltEnabled: brush.tiltEnabled,
    tipAngle: brush.tipAngle,
    tipRoundness: brush.tipRoundness,
  };
  return JSON.stringify(payload, null, 2);
}

const FILENAME_ILLEGAL_CHARS = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);

/** 내보내기 파일명 — 이름의 파일시스템 금지 문자·제어 문자만 제거, 한글은 그대로 유지(paletteFileName과
 *  동일 규칙이되, 정규식 제어문자 범위 리터럴을 피하려고 코드포인트 필터로 구현). */
export function brushFileName(brush: { name: string }): string {
  const safe = Array.from(brush.name.trim())
    .filter((ch) => (ch.codePointAt(0) ?? 0) > 0x1f && !FILENAME_ILLEGAL_CHARS.has(ch))
    .join("")
    .trim();
  return `${safe || "brush"}.json`;
}

/**
 * writeBrushJson이 만든(또는 호환되는) JSON 텍스트 → StudioSavedBrush.
 * kind가 "toonspectrum-studio-brush"가 아니면 던진다(parseGplPalette의 매직 헤더 체크와 동일 역할).
 * 그 외 필드 누락·범위 이탈은 sanitizeBrushSnapshot이 조용히 기본값으로 보정하고 adjustedFields로 알린다.
 */
export function importBrushFromJson(
  text: string,
  fallbackName?: string
): { brush: StudioSavedBrush; adjustedFields: string[] } {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("빈 파일이에요. 브러시 설정(.json) 파일을 선택해주세요.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("브러시 설정 파일을 읽지 못했어요.");
  }
  if (!parsed || typeof parsed !== "object" || (parsed as Record<string, unknown>).kind !== BRUSH_EXPORT_KIND) {
    throw new Error("브러시 설정(.json) 파일이 아니에요.");
  }
  const obj = parsed as Record<string, unknown>;
  const { snapshot, adjustedFields } = sanitizeBrushSnapshot(obj);
  const rawName = typeof obj.name === "string" ? obj.name.trim() : "";
  const now = Date.now();
  return {
    brush: {
      id: crypto.randomUUID(),
      name: rawName || fallbackName?.trim() || DEFAULT_BRUSH_NAME,
      createdAt: now,
      updatedAt: now,
      ...snapshot,
    },
    adjustedFields,
  };
}
