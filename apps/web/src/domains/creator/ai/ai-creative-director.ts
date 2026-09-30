import type {
  StudioServerAiStatus,
  StudioServerAiTask,
} from "../studio-server-ai-client";

/**
 * AI 크리에이티브 디렉터(Luna) 제안 목록과 요청 조립 규칙.
 *
 * 화면 컴포넌트와 분리한 순수 모듈이다. 실제 응답은 항상 서버 무료 AI 또는 사용자가 연결한
 * 개인 키에서 오며, 이 모듈은 예시 결과를 만들지 않는다.
 */
export interface BilingualCopy {
  readonly ko: string;
  readonly en: string;
}

export type AiDirectorSuggestionId =
  | "story-expand"
  | "character-analysis"
  | "scene-composition"
  | "direction-style"
  | "localize";

export type AiDirectorIcon = "story" | "character" | "composition" | "direction" | "translation";

export interface AiDirectorSuggestion {
  readonly id: AiDirectorSuggestionId;
  readonly task: StudioServerAiTask;
  readonly icon: AiDirectorIcon;
  readonly title: BilingualCopy;
  readonly description: BilingualCopy;
  /** 입력칸 안내 문구. */
  readonly placeholder: BilingualCopy;
  /** "예시 넣기"로 채우는 입력 예. AI 결과가 아니라 사용자가 고칠 수 있는 출발 문장이다. */
  readonly example: BilingualCopy;
  /** AI 없이도 같은 일을 이어갈 수 있는 실제 도구. */
  readonly tool: { readonly href: string; readonly label: BilingualCopy };
  /** 공급자에게 보내는 역할 지시(영문 고정). */
  readonly instruction: string;
}

export const AI_DIRECTOR_INPUT_LIMIT = 1_200;

export const AI_DIRECTOR_SUGGESTIONS: readonly AiDirectorSuggestion[] = Object.freeze([
  {
    id: "story-expand",
    task: "scenario",
    icon: "story",
    title: { ko: "스토리 확장하기", en: "Expand a story" },
    description: {
      ko: "한 줄 아이디어를 회차 흐름·갈등·반전으로 넓혀요.",
      en: "Grow a one-line idea into episode beats, conflict and a twist.",
    },
    placeholder: {
      ko: "예: 비 오는 날, 우산을 같이 쓰게 된 두 사람의 첫 만남",
      en: "e.g. Two strangers share an umbrella on a rainy day",
    },
    example: {
      ko: "비 오는 날, 우산을 같이 쓰게 된 두 사람의 첫 만남. 한 명은 비밀을 숨기고 있다.",
      en: "Two strangers share an umbrella on a rainy day. One of them is hiding a secret.",
    },
    tool: { href: "/story-lab", label: { ko: "스토리 랩에서 직접 정리", en: "Outline it in Story Lab" } },
    instruction:
      "Expand the artist's idea into a short webtoon story outline: logline, three to five episode beats, the central conflict, and one twist. Keep every character and setting original.",
  },
  {
    id: "character-analysis",
    task: "assistant",
    icon: "character",
    title: { ko: "캐릭터 설정 분석", en: "Analyze a character" },
    description: {
      ko: "성격·목표·관계의 빈틈과 모순을 짚어 줘요.",
      en: "Spot gaps and contradictions in personality, goals and relationships.",
    },
    placeholder: {
      ko: "예: 서아린, 17세. 겉으론 무심하지만 동생에게만 다정하다.",
      en: "e.g. Arin, 17. Cold on the outside, gentle only with her brother.",
    },
    example: {
      ko: "서아린, 17세. 누구보다 강하지만 겉으론 무심하다. 동생에게만 다정하고, 밤마다 혼자 검술을 연습한다.",
      en: "Arin, 17. Stronger than anyone but acts indifferent. Gentle only with her younger brother and trains alone every night.",
    },
    tool: {
      href: "/studio/assets/characters/new",
      label: { ko: "캐릭터 스튜디오 열기", en: "Open Character Studio" },
    },
    instruction:
      "Analyze the character sheet: summarize the core personality, list motivations and fears, point out contradictions or missing details, and suggest two relationship hooks and three signature expressions to draw.",
  },
  {
    id: "scene-composition",
    task: "composition",
    icon: "composition",
    title: { ko: "장면 구도 추천", en: "Suggest a composition" },
    description: {
      ko: "컷 나누기·카메라 앵글·시선 흐름을 제안해요.",
      en: "Propose panel splits, camera angles and reading flow.",
    },
    placeholder: {
      ko: "예: 옥상에서 고백 직전, 바람에 머리카락이 흩날리는 장면",
      en: "e.g. A rooftop right before a confession, hair blowing in the wind",
    },
    example: {
      ko: "옥상에서 고백 직전. 바람에 머리카락이 흩날리고, 두 사람 사이에 긴 침묵이 흐른다.",
      en: "A rooftop right before a confession. Hair blows in the wind and a long silence hangs between them.",
    },
    tool: { href: "/studio/poser", label: { ko: "포즈 스튜디오에서 구도 잡기", en: "Block it in Pose Studio" } },
    instruction:
      "Propose a vertical-scroll webtoon composition for the scene: three to five panels with shot size, camera angle, character placement, the reader's eye path, and where speech balloons should sit.",
  },
  {
    id: "direction-style",
    task: "assistant",
    icon: "direction",
    title: { ko: "웹툰 연출 스타일 제안", en: "Suggest a directing style" },
    description: {
      ko: "칸 호흡·효과선·색감 톤을 장르에 맞춰 제안해요.",
      en: "Match pacing, effect lines and color mood to the genre.",
    },
    placeholder: {
      ko: "예: 긴장감 있는 골목 추격 장면을 세로 스크롤로 보여주고 싶어요",
      en: "e.g. A tense alley chase told through vertical scrolling",
    },
    example: {
      ko: "밤 골목 추격 장면. 긴장감을 높이다가 마지막 컷에서 반전을 보여주고 싶어요.",
      en: "A night alley chase. Build tension, then reveal a twist in the final panel.",
    },
    tool: { href: "/studio/motion-webtoon", label: { ko: "모션 웹툰에서 타이밍 보기", en: "Time it in Motion Webtoon" } },
    instruction:
      "Suggest a webtoon directing style for the request: scroll pacing and white space, panel rhythm, effect lines or sound-effect lettering, and a color and lighting mood. Explain why each choice fits the genre.",
  },
  {
    id: "localize",
    task: "translation",
    icon: "translation",
    title: { ko: "번역 & 현지화", en: "Translate & localize" },
    description: {
      ko: "대사의 말맛을 살린 다른 언어 초안을 만들어요.",
      en: "Draft dialogue in another language while keeping its voice.",
    },
    placeholder: {
      ko: "예: 영어로 — 내일도 여기서 만날래?",
      en: "e.g. To Korean — Will you meet me here tomorrow too?",
    },
    example: {
      ko: "영어로 번역해 주세요: 내일도 여기서 만날래? 이번엔 내가 먼저 올게.",
      en: "Translate into Korean: Will you meet me here tomorrow too? This time I'll come first.",
    },
    tool: {
      href: "/studio/ecosystem#ecosystem-localization",
      label: { ko: "번역 관리에서 승인하기", en: "Approve it in Localization" },
    },
    instruction:
      "Translate the webtoon dialogue into the target language the artist names (default to English if none). Keep the speaker's tone and brevity for speech balloons, give one alternative line, and flag any cultural nuance.",
  },
] satisfies readonly AiDirectorSuggestion[]);

