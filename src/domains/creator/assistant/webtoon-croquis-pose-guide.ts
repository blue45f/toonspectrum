/**
 * webtoon-croquis-pose-guide.ts
 *
 * Webtoon Figure Croquis & Dynamic Perspective Pose Assistant.
 * Benchmarks Posemaniacs, Line of Action, and specialized comic composition rules.
 *
 * - 3 Croquis interval training timer presets (30s Gesture, 60s Structure, 180s Detail Anatomy).
 * - Curated comic pose library with dynamic body rhythm curves (Line of Action).
 * - 4 Perspective guide overlays (Eye Level, Dramatic Low Angle, High Angle Bird's Eye, Dutch Tilt).
 */

export type CroquisTimerIntervalSec = 30 | 60 | 180;

export type PerspectiveGuidePreset =
  | "eye-level" // 아이레벨 (일상/표준 대화)
  | "low-angle" // 로우앵글 (영웅적 위압감/박력)
  | "high-angle" // 하이앵글 (부감/위축/전체 전황)
  | "dutch-tilt"; // 더치 앵글 (위기/불안/박진감)

export interface ComicPosePromptItem {
  readonly id: string;
  readonly title: string;
  readonly category: "action" | "emotion" | "daily" | "fantasy";
  readonly lineOfActionCurve: "C-curve" | "S-curve" | "Straight-thrust";
  readonly description: string;
  readonly keyAnatomyFocus: string;
  readonly recommendedIntervalSec: CroquisTimerIntervalSec;
}

export interface PerspectiveGuideConfig {
  readonly preset: PerspectiveGuidePreset;
  readonly label: string;
  readonly horizonRatioY: number; // 0..1 (where the horizon line sits)
  readonly tiltAngleDeg: number;
  readonly vanishingPointCount: 1 | 2 | 3;
  readonly tip: string;
}

export const COMIC_POSE_LIBRARY: readonly ComicPosePromptItem[] = [
  {
    id: "pose-hero-dash",
    title: "돌진 펀치 / 일도양단 베기",
    category: "action",
    lineOfActionCurve: "Straight-thrust",
    description: "앞으로 강하게 뻗는 일직선 타격선과 뒷다리의 강력한 지지선",
    keyAnatomyFocus: "견갑골의 전진 및 척추의 비틀림 각도",
    recommendedIntervalSec: 60,
  },
  {
    id: "pose-dramatic-land",
    title: "슈퍼히어로 3점 착지",
    category: "action",
    lineOfActionCurve: "C-curve",
    description: "한 손과 한쪽 무릎이 바닥에 닿으며 충격을 흡수하는 극적인 웅크림",
    keyAnatomyFocus: "골반의 최대 굴곡 및 목의 반대편 신전",
    recommendedIntervalSec: 180,
  },
  {
    id: "pose-sorrow-sit",
    title: "무릎을 끌어안고 앉은 절망",
    category: "emotion",
    lineOfActionCurve: "C-curve",
    description: "몸을 둥글게 웅크려 외부의 충격을 방어하려는 폐쇄적 자세",
    keyAnatomyFocus: "등 곡선(Kyphosis)과 이마를 묻은 무릎의 접촉면",
    recommendedIntervalSec: 60,
  },
  {
    id: "pose-spell-cast",
    title: "공중 부유 마법 영창",
    category: "fantasy",
    lineOfActionCurve: "S-curve",
    description: "하늘을 향해 활처럼 휘어지는 유려한 허리선과 양손의 마법 전개",
    keyAnatomyFocus: "갈비뼈(흉곽)의 확장 및 발끝의 아래 방향 포인팅",
    recommendedIntervalSec: 180,
  },
  {
    id: "pose-casual-turn",
    title: "뒤돌아보며 눈 마주치기",
    category: "daily",
    lineOfActionCurve: "S-curve",
    description: "걸어가던 중 어깨 너머로 시선이 돌아오는 설레는 비틀림",
    keyAnatomyFocus: "경추(목)의 회전과 반대쪽 어깨의 하강",
    recommendedIntervalSec: 30,
  },
];

export const PERSPECTIVE_GUIDES: Record<PerspectiveGuidePreset, PerspectiveGuideConfig> = {
  "eye-level": {
    preset: "eye-level",
    label: "아이레벨 (1점 투시 · 자연스러운 대화)",
    horizonRatioY: 0.5,
    tiltAngleDeg: 0,
    vanishingPointCount: 1,
    tip: "독자가 인물과 같은 눈높이에서 마주 보며 심리적 친밀감을 느끼게 합니다.",
  },
  "low-angle": {
    preset: "low-angle",
    label: "로우앵글 (3점 투시 · 박력과 위압감)",
    horizonRatioY: 0.8,
    tiltAngleDeg: 0,
    vanishingPointCount: 3,
    tip: "지평선이 화면 아래로 내려가며 인물이 거대해 보이고 영웅적인 존재감을 부여합니다.",
  },
  "high-angle": {
    preset: "high-angle",
    label: "하이앵글 부감 (3점 투시 · 전체 조망과 위축)",
    horizonRatioY: 0.2,
    tiltAngleDeg: 0,
    vanishingPointCount: 3,
    tip: "지평선이 위로 올라가 바닥이 넓게 보이며, 캐릭터의 고독이나 전황의 규모를 보여줍니다.",
  },
  "dutch-tilt": {
    preset: "dutch-tilt",
    label: "더치 앵글 (경사 투시 · 위기와 혼란)",
    horizonRatioY: 0.5,
    tiltAngleDeg: -12,
    vanishingPointCount: 2,
    tip: "카메라를 10~15도 기울여 안정감을 깨고 액션의 격렬함이나 심리적 혼란을 극대화합니다.",
  },
};

export class WebtoonCroquisPoseGuide {
  public listPoses(category?: ComicPosePromptItem["category"]): readonly ComicPosePromptItem[] {
    if (!category) return COMIC_POSE_LIBRARY;
    return COMIC_POSE_LIBRARY.filter((p) => p.category === category);
  }

  public getPerspectiveGuide(preset: PerspectiveGuidePreset): PerspectiveGuideConfig {
    return PERSPECTIVE_GUIDES[preset];
  }

  /**
   * Randomly selects a pose prompt for rapid croquis practice.
   */
  public getRandomPose(seed = Date.now()): ComicPosePromptItem {
    const idx = Math.abs(seed) % COMIC_POSE_LIBRARY.length;
    return COMIC_POSE_LIBRARY[idx];
  }
}
