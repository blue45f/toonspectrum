import { STUDIO_ILLUSTRATION_BACKGROUND_METADATA } from "./studio-illustration-pack";

import type { SceneSeed, SceneSeedBubble, SceneSeedFrame, SceneSeedText, SceneTemplate } from "../studio-scene-templates";

const BACKGROUND_BY_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  "illustrated-autumn-return": "illustration-autumn-alley-morning",
  "illustrated-rain-crossing": "illustration-rainy-street",
  "illustrated-cafe-small-talk": "illustration-sunlit-cafe",
  "illustrated-classroom-promise": "illustration-school-classroom",
  "illustrated-forest-threshold": "illustration-fantasy-forest",
  "illustrated-rooftop-wish": "illustration-starlit-rooftop",
  "illustrated-orbit-signal": "illustration-retro-sf-interior",
  "illustrated-beach-farewell": "illustration-beach-sunset",
});

export function getStudioIllustrationTemplateBackground(templateId: string) {
  const backgroundId = BACKGROUND_BY_TEMPLATE[templateId];
  return STUDIO_ILLUSTRATION_BACKGROUND_METADATA.find((asset) => asset.id === backgroundId);
}

function frame(x: number, y: number, width: number, height: number, bgColor: string): SceneSeedFrame {
  return { type: "frame", x, y, width, height, bgColor, stroke: "#252731", strokeWidth: 3 };
}
function bubble(value: string, x: number, y: number, width: number, height: number, variant: SceneSeedBubble["variant"] = "speech", tail: "left" | "right" | "none" = "left"): SceneSeedBubble {
  return { type: "bubble", text: value, x, y, width, height, variant, tail, fill: "#ffffff", textFill: "#252731", rotation: 0, fontSize: 24 };
}
function caption(value: string, x: number, y: number, width: number, fontSize = 26): SceneSeedText {
  return { type: "text", text: value, x, y, width, fontSize, fill: "#252731", rotation: 0, align: "center" };
}
function scene(id: string, label: string, category: string, description: string, seeds: readonly SceneSeed[]): SceneTemplate {
  return {
    id, label, category, description,
    build: (x, y) => seeds.map((seed) => ({
      ...seed,
      x: seed.x + x,
      y: seed.y + y,
      ...(seed.type === "frame" ? { bg: getStudioIllustrationTemplateBackground(id)?.src } : {}),
    })),
  };
}

