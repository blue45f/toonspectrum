/**
 * Studio Paper Granulation Runtime — 종이 결을 **브러시 dab 알파**에 거는 런타임 접합부.
 *
 * `studio-paper-texture`가 만든 seamless 높이맵과 `createPaperGranulationGain`의 정착 이득을
 * 래스터 필터(잉크워시)가 아니라 **획을 그리는 순간의 dab 합성 경로**에서 쓸 수 있게 한다.
 * 필터 경로와 커널이 동일하므로 "필터로 본 종이"와 "붓으로 그은 종이"가 같은 물리를 쓴다.
 *
 * 설계 규칙 세 가지.
 *
 * 1. **문서 좌표 고정** — 이득은 dab 인덱스가 아니라 문서 좌표 (x, y)에서만 읽는다. 종이는
 *    캔버스에 붙어 있지 붓에 붙어 있지 않으므로, 같은 자리에 다시 그으면 같은 결이 나오고
 *    획을 옮기면 결이 따라오지 않는다. (`stroke-fixed`처럼 획을 따라다니는 결이 필요한
 *    브러시는 기존 `studio-brush-material-dynamics`의 절차적 grain을 계속 쓴다.)
 * 2. **상수 비용** — dab마다 노이즈를 재계산하지 않는다. 타일(기본 128px seamless)과 그
 *    이득 배열을 (종이·시드·강도·염색성)당 한 번 만들어 FIFO 캐시에 담고, 샘플마다
 *    바이리니어 4-탭 조회만 한다. 잉크워시의 `paperTileCache`와 같은 패턴이다.
 * 3. **곱해지는 변조** — 반환값은 알파에 곱하는 배수다. 이득의 타일 평균이 0이라
 *    (`createPaperGranulationGain`의 정규화) 균일한 획의 평균 알파는 보존되고 공간 분포만
 *    종이 골 쪽으로 재배치된다. 획의 형태·굵기·필압 응답을 만드는 기하는 건드리지 않는다.
 */

import {
  DEFAULT_PAPER_GRAIN_KIND,
  PAPER_REFERENCE_TILE,
  createPaperGranulationGain,
  createPaperHeightField,
  normalizePaperGrainKind,
  type PaperGrainKind,
  type PaperHeightField,
} from "./studio-paper-texture";

/** 문서 px ↔ 종이 텍셀 배율의 허용 범위. 1이면 종이 1텍셀 = 문서 1px. */
export const STUDIO_PAPER_GRANULATION_LIMITS = {
  granulation: { min: 0, max: 1 },
  staining: { min: 0, max: 1 },
  scale: { min: 0.25, max: 16 },
} as const;

/**
 * 브러시 한 자루가 종이와 상호작용하는 방식.
 *
 * `granulation`과 `staining`은 `studio-paper-texture`의 `PigmentSettleOptions`와 같은 축이다 —
 * 실물 물감도 granulating(울트라마린·목탄 가루)과 staining(프탈로·기술펜 잉크)이 확연히 다르고,
 * 커널이 이미 `effective = granulation * (1 - staining)`으로 두 축을 합성한다.
 */
export interface StudioPaperGranulationSettings {
  /** 골에 가라앉는 경향. 0이면 이 브러시는 종이 결을 전혀 타지 않는다(정확한 항등). */
  readonly granulation: number;
  /** 섬유에 즉시 물들어 재분포가 억제되는 정도. 1이면 granulation 값과 무관하게 항등이다. */
  readonly staining: number;
  /** 종이 텍셀 하나가 차지하는 문서 px. 크면 결이 굵어진다. */
  readonly scale: number;
}

/** 종이 결을 전혀 타지 않는 브러시(잉크·기술펜)의 값. */
export const STUDIO_PAPER_GRANULATION_IDENTITY: StudioPaperGranulationSettings = Object.freeze({
  granulation: 0,
  staining: 0,
  scale: 1,
});

