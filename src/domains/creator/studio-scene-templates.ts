/**
 * Studio Scene Templates — 원클릭 "장면 템플릿" 라이브러리.
 *
 * 기존 startFromExample 은 샘플 프레임 + 말풍선 한 개짜리 단일 예시뿐이었다. 이 모듈은
 * 코미포·툰스푼의 "캐릭터·말풍선·효과를 한 번에" 발상을 따라, 자주 쓰는 연출(고백·액션·
 * 회상·긴장 클로즈업…)을 프레임+말풍선+효과선+효과음 여러 요소로 미리 조합해 한 번에
 * 캔버스에 깔아준다.
 *
 * 각 템플릿의 build(originX, originY)는 id 없는 SceneSeed 배열을 돌려준다 — 메인 루프가
 * crypto.randomUUID()로 id를 채워 El 로 만든다. SceneSeed 필드명은 El 유니온과 1:1로
 * 맞춰야 한다(여기가 통합 계약). 전부 순수·결정적. 사용자 노출 문자열은 한글.
 *
 * 좌표 규약: build(0,0) 기준 모든 x가 [0, 720](CANVAS_W) 안에 들어오게 배치한다.
 */

const CANVAS_W = 720;

type BubbleVariant =
  | "speech"
  | "thought"
  | "shout"
  | "box"
  | "whisper"
  | "scared"
  | "system"
  | "heart"
  | "phone"
  | "angry";
type Align = "left" | "center" | "right";
type FontStyle = "normal" | "bold" | "italic" | "bold italic";

export type SceneSeedFrame = {
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  bgColor?: string;
  dashStyle?: "solid" | "dashed";
};
export type SceneSeedBubble = {
  type: "bubble";
  variant: BubbleVariant;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  textFill: string;
  rotation: number;
  tail?: "left" | "right" | "none";
  tailDirection?: "bottom" | "top" | "left" | "right";
  font?: string;
  fontSize?: number;
  align?: Align;
  fontStyle?: FontStyle;
};
export type SceneSeedText = {
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fill: string;
  rotation: number;
  font?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: Align;
  fontStyle?: FontStyle;
};
export type SceneSeedFocusLines = {
  type: "focusLines";
  x: number;
  y: number;
  width: number;
  height: number;
  lineCount: number;
  innerRadius: number;
  outerRadius: number;
  stroke: string;
  strokeWidth: number;
  noise: number;
  rotation: number;
};
export type SceneSeedSpeedLines = {
  type: "speedLines";
  x: number;
  y: number;
  width: number;
  height: number;
  lineCount: number;
  direction: "horizontal" | "vertical";
  stroke: string;
  strokeWidth: number;
  rotation: number;
};
export type SceneSeed =
  | SceneSeedFrame
  | SceneSeedBubble
  | SceneSeedText
  | SceneSeedFocusLines
  | SceneSeedSpeedLines;

export interface SceneTemplate {
  id: string;
  label: string;
  category: string;
  description: string;
  build: (originX: number, originY: number) => SceneSeed[];
}

export const SCENE_TEMPLATE_CATEGORIES: { id: string; label: string }[] = [
  { id: "romance", label: "로맨스" },
  { id: "action", label: "액션·긴장" },
  { id: "daily", label: "일상·대화" },
  { id: "narrative", label: "연출·타이틀" },
];

