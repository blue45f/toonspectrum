/**
 * 성우급 음성 캐릭터 프리셋.
 *
 * Web Speech API는 SSML을 지원하지 않으므로, 캐릭터별 rate/pitch/호흡(쉼)
 * 튜닝으로 성우 같은 느낌을 재현한다. 각 프리셋은 감정 마크업
 * (`voice-emotion-markup.ts`)과 함께 사용되며, 최종 발화 파라미터는
 * `voice-guide.ts`의 `speakWithCharacter()`에서 합성된다.
 */

/** 음성 캐릭터 프리셋 ID. */
export type VoiceCharacterPresetId =
  | "narrator"
  | "friendly"
  | "mystic"
  | "passionate"
  | "dramatic"
  | "artisan";

export interface VoiceCharacterPreset {
  readonly id: VoiceCharacterPresetId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 기본 읽기 속도 (0.5~1.5). */
  readonly rate: number;
  /** 기본 높낮이 (0~2). */
  readonly pitch: number;
  /** 문장 사이 쉼 (ms). */
  readonly sentencePauseMs: number;
  /** 단락 사이 쉼 (ms). */
  readonly paragraphPauseMs: number;
  /** 강조 구간 속도 배율 (1보다 작으면 느려진다). */
  readonly emphasisRateScale: number;
  /** 강조 구간 높낮이 변화량. */
  readonly emphasisPitchShift: number;
  /** 선호 음성 이름 힌트 — 고품질(neural/natural) 음성 우선 선택용. */
  readonly voiceHints: readonly string[];
}

export const VOICE_CHARACTER_PRESETS: Record<VoiceCharacterPresetId, VoiceCharacterPreset> = {
  narrator: {
    id: "narrator",
    nameKo: "내레이터",
    nameEn: "Narrator",
    descriptionKo: "차분하고 신뢰감 있는 표준 내레이션",
    descriptionEn: "Calm, trustworthy standard narration",
    rate: 0.95,
    pitch: 1.0,
    sentencePauseMs: 380,
    paragraphPauseMs: 800,
    emphasisRateScale: 0.9,
    emphasisPitchShift: -0.04,
    voiceHints: ["natural", "neural", "google", "samsung"],
  },
  friendly: {
    id: "friendly",
    nameKo: "친근한 가이드",
    nameEn: "Friendly guide",
    descriptionKo: "밝고 경쾌한 안내 음성",
    descriptionEn: "Bright and cheerful guidance",
    rate: 1.03,
    pitch: 1.1,
    sentencePauseMs: 320,
    paragraphPauseMs: 650,
    emphasisRateScale: 0.94,
    emphasisPitchShift: 0.06,
    voiceHints: ["natural", "neural", "google", "samsung"],
  },
  mystic: {
    id: "mystic",
    nameKo: "신비로운 예언자",
    nameEn: "Mystic oracle",
    descriptionKo: "느리고 깊이 있는 운세·스토리 낭독",
    descriptionEn: "Slow, deep fortune and story reading",
    rate: 0.8,
    pitch: 0.86,
    sentencePauseMs: 750,
    paragraphPauseMs: 1400,
    emphasisRateScale: 0.82,
    emphasisPitchShift: -0.1,
    voiceHints: ["natural", "neural", "google", "samsung"],
  },
  passionate: {
    id: "passionate",
    nameKo: "열정적인 크리에이터",
    nameEn: "Passionate creator",
    descriptionKo: "에너지 넘치는 창작 독려 음성",
    descriptionEn: "Energetic creative encouragement",
    rate: 1.1,
    pitch: 1.14,
    sentencePauseMs: 280,
    paragraphPauseMs: 600,
    emphasisRateScale: 0.92,
    emphasisPitchShift: 0.1,
    voiceHints: ["natural", "neural", "google", "samsung"],
  },
  dramatic: {
    id: "dramatic",
    nameKo: "드라마틱 낭독",
    nameEn: "Dramatic reading",
    descriptionKo: "기승전결이 살아있는 스토리 낭독",
    descriptionEn: "Story reading with dramatic arcs",
    rate: 0.88,
    pitch: 0.94,
    sentencePauseMs: 520,
    paragraphPauseMs: 1100,
    emphasisRateScale: 0.85,
    emphasisPitchShift: -0.08,
    voiceHints: ["natural", "neural", "google", "samsung"],
  },
  artisan: {
    id: "artisan",
    nameKo: "장인",
    nameEn: "Artisan",
    descriptionKo: "묵직하고 정교한 창작 도구 안내",
    descriptionEn: "Solid, precise creative-tool guidance",
    rate: 0.87,
    pitch: 0.9,
    sentencePauseMs: 450,
    paragraphPauseMs: 900,
    emphasisRateScale: 0.88,
    emphasisPitchShift: -0.06,
    voiceHints: ["natural", "neural", "google", "samsung"],
  },
};