export function findAiDirectorSuggestion(id: string | null | undefined): AiDirectorSuggestion | undefined {
  return AI_DIRECTOR_SUGGESTIONS.find((suggestion) => suggestion.id === id);
}

export interface AiDirectorRequest {
  readonly task: StudioServerAiTask;
  readonly system: string;
  readonly user: string;
}

/**
 * 제안 종류와 사용자 입력으로 실제 AI 요청을 만든다. 입력이 비어 있으면 요청을 만들지 않는다.
 * 응답 언어는 현재 화면 언어를 따른다.
 */
export function buildAiDirectorRequest(
  suggestionId: AiDirectorSuggestionId,
  idea: string,
  language: string,
): AiDirectorRequest | null {
  const suggestion = findAiDirectorSuggestion(suggestionId);
  const normalized = idea.replace(/\s+/gu, " ").trim().slice(0, AI_DIRECTOR_INPUT_LIMIT);
  if (!suggestion || !normalized) return null;
  const answerLanguage = language.toLowerCase().startsWith("ko") ? "Korean" : "English";
  return {
    task: suggestion.task,
    system: [
      "You are Luna, the AI creative director inside ToonStudio, a webtoon creation studio.",
      suggestion.instruction,
      "Give original, practical suggestions the artist can act on right away. Never imitate existing copyrighted works, characters, or a real artist's style.",
      "Use short headings and bullet points and stay under 250 words.",
      `Answer in ${answerLanguage}.`,
    ].join("\n"),
    user: `Request: ${suggestion.title.en}\nArtist input:\n${normalized}`,
  };
}

export type AiDirectorAvailability =
  | { readonly state: "checking"; readonly canSubmit: false }
  | { readonly state: "server"; readonly canSubmit: true; readonly model: string }
  | { readonly state: "personal"; readonly canSubmit: true }
  | { readonly state: "login"; readonly canSubmit: false }
  | { readonly state: "unavailable"; readonly canSubmit: false };

/**
 * 서버 상태 확인 결과와 개인 무료 키 연결 수로 요청 가능 여부를 정한다.
 * 서버가 준비되지 않았고 개인 키도 없으면 요청 버튼을 막고 대안을 보여준다.
 */
export function resolveAiDirectorAvailability(input: {
  readonly status: StudioServerAiStatus | null;
  readonly statusFailed: boolean;
  readonly personalRoutes: number;
  readonly signedIn: boolean;
}): AiDirectorAvailability {
  const { status, statusFailed, personalRoutes, signedIn } = input;
  if (status?.configured && (!status.requiresAuth || signedIn)) {
    return { state: "server", canSubmit: true, model: status.model };
  }
  if (personalRoutes > 0) return { state: "personal", canSubmit: true };
  if (status?.configured) return { state: "login", canSubmit: false };
  if (!status && !statusFailed) return { state: "checking", canSubmit: false };
  return { state: "unavailable", canSubmit: false };
}