/** 문서(캔버스) 단위 종이 설정 — 어떤 종이를 깔았는가. 브러시가 아니라 문서가 소유한다. */
export interface StudioPaperSurfaceSettings {
  readonly kind: PaperGrainKind;
  /** 종이 결의 절차적 위상. 같은 시드 = 같은 종이 낱장. */
  readonly seed: number;
}

/**
 * 문서 기본 종이.
 *
 * 실물 수채 표준이 중목(cold-press)이라 `studio-paper-texture`의 기본과 같은 종이를 쓰고,
 * 시드는 잉크워시 프리셋 기본(41)과 맞춰 두 경로가 같은 낱장을 본다.
 */
export const DEFAULT_STUDIO_PAPER_SURFACE: StudioPaperSurfaceSettings = Object.freeze({
  kind: DEFAULT_PAPER_GRAIN_KIND,
  seed: 41,
});

/**
 * 문서가 깔아 둔 종이 — 프로세스 전역 1장.
 *
 * 종이는 캔버스 속성이지 획 속성이 아니라서 브러시 스냅샷에도, 획 요소에도 들어가지 않는다.
 * React prop으로 내려보내지 않는 이유는 R8 페이퍼 에셋 레지스트리
 * (`studio-brush-r8-grain-runtime`의 `resolveStudioBrushR8GrainSampler`)와 같다 —
 * 렌더러가 필요한 지점에서 직접 조회하면 `StudioDrawNode`의 memo 경계를 건드리지 않는다.
 */
let documentPaperSurface: StudioPaperSurfaceSettings = DEFAULT_STUDIO_PAPER_SURFACE;

/** 문서 종이를 바꾼다(캔버스 단위 설정). 정규화된 값을 그대로 돌려준다. */
export function setStudioDocumentPaperSurface(value?: unknown): StudioPaperSurfaceSettings {
  documentPaperSurface = normalizeStudioPaperSurfaceSettings(value);
  return documentPaperSurface;
}

/** 현재 문서 종이. 설정한 적이 없으면 중목(cold-press) 기본 낱장이다. */
export function resolveStudioDocumentPaperSurface(): StudioPaperSurfaceSettings {
  return documentPaperSurface;
}

export function resetStudioDocumentPaperSurface(): void {
  documentPaperSurface = DEFAULT_STUDIO_PAPER_SURFACE;
}

const MAX_UINT32 = 0xffff_ffff;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeStudioPaperGranulationSettings(
  value?: unknown
): StudioPaperGranulationSettings {
  const source = asRecord(value);
  if (!source) return STUDIO_PAPER_GRANULATION_IDENTITY;
  return {
    granulation: clamp(
      finiteNumber(source.granulation, 0),
      STUDIO_PAPER_GRANULATION_LIMITS.granulation.min,
      STUDIO_PAPER_GRANULATION_LIMITS.granulation.max
    ),
    staining: clamp(
      finiteNumber(source.staining, 0),
      STUDIO_PAPER_GRANULATION_LIMITS.staining.min,
      STUDIO_PAPER_GRANULATION_LIMITS.staining.max
    ),
    scale: clamp(
      finiteNumber(source.scale, STUDIO_PAPER_GRANULATION_IDENTITY.scale),
      STUDIO_PAPER_GRANULATION_LIMITS.scale.min,
      STUDIO_PAPER_GRANULATION_LIMITS.scale.max
    ),
  };
}

export function normalizeStudioPaperSurfaceSettings(value?: unknown): StudioPaperSurfaceSettings {
  const source = asRecord(value);
  if (!source) return DEFAULT_STUDIO_PAPER_SURFACE;
  return {
    kind: normalizePaperGrainKind(source.kind),
    seed: Math.trunc(clamp(finiteNumber(source.seed, DEFAULT_STUDIO_PAPER_SURFACE.seed), 0, MAX_UINT32)),
  };
}

/** 유효 정착 강도. 커널의 `effectiveGranulation`과 같은 식이라 이득이 0인 경우를 미리 잘라낸다. */
export function studioPaperGranulationEffectiveStrength(
  settings: StudioPaperGranulationSettings
): number {
  return settings.granulation * (1 - settings.staining);
}

