export interface BubbleStylePreset {
  id: string;
  label: string;
  description: string;
  fill: string;
  textFill: string;
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  font?: string;
}

export const BUBBLE_STYLE_PRESETS: BubbleStylePreset[] = [
  {
    id: "classic_white",
    label: "기본 흰색",
    description: "보편적인 웹툰 말풍선",
    fill: "#ffffff",
    textFill: "#16100c",
    stroke: "#16100c",
    strokeWidth: 3,
  },
  {
    id: "classic_black",
    label: "속마음/독백",
    description: "어두운 분위기 또는 독백",
    fill: "#16100c",
    textFill: "#ffffff",
    stroke: "#71717a",
    strokeWidth: 2,
    shadowColor: "#000000",
    shadowBlur: 6,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowOpacity: 0.2,
  },
  {
    id: "warm_cream",
    label: "따뜻한 크림",
    description: "아늑한 일상과 일상 대화",
    fill: "#fdf8e6",
    textFill: "#2b221a",
    stroke: "#544338",
    strokeWidth: 2.5,
  },
  {
    id: "pastel_pink",
    label: "설렘 핑크",
    description: "사랑스럽고 두근거리는 로맨스 씬",
    fill: "#fff0f5",
    textFill: "#d81b60",
    stroke: "#f48fb1",
    strokeWidth: 2.5,
    shadowColor: "#f48fb1",
    shadowBlur: 5,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowOpacity: 0.2,
  },
  {
    id: "action_red",
    label: "격앙 레드",
    description: "화남, 분노, 외침 씬",
    fill: "#ffebee",
    textFill: "#b71c1c",
    stroke: "#b71c1c",
    strokeWidth: 4,
    shadowColor: "#b71c1c",
    shadowBlur: 8,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowOpacity: 0.25,
  },
  {
    id: "horror_purple",
    label: "공포 퍼플",
    description: "기괴하고 오싹한 공포/미스터리 씬",
    fill: "#241335",
    textFill: "#cfd8dc",
    stroke: "#8e24aa",
    strokeWidth: 3,
    shadowColor: "#000000",
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 3,
    shadowOpacity: 0.35,
    font: "'East Sea Dokdo', cursive",
  },
  {
    id: "cyber_cyan",
    label: "네온 사이언",
    description: "SF, 기계음, 상태창 메신저",
    fill: "#0c0f1d",
    textFill: "#00f0ff",
    stroke: "#00f0ff",
    strokeWidth: 2.5,
    shadowColor: "#00f0ff",
    shadowBlur: 10,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowOpacity: 0.6,
  },
  {
    id: "phone_green",
    label: "모바일 메신저",
    description: "메신저 앱 스타일",
    fill: "#dcf8c6",
    textFill: "#075e54",
    stroke: "#c7e8ad",
    strokeWidth: 1.5,
  },
];
