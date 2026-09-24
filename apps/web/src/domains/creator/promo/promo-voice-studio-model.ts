export const PROMO_VOICE_PRESET_IDS = [
  "natural",
  "cinematic",
  "calm",
  "energetic",
] as const;
export type PromoVoicePresetId = (typeof PROMO_VOICE_PRESET_IDS)[number];

export const PROMO_VOICE_GENDERS = ["female", "male", "neutral"] as const;
export type PromoVoiceGender = (typeof PROMO_VOICE_GENDERS)[number];

export const PROMO_VOICE_CAPTION_MODES = [
  "scene",
  "voice",
  "karaoke",
  "none",
] as const;
export type PromoVoiceCaptionMode = (typeof PROMO_VOICE_CAPTION_MODES)[number];

export interface PromoPronunciation {
  id: string;
  source: string;
  spoken: string;
}

export interface PromoVoiceSpeaker {
  id: string;
  name: string;
  gender: PromoVoiceGender;
  voiceKey: string;
  presetId: PromoVoicePresetId;
  rate: number;
  pitch: number;
  volume: number;
}

export interface PromoVoiceClip {
  id: string;
  speakerId: string;
  panelId?: string;
  text: string;
  startSec: number;
  durationSec: number;
}

export interface PromoVoiceStudio {
  version: 1;
  speakers: PromoVoiceSpeaker[];
  clips: PromoVoiceClip[];
  pronunciations: PromoPronunciation[];
  captionMode: PromoVoiceCaptionMode;
}

export interface PromoMixer {
  masterVolume: number;
  ducking: number;
  attackSec: number;
  releaseSec: number;
}

export const PROMO_DEFAULT_MIXER: PromoMixer = Object.freeze({
  masterVolume: 1,
  ducking: 0.72,
  attackSec: 0.25,
  releaseSec: 0.35,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function requiredRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function boundedText(value: unknown, max: number, message: string): string {
  if (typeof value !== "string" || value.length > max) throw new Error(message);
  return value.trim();
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  message: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(message);
  }
  return value;
}

function member<T extends string>(
  value: unknown,
  choices: readonly T[],
  message: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error(message);
  return value as T;
}

function safeId(value: unknown, seen: Set<string>, label: string): string {
  const id = boundedText(value, 80, `${label} ID가 올바르지 않아요.`);
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(id) || seen.has(id)) {
    throw new Error(`${label} ID가 없거나 중복되었어요.`);
  }
  seen.add(id);
  return id;
}

export function promoMixer(
  value: { mixer?: PromoMixer } | null | undefined,
): PromoMixer {
  return { ...PROMO_DEFAULT_MIXER, ...(value?.mixer ?? {}) };
}

export function parsePromoMixer(value: unknown): PromoMixer {
  const mixer = requiredRecord(value, "오디오 믹서 설정이 올바르지 않아요.");
  return {
    masterVolume: boundedNumber(mixer.masterVolume, 0, 1, "마스터 음량이 올바르지 않아요."),
    ducking: boundedNumber(mixer.ducking, 0, 0.95, "BGM 감쇠 설정이 올바르지 않아요."),
    attackSec: boundedNumber(mixer.attackSec, 0.01, 2, "BGM 감쇠 시작 시간이 올바르지 않아요."),
    releaseSec: boundedNumber(mixer.releaseSec, 0.01, 3, "BGM 복귀 시간이 올바르지 않아요."),
  };
}

export function parsePromoVoiceStudio(
  value: unknown,
  projectSeconds: number,
): PromoVoiceStudio {
  const studio = requiredRecord(value, "음성 스튜디오 형식이 올바르지 않아요.");
  if (
    studio.version !== 1
    || !Array.isArray(studio.speakers)
    || !Array.isArray(studio.clips)
    || !Array.isArray(studio.pronunciations)
  ) {
    throw new Error("음성 스튜디오 형식이 올바르지 않아요.");
  }
  if (
    studio.speakers.length < 1
    || studio.speakers.length > 12
    || studio.clips.length > 48
    || studio.pronunciations.length > 64
  ) {
    throw new Error("화자·대사·발음 사전 수가 허용 범위를 벗어났어요.");
  }

  const speakerIds = new Set<string>();
  const speakers = studio.speakers.map((input): PromoVoiceSpeaker => {
    const speaker = requiredRecord(input, "화자 설정이 올바르지 않아요.");
    return {
      id: safeId(speaker.id, speakerIds, "화자"),
      name: boundedText(speaker.name, 50, "화자 이름이 올바르지 않아요."),
      gender: member(speaker.gender, PROMO_VOICE_GENDERS, "화자 성별 설정이 올바르지 않아요."),
      voiceKey: boundedText(speaker.voiceKey, 500, "시스템 음성 설정이 올바르지 않아요."),
      presetId: member(speaker.presetId, PROMO_VOICE_PRESET_IDS, "음성 프리셋이 올바르지 않아요."),
      rate: boundedNumber(speaker.rate, 0.65, 1.55, "말하기 속도가 올바르지 않아요."),
      pitch: boundedNumber(speaker.pitch, 0.7, 1.35, "음성 높낮이가 올바르지 않아요."),
      volume: boundedNumber(speaker.volume, 0, 1, "화자 음량이 올바르지 않아요."),
    };
  });

  const clipIds = new Set<string>();
  const clips = studio.clips.map((input): PromoVoiceClip => {
    const clip = requiredRecord(input, "대사 클립이 올바르지 않아요.");
    const id = safeId(clip.id, clipIds, "대사");
    if (typeof clip.speakerId !== "string" || !speakerIds.has(clip.speakerId)) {
      throw new Error("대사에 연결된 화자를 찾지 못했어요.");
    }
    const startSec = boundedNumber(clip.startSec, 0, projectSeconds, "대사 시작 시간이 올바르지 않아요.");
    const durationSec = boundedNumber(clip.durationSec, 0.1, projectSeconds, "대사 길이가 올바르지 않아요.");
    if (startSec + durationSec > projectSeconds + 0.001) {
      throw new Error("대사 구간이 영상 길이를 벗어났어요.");
    }
    return {
      id,
      speakerId: clip.speakerId,
      ...(clip.panelId === undefined
        ? {}
        : { panelId: boundedText(clip.panelId, 80, "대사 장면 연결이 올바르지 않아요.") }),
      text: boundedText(clip.text, 1_000, "대사 길이가 너무 길어요."),
      startSec,
      durationSec,
    };
  });

  const pronunciationIds = new Set<string>();
  const pronunciations = studio.pronunciations.map((input): PromoPronunciation => {
    const entry = requiredRecord(input, "발음 사전 항목이 올바르지 않아요.");
    const id = safeId(entry.id, pronunciationIds, "발음 사전");
    const source = boundedText(entry.source, 120, "발음 사전 원문이 올바르지 않아요.");
    const spoken = boundedText(entry.spoken, 120, "읽는 법이 올바르지 않아요.");
    return { id, source, spoken };
  });

  return {
    version: 1,
    speakers,
    clips,
    pronunciations,
    captionMode: member(
      studio.captionMode,
      PROMO_VOICE_CAPTION_MODES,
      "자막 원본 설정이 올바르지 않아요.",
    ),
  };
}
