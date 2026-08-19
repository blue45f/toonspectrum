/**
 * 팁 알파맵 × 종이 결 — dab 하나가 실제로 남기는 자국을 만든다.
 *
 * **왜 마크 알파 곱셈만으로는 안 되는가.** 인과 증착(causal deposit) 브러시는 dab 하나를
 * 알파맵 스탬프 하나로 그린다(`fullTextureAuthority`). 이 마크의 알파는 캐리어 전체에 걸린
 * 스칼라 하나라, 여기에 종이 이득을 곱하면 dab이 종이 골을 지날 때마다 *dab 통째로* 진해졌다
 * 옅어질 뿐 획 **안쪽**에는 아무 질감도 생기지 않는다. 종이 결은 dab보다 훨씬 잔 구조라
 * 반드시 dab 내부 좌표에서 평가돼야 한다.
 *
 * 그래서 R8 페이퍼 에셋 경로(`composeStudioBrushR8TipPaperAlphaMap`)와 같은 자리에서 같은
 * 일을 한다 — 팁 알파맵의 각 텍셀을 문서 좌표로 되돌린 뒤 그 자리의 종이 이득을 곱한다.
 * 다른 점은 종이가 디코드된 R8 에셋이 아니라 `studio-paper-texture`의 절차적 높이맵이고,
 * 노이즈는 dab마다 만들지 않고 스트로크 시작 시 잡아 둔 타일에서 바이리니어로 읽는다는 것뿐이다.
 *
 * 비용은 텍셀당 4-탭 조회 하나이며 노이즈 생성은 (종이, 강도)당 정확히 한 번이다.
 * 합성 자체는 dab당 맵 하나를 만들므로 R8 경로와 같은 바이트 예산으로 묶는다 — 예산을 넘는
 * 긴 획은 합성을 포기하고 팁 맵 그대로 찍는다. 이때도 마크 알파는 손대지 않으므로 획의
 * 농도는 그대로고 그 뒤 구간의 종이 질감만 사라진다(밀도 단차보다 질감 페이드가 낫다).
 */

import { type StudioPaperGranulationTile } from "./studio-paper-granulation-runtime";

import type { StudioBrushTipAlphaMap } from "./studio-brush-tip-stamp";

/**
 * 종이 합성 알파맵에 쓸 수 있는 바이트 — **dab 인덱스 천장으로 환산해서** 쓴다.
 *
 * R8 페이퍼 경로의 `STUDIO_DYNAMIC_COVERAGE_R8_ALPHA_MAP_BYTE_BUDGET`(16 MiB)와 같은 크기다 —
 * 같은 종류의 작업이라 같은 천장을 쓴다. 128² Float32 맵 하나가 64 KiB이므로 약 256 dab까지
 * 종이 결이 dab 내부까지 들어가고, 그 뒤 dab은 팁 맵 그대로 찍힌다.
 *
 * 소비자(`studio-dynamic-brush-coverage-renderer`)는 이 값을 "남은 바이트"로 차감하지 않고
 * `floor(예산 / 맵 바이트)`를 **dab 인덱스 상한**으로 쓴다. 남은 바이트로 세면 접미사만 계획하는
 * 라이브·변형 하나만 계획하는 SVG 파티션·전체 재생이 서로 다른 dab에서 예산을 소진해 같은 획이
 * 경로마다 다른 픽셀이 된다. 인덱스는 세 경로에서 같은 값이라 판정이 갈리지 않는다.
 */
export const STUDIO_PAPER_TIP_COMPOSITION_BYTE_BUDGET = 16 * 1024 * 1024;

export interface StudioPaperTipCompositionInput {
  readonly tip: StudioBrushTipAlphaMap;
  readonly tile: StudioPaperGranulationTile;
  readonly scale: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRadians: number;
}

/**
 * 합성 결과의 불변 리비전.
 *
 * 텍스처 스탬프 캐시가 이 문자열로 마스크·틴트 표면을 재사용하므로 **내용이 같으면 반드시
 * 같아야** 하고 다르면 달라야 한다. 입력이 전부 유한한 수와 이미 불변인 팁 리비전뿐이라
 * 해시를 돌릴 필요 없이 그대로 이어 붙인다 — dab마다 sha256을 계산하지 않는 것이 요점이다.
 */
function compositionRevision(input: StudioPaperTipCompositionInput): string {
  return [
    "paper-tip-v1",
    typeof input.tip.revision === "undefined" ? "anon" : String(input.tip.revision),
    input.tile.key,
    input.scale,
    input.centerX,
    input.centerY,
    input.radiusX,
    input.radiusY,
    input.angleRadians,
  ].join("|");
}

