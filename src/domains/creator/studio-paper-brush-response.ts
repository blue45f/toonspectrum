/**
 * 브러시가 종이와 상호작용하는 세기 — 렌더 패밀리별 정책 표.
 *
 * 실물에서 종이 결이 보이는 정도는 도구가 정한다. 목탄 가루는 골에 그대로 쌓이고(강한
 * granulation), 수채 안료는 물에 실려 골로 내려앉으며, 기술펜 잉크는 섬유에 즉시 물들어
 * (staining) 종이 요철과 무관하게 균일한 선을 남긴다. 이 표는 그 차이를
 * `studio-paper-texture`의 두 축(granulation / staining)으로 그대로 옮긴다.
 *
 * **왜 브러시 스냅샷이 아니라 표인가** — 종이 반응은 저장되는 획 상태가 아니라 도구의
 * 물성이다. 문서에 직렬화하면 CRDT 봉투·정규화 JSON·브러시 라이브러리 골든이 전부
 * 흔들리는데, 얻는 것은 없다(사용자가 "이 획만 목탄처럼 종이를 타게" 하고 싶어하지 않는다).
 * 문서가 소유하는 것은 *어떤 종이를 깔았는가*(`StudioPaperSurfaceSettings`)뿐이다.
 */

import { resolveStudioBrushRenderFamily, type StudioBrushRenderFamily } from "./studio-brush";
import {
  STUDIO_PAPER_GRANULATION_IDENTITY,
  type StudioPaperGranulationSettings,
} from "./studio-paper-granulation-runtime";

/**
 * 렌더 패밀리 → 종이 반응.
 *
 * `granulation`은 골에 가라앉는 경향, `staining`은 그걸 억제하는 물듦, `scale`은 종이 텍셀
 * 하나가 차지하는 문서 px다. 강도 값은 실측으로 정했다(tests/benchmarks/results/
 * brush-texture-lab-wired.json): 0.75를 넘기면 알파 배수가 상한 2에 닿아 평균 보존이
 * 깨지므로 자연매체 최대치를 0.7로 둔다.
 *
 * - **dry-media(목탄·콩테·크레용) 0.70** — 마른 가루가 골에만 남고 봉우리는 그대로 비는,
 *   종이 결이 가장 노골적으로 드러나는 매체. scale 1.5로 결을 굵게 본다.
 * - **pencil 0.55** — 흑연도 골에 남지만 심이 봉우리를 눌러 깎으므로 목탄보다 덜하다.
 * - **pastel 0.62 / oil 0.28** — 건성 파스텔은 목탄에 가깝고, 유성 바인더가 들어가면
 *   골을 메우며 결이 죽는다.
 * - **watercolor 0.58 + staining 0.18** — 안료가 물에 실려 골로 내려앉되, 일부는 섬유에
 *   물든다. 잉크워시 필터의 granulation 기본값(38/100)보다 세다: 필터는 이미 마른 워시
 *   전체에 걸리고, 여기는 dab 하나가 남기는 젖은 자국이다.
 * - **brush(일반 회화 붓) 0.34** — 물감을 두껍게 올리면 결이 절반쯤 묻힌다.
 * - **airbrush 0** — 안료가 공중에서 안개로 내려앉아 종이 요철과 접촉하지 않는다. 물리적으로
 *   이득이 0에 가깝고, 이 패밀리(airbrush·spray·splatter·soft-brush)는 범용 소프트 도구로도
 *   널리 쓰여 픽셀 항등을 유지하는 편이 낫다.
 * - **pen·gpen·technical·marker·highlighter·perfect·neon·glow·glitter·screentone·pixel 0** —
 *   잉크가 섬유를 즉시 물들이거나(기술펜) 아예 물리적 종이가 없는 합성 마크다. 정확한
 *   항등이라 이 브러시들의 픽셀은 배선 전후로 한 비트도 바뀌지 않는다.
 * - **stamp / ink-particle** — 스탬프 패밀리는 실제 매체가 id에 따라 갈리므로(잉크붓·에어
 *   브러시·연필 그레인·워시붓이 모두 `stamp`) 여기서는 0으로 두고, 스탬프 엔진이 자기
 *   종류(`StudioStampBrushKind`)로 직접 고른다.
 */
export const STUDIO_PAPER_BRUSH_RESPONSE: Readonly<
  Record<StudioBrushRenderFamily, StudioPaperGranulationSettings>
> = Object.freeze({
  "dry-media": { granulation: 0.7, staining: 0.04, scale: 1.5 },
  pastel: { granulation: 0.62, staining: 0.06, scale: 1.5 },
  pencil: { granulation: 0.55, staining: 0.08, scale: 1 },
  watercolor: { granulation: 0.58, staining: 0.18, scale: 1 },
  brush: { granulation: 0.34, staining: 0.2, scale: 1 },
  oil: { granulation: 0.28, staining: 0.24, scale: 1.5 },
  calligraphy: { granulation: 0.22, staining: 0.42, scale: 1 },
  // 종이를 타지 않는 도구들 — 정확한 항등.
  airbrush: STUDIO_PAPER_GRANULATION_IDENTITY,
  pen: STUDIO_PAPER_GRANULATION_IDENTITY,
  gpen: STUDIO_PAPER_GRANULATION_IDENTITY,
  perfect: STUDIO_PAPER_GRANULATION_IDENTITY,
  marker: STUDIO_PAPER_GRANULATION_IDENTITY,
  highlighter: STUDIO_PAPER_GRANULATION_IDENTITY,
  neon: STUDIO_PAPER_GRANULATION_IDENTITY,
  glow: STUDIO_PAPER_GRANULATION_IDENTITY,
  glitter: STUDIO_PAPER_GRANULATION_IDENTITY,
  "ink-particle": STUDIO_PAPER_GRANULATION_IDENTITY,
  screentone: STUDIO_PAPER_GRANULATION_IDENTITY,
  stamp: STUDIO_PAPER_GRANULATION_IDENTITY,
  pixel: STUDIO_PAPER_GRANULATION_IDENTITY,
});

// Newly authored core wet strokes already carry their own grain snapshot. These exact ids only
// reach the dynamic call sites through bounded-flow-v2, so historical causal-watercolor strokes
// keep their old renderer and pixels while new strokes avoid stacking a second paper response.
const STUDIO_AUTHORED_WET_DYNAMIC_PAPER_RESPONSE_IDS = new Set([
  "watercolor",
  "ink-wash",
  "inkwash-pen",
  "inkwash-water-brush",
  "inkwash-bleed-wash",
  "inkwash-white-ink",
]);

/** 브러시 id → 종이 반응. 미지의 id는 `resolveStudioBrushRenderFamily`가 pen(=항등)으로 보낸다. */
export function resolveStudioPaperBrushResponse(
  brushId: unknown,
): StudioPaperGranulationSettings {
  if (
    typeof brushId === "string"
    && STUDIO_AUTHORED_WET_DYNAMIC_PAPER_RESPONSE_IDS.has(brushId.trim().toLowerCase())
  ) {
    return STUDIO_PAPER_GRANULATION_IDENTITY;
  }
  return STUDIO_PAPER_BRUSH_RESPONSE[resolveStudioBrushRenderFamily(brushId)];
}
