/**
 * Studio Liquify — Procreate "Push" 브러시(왜곡) 대응 순수 코어.
 *
 * 개념: 사용자가 브러시로 이미지 위를 드래그하면 그 궤적을 따라 픽셀이 밀리듯 국소적으로
 * 왜곡된다. heal-clone/smudge와 동일하게 **비파괴가 아니다** — 스트로크가 끝나면 실제 픽셀을
 * 재배치해 el.src 자체를 결과 PNG로 교체한다(히스토리 1건, ⌘Z로 원복).
 *
 * 알고리즘(스코프 — Push 모드만, §design 문서 §5 참고. Twirl/Pinch/Bloat 등은 후속 확장):
 *   순수 forward mapping(원본 픽셀을 이동벡터만큼 옮겨 목적지에 쓰기)은 목적지에 구멍(빈 픽셀)이
 *   생긴다. 대신:
 *   1) 스트로크가 누적한 "변위 필드"(각 캔버스 좌표에서 얼마나/어느 방향으로 밀렸는지, dx/dy)를
 *      만든다(buildLiquifyDisplacementField) — 스트로크의 각 세그먼트(리샘플된 이전 점→현재 점)
 *      방향 벡터×강도를, 그 점 중심 반경 내 좌표들에 코사인(Hann) falloff 가중치로 누적한다.
 *      여러 세그먼트가 겹치면 단순 합산(완벽한 유체 시뮬레이션이 아니다 — 겹쳐 문지르면 더 밀린다,
 *      이는 의도된 동작이다).
 *   2) 최종 렌더링은 backward mapping(applyLiquifyDisplacement): 출력 이미지의 각 픽셀 (x,y)에
 *      대해 그 위치의 누적 변위를 역으로 빼서 원본 좌표 (x-dx, y-dy)를 구하고, bilinear 보간
 *      (sampleBilinearClamped)으로 색을 샘플링한다. 구멍 없이 매끈한 결과가 나온다.
 *   변위 필드는 스트로크 궤적의 바운딩박스(±반경)로 한정된 국소 그리드에만 저장한다(전체 캔버스
 *   크기의 dx/dy 배열을 만들지 않는다) — 그 바깥은 변위가 항상 0이므로 결과가 원본과 동일하고,
 *   저장·순회 비용도 스트로크가 실제로 닿은 영역에 비례한다.
 *
 * 3계층 구성은 studio-heal-clone.ts와 동일한 관례를 따른다:
 *   (A) 기하 — 리샘플(균등 간격 재추출), falloff.
 *   (B) 픽셀 알고리즘 — StudioImageDataLike 입출력만 다루는 순수 함수(캔버스 무관, 유닛 테스트 가능).
 *   (C) 캔버스 팩토리 orchestration(bakeLiquifyStrokeToCanvas, Worker 오프로드 포함) —
 *       studio-liquify-browser.ts에 있다(순환 참조 회피, 위 파일 docstring 참고).
 *
 * 좌표 규약: heal-clone(HealCloneDab)/smudge(SmudgePixelPoint)의 선례를 따라 이 모듈도 독립적인
 * "자연 픽셀 좌표" 포인트 타입(LiquifyPixelPoint)을 정의한다(다른 브러시 도구의 타입을 재사용하지
 * 않는다 — 서로 다른 브러시 도구가 우연히 구조가 같다고 묶으면 한쪽만 바뀔 미래 변경에 취약해진다,
 * studio-layer-mask.ts의 동일한 선례 참고). 화면 반전(flipX/flipY)은 이미 되돌려진 상태로 이 모듈에
 * 들어와야 한다 — 호출부(StudioPage)가 flipNormalizedPoint로 되돌린 뒤 자연 해상도로 스케일해서 넘긴다.
 */
import type { StudioImageDataLike } from "./studio-filters";

// ---------------------------------------------------------------------------
// 타입 · 상수
// ---------------------------------------------------------------------------

/** 픽셀 공간(원본 자연 해상도) 좌표 — SelPoint(정규화 0..1)와는 다른 개념(heal-clone/smudge와 동일 규약). */
export type LiquifyPixelPoint = { x: number; y: number };

export const LIQUIFY_RADIUS_RANGE = { min: 20, max: 240, step: 5 } as const; // 캔버스 표시 px
export const LIQUIFY_RADIUS_DEFAULT = 80;
export const LIQUIFY_STRENGTH_RANGE = { min: 10, max: 100, step: 5 } as const; // %(UI); 코어엔 /100 한 0..1로 넘긴다
export const LIQUIFY_STRENGTH_DEFAULT = 50;