/**
 * 팁 알파맵을 문서 좌표의 종이 이득으로 변조한 새 맵. 입력 맵은 건드리지 않는다.
 *
 * 텍셀 중심을 [-1,1] 단위 좌표로 놓고 dab의 반지름·회전을 적용해 문서 좌표로 되돌린 뒤,
 * 그 자리의 배수를 곱한다 — `composeStudioBrushR8TipPaperAlphaMap`과 동일한 사상이라
 * 두 종이 경로(절차적/에셋)가 같은 기하 규약을 공유한다.
 *
 * 알파가 0인 텍셀은 건너뛴다. 종이는 있는 안료를 재배치할 뿐 없는 곳에 만들지 않는다.
 */
export function composeStudioPaperTipAlphaMap(
  input: StudioPaperTipCompositionInput,
): StudioBrushTipAlphaMap | null {
  const size = input.tip.size;
  if (
    !Number.isSafeInteger(size)
    || size <= 0
    || input.tip.alphas.length !== size * size
    || !Number.isFinite(input.centerX)
    || !Number.isFinite(input.centerY)
    || !Number.isFinite(input.radiusX)
    || !Number.isFinite(input.radiusY)
    || !Number.isFinite(input.angleRadians)
    || input.radiusX <= 0
    || input.radiusY <= 0
  ) {
    return null;
  }
  const alphas = new Float32Array(input.tip.alphas.length);
  const cosine = Math.cos(input.angleRadians);
  const sine = Math.sin(input.angleRadians);
  const source = input.tip.alphas;
  const gain = input.tile.gain;
  const tileSize = input.tile.size;
  const scale = input.scale;
  /*
   * 텍셀 → 타일 좌표는 완전한 아핀 사상이라 행/열마다 상수 증분으로 걸어갈 수 있다.
   * 텍셀당 삼각함수·나눗셈·함수 호출·클램프를 전부 없애고 floor 두 번과 4-탭 보간만 남긴다.
   * 이 루프가 dab마다 맵 크기(기본 128² = 16,384회)를 돌기 때문에 상수 인자가 곧 체감 성능이다.
   */
  const texelToLocalX = (2 / size) * input.radiusX;
  const texelToLocalY = (2 / size) * input.radiusY;
  const stepUx = (texelToLocalX * cosine) / scale;
  const stepUy = (-texelToLocalY * sine) / scale;
  const stepVx = (texelToLocalX * sine) / scale;
  const stepVy = (texelToLocalY * cosine) / scale;
  // (0.5, 0.5) 텍셀 중심을 [-1,1]로 보낸 뒤 dab 변환을 태운 좌상단 시작점.
  const originLocalX = (0.5 / size) * 2 * input.radiusX - input.radiusX;
  const originLocalY = (0.5 / size) * 2 * input.radiusY - input.radiusY;
  let rowU = (input.centerX + originLocalX * cosine - originLocalY * sine) / scale;
  let rowV = (input.centerY + originLocalX * sine + originLocalY * cosine) / scale;
  for (let y = 0; y < size; y += 1) {
    let u = rowU;
    let v = rowV;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const tipAlpha = source[row + x]!;
      if (tipAlpha > 0) {
        const fx = Math.floor(u);
        const fy = Math.floor(v);
        const tx = u - fx;
        const ty = v - fy;
        let xa = fx % tileSize;
        if (xa < 0) xa += tileSize;
        let ya = fy % tileSize;
        if (ya < 0) ya += tileSize;
        const xb = xa + 1 === tileSize ? 0 : xa + 1;
        const yb = ya + 1 === tileSize ? 0 : ya + 1;
        const rowA = ya * tileSize;
        const rowB = yb * tileSize;
        const n00 = gain[rowA + xa]!;
        const n10 = gain[rowA + xb]!;
        const n01 = gain[rowB + xa]!;
        const n11 = gain[rowB + xb]!;
        const top = n00 + (n10 - n00) * tx;
        const multiplier = 1 + top + (n01 + (n11 - n01) * tx - top) * ty;
        const value = tipAlpha * (multiplier > 0 ? multiplier : 0);
        alphas[row + x] = value >= 1 ? 1 : value;
      }
      u += stepUx;
      v += stepVx;
    }
    rowU += stepUy;
    rowV += stepVy;
  }
  return {
    size,
    alphas,
    shape: input.tip.shape,
    softness: input.tip.softness,
    custom: true,
    revision: compositionRevision(input),
  };
}