// 좌측 안쪽 여백 — build(0,0) 시 x 시작점. 660폭 프레임이 720 안에 들어오게 30.
const PAD = 30;
const INNER_W = CANVAS_W - PAD * 2; // 660

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "confession",
    label: "고백 장면",
    category: "romance",
    description: "포근한 프레임 + 대사 두 개 + 두근 효과음",
    build: (ox, oy) => [
      {
        type: "frame",
        x: ox + PAD,
        y: oy,
        width: INNER_W,
        height: 460,
        bgColor: "#fff1f4",
        stroke: "#f4b8c6",
        strokeWidth: 3,
      },
      {
        type: "bubble",
        variant: "speech",
        text: "저… 사실 너한테 할 말이 있어.",
        x: ox + PAD + 28,
        y: oy + 36,
        width: 300,
        height: 110,
        fill: "#ffffff",
        textFill: "#3a2a30",
        rotation: 0,
        tail: "left",
        tailDirection: "bottom",
      },
      {
        type: "bubble",
        variant: "heart",
        text: "응? 무슨 말인데…",
        x: ox + PAD + 320,
        y: oy + 250,
        width: 260,
        height: 110,
        fill: "#ffe3ea",
        textFill: "#a23a55",
        rotation: 0,
        tail: "right",
        tailDirection: "top",
      },
      {
        type: "text",
        text: "두근",
        x: ox + PAD + 250,
        y: oy + 170,
        width: 160,
        fontSize: 64,
        fill: "#ff5a7a",
        rotation: -8,
        font: "Black Han Sans",
        stroke: "#ffffff",
        strokeWidth: 5,
        align: "center",
      },
    ],
  },
  {
    id: "action-impact",
    label: "액션 컷",
    category: "action",
    description: "집중선 + 외침 말풍선 + 쾅! 효과음",
    build: (ox, oy) => [
      {
        type: "focusLines",
        x: ox + PAD,
        y: oy,
        width: INNER_W,
        height: 500,
        lineCount: 60,
        innerRadius: 120,
        outerRadius: 460,
        stroke: "#15100c",
        strokeWidth: 5,
        noise: 0.4,
        rotation: 0,
      },
      {
        type: "bubble",
        variant: "shout",
        text: "이게 끝이 아니야!",
        x: ox + PAD + 150,
        y: oy + 60,
        width: 340,
        height: 150,
        fill: "#ffffff",
        textFill: "#161616",
        rotation: -4,
        fontStyle: "bold",
        align: "center",
      },
      {
        type: "text",
        text: "쾅!",
        x: ox + PAD + 200,
        y: oy + 300,
        width: 260,
        fontSize: 120,
        fill: "#ffffff",
        rotation: -10,
        font: "Black Han Sans",
        stroke: "#161616",
        strokeWidth: 9,
        align: "center",
      },
    ],
  },
  {
    id: "daily-talk",
    label: "일상 대화 2컷",
    category: "daily",
    description: "위아래 두 컷 + 주고받는 대사",
    build: (ox, oy) => [
      {
        type: "frame",
        x: ox + PAD,
        y: oy,
        width: INNER_W,
        height: 300,
        bgColor: "#ffffff",
        stroke: "#1c1c1c",
        strokeWidth: 3,
      },
      {
        type: "frame",
        x: ox + PAD,
        y: oy + 324,
        width: INNER_W,
        height: 300,
        bgColor: "#ffffff",
        stroke: "#1c1c1c",
        strokeWidth: 3,
      },
      {
        type: "bubble",
        variant: "speech",
        text: "오늘 점심 뭐 먹을까?",
        x: ox + PAD + 30,
        y: oy + 36,
        width: 280,
        height: 100,
        fill: "#ffffff",
        textFill: "#222222",
        rotation: 0,
        tail: "left",
        tailDirection: "bottom",
      },
      {
        type: "bubble",
        variant: "speech",
        text: "음… 떡볶이 어때?",
        x: ox + PAD + 320,
        y: oy + 392,
        width: 280,
        height: 100,
        fill: "#fdf3e7",
        textFill: "#222222",
        rotation: 0,
        tail: "right",
        tailDirection: "top",
      },
    ],
  },
  {
    id: "flashback",
    label: "회상 장면",
    category: "narrative",
    description: "나레이션 박스 + 흐릿한 점선 프레임",
    build: (ox, oy) => [
      {
        type: "frame",
        x: ox + PAD,
        y: oy,
        width: INNER_W,
        height: 440,
        bgColor: "#f3efe7",
        stroke: "#b9ad97",
        strokeWidth: 2,
        dashStyle: "dashed",
      },
      {
        type: "bubble",
        variant: "box",
        text: "그날의 기억은 아직도 선명했다.",
        x: ox + PAD + 40,
        y: oy + 32,
        width: 360,
        height: 96,
        fill: "#fffdf6",
        textFill: "#5a4f3a",
        rotation: 0,
        font: "Nanum Pen Script",
        align: "left",
      },
      {
        type: "text",
        text: "…그때 우리는 어렸다",
        x: ox + PAD + 60,
        y: oy + 320,
        width: 420,
        fontSize: 40,
        fill: "#8a7c60",
        rotation: -3,
        font: "Nanum Pen Script",
        align: "left",
      },
    ],
  },
  {
    id: "tense-closeup",
    label: "긴장 클로즈업",
    category: "action",
    description: "속도선 + 불안 말풍선 + 두근 효과음",
    build: (ox, oy) => [
      {
        type: "speedLines",
        x: ox + PAD,
        y: oy,
        width: INNER_W,
        height: 460,
        lineCount: 48,
        direction: "vertical",
        stroke: "#1a1a22",
        strokeWidth: 4,
        rotation: 0,
      },
      {
        type: "bubble",
        variant: "scared",
        text: "설마… 들킨 건가?",
        x: ox + PAD + 130,
        y: oy + 80,
        width: 320,
        height: 130,
        fill: "#eef0f6",
        textFill: "#2a2f3a",
        rotation: 0,
        align: "center",
      },
      {
        type: "text",
        text: "두근…",
        x: ox + PAD + 220,
        y: oy + 300,
        width: 220,
        fontSize: 56,
        fill: "#5a6072",
        rotation: 6,
        font: "Gaegu",
        stroke: "#ffffff",
        strokeWidth: 4,
        align: "center",
      },
    ],
  },
  {
    id: "title-cut",
    label: "타이틀 컷",
    category: "narrative",
    description: "큰 제목 + 부제 박스",
    build: (ox, oy) => [
      {
        type: "text",
        text: "프롤로그",
        x: ox + PAD,
        y: oy + 80,
        width: INNER_W,
        fontSize: 96,
        fill: "#161616",
        rotation: 0,
        font: "Black Han Sans",
        align: "center",
      },
      {
        type: "bubble",
        variant: "box",
        text: "— 모든 것은 그 비 오는 밤부터 시작되었다 —",
        x: ox + PAD + 60,
        y: oy + 240,
        width: INNER_W - 120,
        height: 90,
        fill: "#161616",
        textFill: "#f4f4f4",
        rotation: 0,
        align: "center",
      },
    ],
  },
];

/** 카테고리로 템플릿 거르기(미지정이면 전체). */
export function listSceneTemplates(category?: string): SceneTemplate[] {
  if (!category) return SCENE_TEMPLATES;
  return SCENE_TEMPLATES.filter((t) => t.category === category);
}