// 리샘플 간격 = radiusPx * 이 비율(studio-smudge.ts의 SMUDGE_STEP_RATIO와 동일한 정신 — 촘촘할수록
// 부드럽지만 세그먼트 수가 늘어 느려진다). 병적으로 길거나 루프 도는 스트로크 방어 상한도 동일.
const LIQUIFY_STEP_RATIO = 0.35;
const LIQUIFY_MAX_RESAMPLED_POINTS = 2000;

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampFloat(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

// ---------------------------------------------------------------------------
// (A) 기하 — 리샘플 · falloff
// ---------------------------------------------------------------------------

/**
 * 폴리라인을 일정 간격(step, px)으로 리샘플 — studio-smudge.ts의 resampleSmudgePath와 동일 기법
 * (독립 구현 — 위 모듈 docstring 참고). 0/1점 입력은 그대로 반환. 순수, 결정적. 길이 0인(정지된 두
 * 점 사이) 구간은 건너뛴다. 결과는 LIQUIFY_MAX_RESAMPLED_POINTS 개로 상한.
 *
 * 비유한(NaN/Infinity) 좌표를 가진 점은 입력 단계에서 걸러낸다(방어적 — 정상 입력에선 발생하지
 * 않는다) — 그런 점을 그대로 흘려보내면 세그먼트 길이/누적 이월(carried)이 NaN으로 오염되고,
 * 그 NaN이 buildLiquifyDisplacementField 의 가중치 누적 루프로 전파돼(clampInt/clampFloat 가
 * NaN 입력에 자신의 min 인자로 폴백하는 특성과 맞물려) 변위 필드의 한 행/열 전체가 NaN이 되고,
 * 결국 렌더링 시 그 줄 전체가 원본의 (0,0) 픽셀 색으로 잘못 칠해지는 실제 픽셀 손상으로 이어진다
 * (단순 크래시가 아니라 조용한 이미지 오염이라 더 위험하다). 걸러낸 뒤에도 점이 2개 미만이면
 * 그대로 반환(빈 배열 포함) — 호출부(buildLiquifyDisplacementField)의 길이<2 가드가 이어받는다.
 */
export function resampleLiquifyPath(points: readonly LiquifyPixelPoint[], step: number): LiquifyPixelPoint[] {
  const finitePoints =
    points.length < 2 || points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      ? points
      : points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finitePoints.length < 2) return finitePoints.slice();
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;

  const out: LiquifyPixelPoint[] = [finitePoints[0]!];
  let prev = finitePoints[0]!;
  let carried = 0;

  for (let i = 1; i < finitePoints.length; i++) {
    const curr = finitePoints[i]!;
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (segLen === 0) continue; // 정지 구간 — 중복점 방지를 위해 건너뛴다(prev 유지).

    let traveled = safeStep - carried;
    while (traveled <= segLen) {
      const t = traveled / segLen;
      out.push({ x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t });
      if (out.length >= LIQUIFY_MAX_RESAMPLED_POINTS) return out;
      traveled += safeStep;
    }
    carried = segLen - (traveled - safeStep);
    prev = curr;
  }

  const last = out[out.length - 1]!;
  const finalPt = finitePoints[finitePoints.length - 1]!;
  if ((last.x !== finalPt.x || last.y !== finalPt.y) && out.length < LIQUIFY_MAX_RESAMPLED_POINTS) {
    out.push(finalPt);
  }
  return out;
}

/**
 * 브러시 중심에서 (dx,dy) 만큼 떨어진 지점의 변위 가중치(0..1) — 코사인(Hann window) falloff.
 * t=dist/radius 일 때 0.5*(1+cos(π·t)): 중심(t=0)에서 1, 가장자리(t=1)에서 0으로 매끈하게 줄어들고
 * 양쪽 끝 모두 미분이 0이라(피크·경계 둘 다 완만) smudgeBrushWeight의 t² 근사보다 경계가 더 부드럽다
 * — "가우시안/코사인 falloff" 요구사항을 코사인 쪽으로 구현한 것(가우시안은 이론상 반경 밖에서도
 * 완전히 0이 되지 않아 필드 바운딩박스 경계에서 미세한 불연속이 남을 수 있어 제외했다). radiusPx
 * 이상이면 0. 순수.
 */
