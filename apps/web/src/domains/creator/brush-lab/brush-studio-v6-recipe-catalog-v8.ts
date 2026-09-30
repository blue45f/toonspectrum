import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

import type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

/**
 * V8 신규 브러시 3종 — 기존 88종과 겹치지 않음을 검증한 상호작용 모델.
 *
 * - v8-masking-fluid: 마스크 자체를 그리는 도구 (마스크 필드 침착 → 차단 → 벗겨내기)
 * - v8-scratchboard: 감산식 스크래치 (어두운 잉크층을 긁어 밑색 노출)
 * - v8-chromatography-ink: 습윤 잉크의 다성분 분리 (이동도 차등)
 *
 * 슬롯 ID는 기존 topology/node 카탈로그에 존재하는 것만 사용한다.
 * (unknown ID는 validNode 폴백으로 조용히 대체되므로, 실제 동작은
 *  brush/ 도메인의 전용 런타임 모듈이 담당한다.)
 */
export const BRUSH_STUDIO_V8_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] =
  Object.freeze([
    defineBrushStudioV6RecipeSeed(
      "v8-masking-fluid",
      "마스킹액",
      "마스크",
      "보호할 영역에 마스크를 칠하는 도구. 마스크된 곳은 후속 채색을 차단하고, 벗겨내면 흰 종이가 드러난다. studio-masking-fluid 런타임과 연동.",
      {
        slots: {
          motion: "motion-direct",
          carrier: "carrier-libmypaint-dabs",
          surface: "surface-coldpress",
          deposition: "deposit-wet",
          physics: ["physics-porous-paper"],
          finish: ["finish-edge-bloom"],
        },
        tuning: {
          size: 30,
          wetness: 0.92,
          flow: 0.85,
          absorbency: 0.15,
          diffusion: 0.1,
          primaryColor: "#facc15",
          secondaryColor: "#a16207",
        },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "v8-scratchboard",
      "스크래치보드",
      "만화",
      "어두운 잉크층을 긁어내 밑의 밝은 종이를 드러내는 감산식 브러시. 종이결에 따라 자국이 끊어지고 가장자리에 잉크 잔여물이 남는다. studio-scratchboard 런타임과 연동.",
      {
        slots: {
          motion: "motion-direct",
          carrier: "carrier-libmypaint-dabs",
          tip: "tip-krita-dual",
          surface: "surface-printmaking",
          deposition: "deposit-dry",
          physics: ["physics-dry-contact"],
          finish: ["finish-grain"],
        },
        tuning: {
          size: 16,
          surfaceTooth: 0.85,
          friction: 0.7,
          granulation: 0.6,
          primaryColor: "#f8fafc",
          secondaryColor: "#0f172a",
        },
      },
    ),
    defineBrushStudioV6RecipeSeed(
      "v8-chromatography-ink",
      "크로마토그래피 잉크",
      "습식",
      "젖은 잉크가 마르며 성분 안료로 분리되는 잉크. 이동도가 높은 성분은 바깥으로 퍼지고 낮은 성분은 중심에 남는다. studio-chromatography-ink 런타임과 연동.",
      {
        slots: {
          motion: "motion-brush-inertia",
          carrier: "carrier-hokusai-dabs",
          surface: "surface-porous",
          deposition: "deposit-wet",
          pigment: "pigment-inkwash-density",
          physics: ["physics-porous-paper", "physics-inkwash"],
          finish: ["finish-edge-bloom", "finish-wet-sheen"],
        },
        tuning: {
          size: 36,
          wetness: 0.9,
          absorbency: 0.75,
          diffusion: 0.85,
          edgeDarkening: 0.4,
          primaryColor: "#1e1b4b",
          secondaryColor: "#dc2626",
        },
      },
    ),
  ]);