export function studioPaperGranulationIsActive(settings: StudioPaperGranulationSettings): boolean {
  return studioPaperGranulationEffectiveStrength(settings) > 0;
}

/**
 * 캐시된 종이 타일 + 정착 이득.
 *
 * `gain`은 타일 평균 0으로 정규화된 값이라 `alpha * (1 + gain)`이 균일 획의 총 안료량을
 * 보존한다. 높이맵도 함께 들고 있어 "결과가 정말 골에 몰렸는지"를 상관계수로 검증할 수 있다.
 */
export interface StudioPaperGranulationTile {
  readonly key: string;
  readonly size: number;
  readonly field: PaperHeightField;
  readonly gain: Float32Array;
  readonly settings: StudioPaperGranulationSettings;
  readonly surface: StudioPaperSurfaceSettings;
}

/**
 * 캐시 키 양자화 폭. 슬라이더가 연속값이라 양자화하지 않으면 한 획 안에서도 키가 바뀌어
 * 타일을 계속 다시 만든다. 1/64는 알파 8비트(1/255)보다 거친 변화가 눈에 안 보이는 폭이다.
 */
const GRANULATION_QUANTIZATION = 64;
/** 프리셋 수 × 종이 3종 × 시드 몇 개를 한 번에 담고도 남는 크기. 타일 하나는 128²×2 float. */
const TILE_CACHE_LIMIT = 24;

const tileCache = new Map<string, StudioPaperGranulationTile>();

function quantize(value: number): number {
  return Math.round(value * GRANULATION_QUANTIZATION) / GRANULATION_QUANTIZATION;
}

function tileCacheKey(
  surface: StudioPaperSurfaceSettings,
  settings: StudioPaperGranulationSettings
): string {
  return [
    surface.kind,
    surface.seed,
    quantize(settings.granulation),
    quantize(settings.staining),
  ].join(":");
}

/**
 * (종이, 강도) 조합당 한 번만 만드는 타일. 두 번째 호출부터는 순수 조회다.
 *
 * `scale`은 키에 들어가지 않는다 — 배율은 좌표를 나누는 상수일 뿐 타일 내용을 바꾸지 않으므로,
 * 같은 종이를 다른 배율로 쓰는 브러시들이 타일 하나를 공유한다.
 */
export function acquireStudioPaperGranulationTile(
  surface: StudioPaperSurfaceSettings,
  settings: StudioPaperGranulationSettings
): StudioPaperGranulationTile | null {
  if (!studioPaperGranulationIsActive(settings)) return null;
  const key = tileCacheKey(surface, settings);
  const cached = tileCache.get(key);
  if (cached) {
    // 삽입 순서가 FIFO 큐다. 조회는 순서를 바꾸지 않는다(잉크워시 타일 캐시와 동일 규약).
    return cached;
  }
  const field = createPaperHeightField({
    kind: surface.kind,
    width: PAPER_REFERENCE_TILE,
    height: PAPER_REFERENCE_TILE,
    seed: surface.seed,
  });
  const gain = createPaperGranulationGain(field, {
    strength: quantize(settings.granulation),
    staining: quantize(settings.staining),
  });
  const tile: StudioPaperGranulationTile = {
    key,
    size: PAPER_REFERENCE_TILE,
    field,
    gain,
    settings,
    surface,
  };
  if (tileCache.size >= TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next();
    if (!oldest.done) tileCache.delete(oldest.value);
  }
  tileCache.set(key, tile);
  return tile;
}

export function clearStudioPaperGranulationTileCache(): void {
  tileCache.clear();
}

export function studioPaperGranulationTileCacheStats(): Readonly<{ size: number; limit: number }> {
  return { size: tileCache.size, limit: TILE_CACHE_LIMIT };
}

function wrapIndex(value: number, period: number): number {
  const mod = value % period;
  return mod < 0 ? mod + period : mod;
}