// 배경은 새 컷에 포함하고, 컷·대사·효과는 각각 편집 가능한 원본 요소로 삽입한다.
export const STUDIO_ILLUSTRATION_SCENE_TEMPLATES: readonly SceneTemplate[] = [
  scene("illustrated-autumn-return", "가을 골목의 귀환", "daily", "넓은 골목 전경과 짧은 반응 컷으로 오랜만의 귀가를 담습니다. 가을 아침 배경과 어울립니다.", [
    frame(24, 0, 672, 400, "#fff4df"), frame(24, 444, 420, 214, "#fffaf3"), frame(470, 444, 226, 214, "#f4e8d5"),
    bubble("이 골목은 그대로네.", 54, 38, 338, 102), caption("익숙한 길, 낯선 계절.", 74, 516, 318, 24), bubble("다녀왔어.", 490, 476, 186, 110, "whisper", "right"),
  ]),
  scene("illustrated-rain-crossing", "비 오는 밤의 엇갈림", "romance", "두 인물의 다른 시선을 평행 컷으로 나누고 마지막 침묵을 길게 남깁니다.", [
    frame(24, 0, 316, 290, "#e8ebf5"), frame(374, 0, 322, 290, "#e9f0f5"), frame(24, 340, 672, 342, "#e6e8f0"),
    bubble("분명 여기였는데…", 48, 24, 268, 116, "thought"), bubble("조금만 더 기다릴까.", 400, 144, 270, 118, "thought", "right"), caption("빗소리만 남았다.", 126, 550, 468, 28),
  ]),
  scene("illustrated-cafe-small-talk", "햇살 카페의 첫 대화", "romance", "밝은 전경 뒤에 질문과 답변을 서로 다른 컷으로 배치하는 카페 대화입니다.", [
    frame(24, 0, 672, 268, "#fff2df"), frame(24, 312, 282, 304, "#fff9ef"), frame(344, 312, 352, 304, "#fff5e8"),
    caption("오후 두 시의 약속", 92, 38, 536, 30), bubble("늘 이 자리에 앉아요?", 44, 340, 240, 126), bubble("햇살이 가장 좋거든요.", 370, 450, 300, 124, "speech", "right"),
  ]),
  scene("illustrated-classroom-promise", "방과 후 교실의 약속", "school", "빈 교실의 긴 여백과 쪽지 클로즈업, 작은 답변을 분리한 학원 장면입니다.", [
    frame(24, 0, 672, 362, "#f4f3df"), frame(24, 408, 242, 246, "#fff9e9"), frame(298, 408, 398, 246, "#f2f5ea"),
    bubble("모두 돌아간 뒤에…", 52, 28, 348, 104, "box", "none"), caption("내일도 여기서.", 48, 490, 194, 23), bubble("응. 약속이야.", 328, 452, 336, 116, "speech", "right"),
  ]),
  scene("illustrated-forest-threshold", "환상 숲의 문턱", "fantasy", "숲의 전경과 발견, 선택을 세로 리듬으로 연결합니다. 인물과 마법 효과를 추가할 여백을 남깁니다.", [
    frame(24, 0, 672, 316, "#e9f3ea"), frame(124, 360, 472, 184, "#eef9f3"), frame(24, 590, 672, 230, "#e5eff0"),
    bubble("지도가 끝나는 곳.", 58, 28, 320, 100, "box", "none"), caption("빛이 길을 가리켰다.", 150, 410, 420, 27), bubble("들어가 볼까?", 352, 640, 302, 116, "thought", "right"),
  ]),
  scene("illustrated-rooftop-wish", "별빛 옥상의 소원", "romance", "넓은 하늘과 서로 떨어진 두 대사, 마지막 소원을 위한 침묵 컷으로 구성합니다.", [
    frame(24, 0, 672, 472, "#e7ebf8"), frame(90, 524, 540, 196, "#eef0fa"),
    bubble("오늘은 별이 많이 보여.", 52, 34, 300, 112), bubble("무슨 소원을 빌었어?", 360, 278, 306, 118, "speech", "right"), caption("말하면 이루어지지 않는대.", 118, 590, 484, 26),
  ]),
  scene("illustrated-orbit-signal", "궤도 정거장의 신호", "action", "우주선 관측창과 통신 알림, 인물 반응을 분리한 복고 SF 탐사 장면입니다.", [
    frame(24, 0, 672, 244, "#e7eef0"), frame(24, 282, 672, 138, "#e2edef"), frame(24, 460, 384, 274, "#ecf0f1"), frame(444, 460, 252, 274, "#f4ede3"),
    caption("미확인 궤도 · 관측 17일째", 72, 34, 576, 26), bubble("통신 신호를 수신했습니다.", 82, 304, 556, 92, "system", "none"), bubble("여기에는 아무도…", 52, 492, 328, 122, "whisper"), caption("삐—", 484, 554, 172, 40),
  ]),
  scene("illustrated-beach-farewell", "노을 바다의 마지막 인사", "narrative", "긴 해변 전경, 짧은 대사, 마지막 한 줄을 분리하는 회차 마무리 구성입니다.", [
    frame(24, 0, 672, 408, "#fff0e4"), frame(24, 466, 672, 212, "#fce9df"),
    bubble("내년에도 이 바다에서.", 56, 44, 392, 114, "speech"), bubble("꼭 다시 만나자.", 346, 500, 310, 110, "speech", "right"), caption("우리의 여름은 아직 끝나지 않았다.", 64, 754, 592, 29),
  ]),
];