export function liquifyBrushWeight(dx: number, dy: number, radiusPx: number): number {
  const r = Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : 0;
  if (r <= 0) return 0;
  const dist = Math.hypot(dx, dy);
  if (dist >= r) return 0;
  const t = dist / r;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

// ---------------------------------------------------------------------------
// (B) 픽셀 알고리즘 — 변위 필드 누적 + backward mapping 렌더
// ---------------------------------------------------------------------------

/**
 * 스트로크가 누적한 변위 필드 — 캔버스 전체가 아니라 스트로크 바운딩박스(±반경)로 한정된 국소
 * 그리드다. (originX,originY)가 필드 로컬 (0,0)에 대응하는 캔버스 좌표. dx/dy[y*width+x] = 그
 * 캔버스 좌표(originX+x, originY+y)에서 누적된 변위(px, 방향 포함). 필드 밖은 항상 변위 0.
 */
export type LiquifyDisplacementField = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  dx: Float32Array;
  dy: Float32Array;
};

/**
 * 스트로크 궤적 → 변위 필드. points.length<2(방향을 정할 수 없음) 또는 radiusPx<=0 또는
 * strength<=0 또는 캔버스 크기가 비정상이면 null(구울 게 없음 신호).
 *
 * @param strength 0..1 (호출부가 %/100로 변환해서 넘긴다, smudge 관례와 동일).
 * @param canvasW/canvasH 원본(자연) 픽셀 크기 — 필드 바운딩박스를 이 안으로 클램프한다.
 *
 * 알고리즘: resampleLiquifyPath로 균등 간격 점을 얻은 뒤, 연속한 두 점(prev→curr)마다:
 *   세그먼트 방향 벡터 (curr-prev)×strength 를, curr 중심 반경 radiusPx 원 내부의 각 필드 셀에
 *   liquifyBrushWeight 가중치로 더한다(단순 합산 — 여러 세그먼트가 겹치면 그만큼 더 밀린다).
 * 필드 바운딩박스는 리샘플된 모든 점의 최소/최대 좌표에 ⌈radiusPx⌉를 더 확장한 사각형이다 —
 * 이 경계에서는 어느 점에서 봐도 dist>=radius라 가중치가 이미 0이므로(위 liquifyBrushWeight가
 * 경계에서 정확히 0으로 수렴) 필드 경계에서 시각적 이음매(seam)가 생기지 않는다.
 */
export function buildLiquifyDisplacementField(
  points: readonly LiquifyPixelPoint[],
  radiusPx: number,
  strength: number,
  canvasW: number,
  canvasH: number
): LiquifyDisplacementField | null {
  const R = Number.isFinite(radiusPx) ? Math.max(0, radiusPx) : 0;
  const s = Number.isFinite(strength) ? Math.max(0, strength) : 0;
  const w = Number.isFinite(canvasW) ? Math.max(0, Math.round(canvasW)) : 0;
  const h = Number.isFinite(canvasH) ? Math.max(0, Math.round(canvasH)) : 0;
  if (points.length < 2 || R <= 0 || s <= 0 || w <= 0 || h <= 0) return null;

  const step = Math.max(1, R * LIQUIFY_STEP_RATIO);
  const resampled = resampleLiquifyPath(points, step).slice(0, LIQUIFY_MAX_RESAMPLED_POINTS);
  if (resampled.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of resampled) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null; // 방어적 — 정상 입력에선 발생하지 않는다(모든 점이 비유한일 때만).
  }

  const rCeil = Math.ceil(R);
  const originX = clampInt(Math.floor(minX - rCeil), 0, w - 1);
  const originY = clampInt(Math.floor(minY - rCeil), 0, h - 1);
  const endX = clampInt(Math.ceil(maxX + rCeil), 0, w - 1);
  const endY = clampInt(Math.ceil(maxY + rCeil), 0, h - 1);
  if (endX < originX || endY < originY) return null;

  const fieldW = endX - originX + 1;
  const fieldH = endY - originY + 1;
  const dx = new Float32Array(fieldW * fieldH);
  const dy = new Float32Array(fieldW * fieldH);

  for (let i = 1; i < resampled.length; i += 1) {
    const prev = resampled[i - 1]!;
    const curr = resampled[i]!;
    const segX = (curr.x - prev.x) * s;
    const segY = (curr.y - prev.y) * s;
    if (segX === 0 && segY === 0) continue;

    const minLocalX = clampInt(Math.floor(curr.x - rCeil), originX, endX);
    const maxLocalX = clampInt(Math.ceil(curr.x + rCeil), originX, endX);
    const minLocalY = clampInt(Math.floor(curr.y - rCeil), originY, endY);
    const maxLocalY = clampInt(Math.ceil(curr.y + rCeil), originY, endY);

    for (let y = minLocalY; y <= maxLocalY; y += 1) {
      const rowOffset = (y - originY) * fieldW;
      for (let x = minLocalX; x <= maxLocalX; x += 1) {
        const weight = liquifyBrushWeight(x - curr.x, y - curr.y, R);
        if (weight <= 0) continue;
        const idx = rowOffset + (x - originX);
        dx[idx] = dx[idx]! + segX * weight;
        dy[idx] = dy[idx]! + segY * weight;
      }
    }
  }

  return { originX, originY, width: fieldW, height: fieldH, dx, dy };
}