/**
 * 주기 경계를 넘어가는 바이리니어 조회. 최근접 조회를 쓰면 타일 텍셀 격자가 그대로
 * 고주파 계단으로 찍혀 종이 결이 아니라 픽셀 노이즈가 되므로, 4-탭 보간이 기본이다.
 */
function bilinearWrapped(values: Float32Array, size: number, u: number, v: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const tx = u - x0;
  const ty = v - y0;
  const xa = wrapIndex(x0, size);
  const xb = wrapIndex(x0 + 1, size);
  const ya = wrapIndex(y0, size);
  const yb = wrapIndex(y0 + 1, size);
  const rowA = ya * size;
  const rowB = yb * size;
  const n00 = values[rowA + xa]!;
  const n10 = values[rowA + xb]!;
  const n01 = values[rowB + xa]!;
  const n11 = values[rowB + xb]!;
  const top = n00 + (n10 - n00) * tx;
  const bottom = n01 + (n11 - n01) * tx;
  return top + (bottom - top) * ty;
}

/** 문서 좌표에서 읽은 정착 이득(타일 평균 0). 알파에는 `1 + gain`을 곱한다. */
export function sampleStudioPaperGranulationGainAt(
  tile: StudioPaperGranulationTile,
  x: number,
  y: number,
  scale: number
): number {
  const safeScale = clamp(
    finiteNumber(scale, 1),
    STUDIO_PAPER_GRANULATION_LIMITS.scale.min,
    STUDIO_PAPER_GRANULATION_LIMITS.scale.max
  );
  return bilinearWrapped(
    tile.gain,
    tile.size,
    finiteNumber(x, 0) / safeScale,
    finiteNumber(y, 0) / safeScale
  );
}

/** 같은 좌표의 종이 높이(0..1). 이득이 정말 *골*에 몰렸는지 상관으로 검증할 때 쓴다. */
export function sampleStudioPaperHeightAt(
  tile: StudioPaperGranulationTile,
  x: number,
  y: number,
  scale: number
): number {
  const safeScale = clamp(
    finiteNumber(scale, 1),
    STUDIO_PAPER_GRANULATION_LIMITS.scale.min,
    STUDIO_PAPER_GRANULATION_LIMITS.scale.max
  );
  return bilinearWrapped(
    tile.field.values,
    tile.size,
    finiteNumber(x, 0) / safeScale,
    finiteNumber(y, 0) / safeScale
  );
}

/**
 * 상한 배수. `1 + gain`은 아래로는 0에서 자연히 멈추지만(이득 ≥ -effective ≥ -1) 위로는
 * 종이 골이 극단적으로 깊을 때 커질 수 있다. 실측(강도 1·황목)에서도 최대 배수가 2를 넘지
 * 않아 이 상한은 병리적 입력 가드일 뿐 정상 구간에서는 절대 걸리지 않는다 —
 * 걸리면 평균 보존이 깨지므로 게이트가 잡는다.
 */
export const STUDIO_PAPER_GRANULATION_MAX_MULTIPLIER = 2;

/**
 * 문서 좌표 (x, y)에서 알파에 곱할 배수. 타일이 없으면(비활성 브러시) 정확히 1이다.
 *
 * 렌더러 핫패스용 무할당 시그니처. 호출 측이 스트로크 시작 시 타일을 한 번 잡고
 * 샘플마다 이 함수만 부른다.
 */
export function resolveStudioPaperGranulationAlphaMultiplierAt(
  tile: StudioPaperGranulationTile | null,
  x: number,
  y: number,
  scale: number
): number {
  if (!tile) return 1;
  const gain = sampleStudioPaperGranulationGainAt(tile, x, y, scale);
  const multiplier = 1 + gain;
  if (!(multiplier > 0)) return 0;
  return multiplier > STUDIO_PAPER_GRANULATION_MAX_MULTIPLIER
    ? STUDIO_PAPER_GRANULATION_MAX_MULTIPLIER
    : multiplier;
}