export const VOICE_CHARACTER_PRESET_IDS = Object.keys(
  VOICE_CHARACTER_PRESETS,
) as VoiceCharacterPresetId[];

/** 기본 캐릭터: 내레이터. */
export const DEFAULT_VOICE_CHARACTER_PRESET_ID: VoiceCharacterPresetId = "narrator";

const PRESET_KEY = "ts_voice_character_preset";

function readStored(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing — 조용히 무시 */
  }
}

function isPresetId(value: string): value is VoiceCharacterPresetId {
  return (VOICE_CHARACTER_PRESET_IDS as readonly string[]).includes(value);
}

/** 저장된 음성 캐릭터 프리셋 ID를 반환한다. */
export function readVoiceCharacterPreset(): VoiceCharacterPresetId {
  const stored = readStored(PRESET_KEY);
  if (stored && isPresetId(stored)) return stored;
  return DEFAULT_VOICE_CHARACTER_PRESET_ID;
}

/** 음성 캐릭터 프리셋 ID를 저장한다. */
export function writeVoiceCharacterPreset(id: VoiceCharacterPresetId): void {
  writeStored(PRESET_KEY, id);
}

/** 프리셋 ID로 프리셋 정의를 반환한다. */
export function getVoiceCharacterPreset(id: VoiceCharacterPresetId): VoiceCharacterPreset {
  return VOICE_CHARACTER_PRESETS[id];
}

/** 프리셋 미리 듣기용 대표 문구 (ko/en). */
export function getVoiceCharacterPreviewText(id: VoiceCharacterPresetId, lang: string): string {
  const ko = lang.startsWith("ko");
  switch (id) {
    case "mystic":
      return ko
        ? "[신비]별들이 속삭이는 오늘의 운세[/신비]를 [강조]전해 드리겠습니다.[/강조]"
        : "Let me share [mystic]today's fortune whispered by the stars[/mystic].";
    case "dramatic":
      return ko
        ? "[긴장]문이 열리고,[/긴장] [쉼] 이야기가 시작됩니다."
        : "The door opens, and the story begins.";
    case "artisan":
      return ko
        ? "브러시의 결을 느껴보세요. [강조]필압에 따라 선이 살아납니다.[/강조]"
        : "Feel the texture of the brush. Lines come alive with pressure.";
    case "passionate":
      return ko
        ? "[기쁨]새로운 회차를 시작해 볼까요?[/기쁨] 지금 바로 도전해 보세요!"
        : "Shall we start a new episode? Take the challenge right now!";
    case "friendly":
      return ko
        ? "안녕하세요! [기쁨]툰스튜디오 사용법을 안내해 드릴게요.[/기쁨]"
        : "Hello! Let me guide you through ToonStudio.";
    case "narrator":
    default:
      return ko
        ? "툰스튜디오 음성 안내입니다. 이 목소리로 안내해 드립니다."
        : "This is the ToonStudio voice guide.";
  }
}