/**
 * 이미지의 (x,y) 지점 색을 bilinear 보간으로 샘플링 — 좌표가 이미지 밖이면 클램프-투-엣지(경계
 * 픽셀을 반복, smudgeStroke의 소스 샘플링과 동일 정책). w/h<=0 이면 [0,0,0,0]. 순수.
 */
export function sampleBilinearClamped(
  img: StudioImageDataLike,
  x: number,
  y: number
): [number, number, number, number] {
  const w = img.width;
  const h = img.height;
  if (w <= 0 || h <= 0) return [0, 0, 0, 0];

  const sx = clampFloat(x, 0, w - 1);
  const sy = clampFloat(y, 0, h - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;

  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const top = img.data[i00 + c]! + (img.data[i10 + c]! - img.data[i00 + c]!) * tx;
    const bottom = img.data[i01 + c]! + (img.data[i11 + c]! - img.data[i01 + c]!) * tx;
    out[c] = top + (bottom - top) * ty;
  }
  return out;
}

/**
 * 변위 필드를 backward mapping으로 렌더 — dst의 각 필드 셀 (x,y)에 대해 src의 (x-dx, y-dy)를
 * bilinear 샘플링해 덮어쓴다. 호출 전 dst는 이미 src와 동일한 픽셀(원본 그대로)로 초기화돼 있어야
 * 한다(bakeLiquifyStrokeToCanvas가 이를 보장) — 변위가 정확히 (0,0)인 셀은 건너뛴다(불필요한 재샘플
 * 방지, 결과는 이미 dst에 있는 원본 픽셀과 동일하므로 스킵해도 무손실).
 * src와 dst는 반드시 서로 다른 버퍼여야 한다(heal-clone의 frozen/work 분리와 동일한 이유 — 같은
 * 버퍼를 쓰면 이미 옮겨 쓴 픽셀을 다른 셀이 다시 원본인 양 읽어버려 스캔 순서에 따라 결과가
 * 달라지는 이중 왜곡이 생긴다).
 */
export function applyLiquifyDisplacement(
  src: StudioImageDataLike,
  dst: StudioImageDataLike,
  field: LiquifyDisplacementField
): void {
  const w = dst.width;
  const h = dst.height;
  for (let ly = 0; ly < field.height; ly += 1) {
    const y = field.originY + ly;
    if (y < 0 || y >= h) continue;
    const rowOffset = ly * field.width;
    for (let lx = 0; lx < field.width; lx += 1) {
      const x = field.originX + lx;
      if (x < 0 || x >= w) continue;
      const idx = rowOffset + lx;
      const ddx = field.dx[idx]!;
      const ddy = field.dy[idx]!;
      if (ddx === 0 && ddy === 0) continue;
      const [r, g, b, a] = sampleBilinearClamped(src, x - ddx, y - ddy);
      const dstIdx = (y * w + x) * 4;
      dst.data[dstIdx] = r;
      dst.data[dstIdx + 1] = g;
      dst.data[dstIdx + 2] = b;
      dst.data[dstIdx + 3] = a;
    }
  }
}

// (C) 캔버스 팩토리 orchestration(bakeLiquifyStrokeToCanvas)은 studio-liquify-browser.ts로
// 옮겼다 — 무거운 변위 적용을 Worker로 오프로드하려면 그 워커 클라이언트가 이 파일의
// applyLiquifyDisplacement를 폴백용으로 import해야 하는데, 이 파일이 오케스트레이션 함수를 통해
// 다시 워커 클라이언트를 import하면 순환 참조가 된다(studio-magic-wand.ts/
// studio-magic-wand-browser.ts와 동일한 분리 이유).
