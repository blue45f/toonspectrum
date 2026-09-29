/**
 * 페이지별 음성 안내 문구.
 *
 * 작성 원칙 (UX):
 * - 짧고 명확하게: 2문장 이내, 한국어 기준 120자 이내.
 * - 업계 용어 사용: 콘티·작화·채색·회차·원고·연재·마감·검수.
 * - 행동 유도 1개만 포함 (다음에 무엇을 하면 되는지).
 */

export type VoiceGuideScriptId = "home" | "studio" | "pricing" | "product-tour";

export interface VoiceGuideScript {
  readonly id: VoiceGuideScriptId;
  readonly ko: string;
  readonly en: string;
}

export const VOICE_GUIDE_SCRIPTS: Record<VoiceGuideScriptId, VoiceGuideScript> = {
  home: {
    id: "home",
    ko: "툰스튜디오에 오신 것을 환영합니다. 콘티, 작화, 채색부터 연재까지 — 웹툰 창작의 전 과정을 한 곳에서 시작해 보세요.",
    en: "Welcome to ToonStudio. From storyboards to artwork, coloring, and serialization — start your entire webtoon workflow in one place.",
  },
  studio: {
    id: "studio",
    ko: "크리에이터 스튜디오입니다. 새 작품을 만들고, 회차별 원고와 마감 일정을 관리할 수 있습니다. 왼쪽 도구 모음에서 브러시와 3D 데생 인형을 사용해 보세요.",
    en: "This is the creator studio. Create new works and manage episode manuscripts and deadlines. Try the brushes and 3D drawing figures in the left toolbar.",
  },
  pricing: {
    id: "pricing",
    ko: "요금제 안내입니다. 무료 플랜으로 창작 도구를 자유롭게 사용해 보고, 필요할 때 Pro로 업그레이드할 수 있습니다.",
    en: "Here are our plans. Start free with full creative tools, and upgrade to Pro whenever you need more.",
  },
  "product-tour": {
    id: "product-tour",
    ko: "툰스튜디오 기능 투어를 시작합니다. 기획, 작화, 협업, 출판까지 핵심 기능을 차례대로 소개해 드립니다.",
    en: "Starting the ToonStudio feature tour. We'll walk through planning, artwork, collaboration, and publishing step by step.",
  },
};

export const VOICE_GUIDE_SCRIPT_IDS = Object.keys(VOICE_GUIDE_SCRIPTS) as VoiceGuideScriptId[];

/** 현재 언어에 맞는 안내 문구를 반환한다. */
export function getVoiceGuideScript(id: VoiceGuideScriptId, lang: string): string {
  const script = VOICE_GUIDE_SCRIPTS[id];
  return lang.startsWith("ko") ? script.ko : script.en;
}
