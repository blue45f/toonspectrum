/**
 * 모션 웹툰 AI 자동 연출 (규칙 기반, 클라이언트 전용).
 *
 * 유료 AI API를 쓰지 않고, 감정 키워드 사전 + 컷 메타데이터로
 * 대사 감정 → BGM 분위기·음성 프리셋, 컷 구도 → 카메라 무브를 추천한다.
 * "AI 자동 연출" 버튼 하나로 회차 전체에 연출을 일괄 적용한 뒤
 * 사용자가 개별 수정할 수 있다.
 */

import type { VoiceCharacterPresetId } from "@/shared/voice/voice-character-presets";

import {
  clampCutDuration,
  defaultCutBgmCue,
  defaultCutDirection,
  type CameraMove,
  type CutDirection,
  type DialogueLine,
  type MotionCut,
  type MotionEpisode,
  type MotionSceneMood,
} from "./motion-webtoon-model";

/** 대사 감정. */
export type DetectedEmotion =
  | "anger"
  | "sorrow"
  | "joy"
  | "tension"
  | "romance"
  | "fear"
  | "surprise"
  | "neutral";

/** 감정별 키워드 사전 (한/영). */
const EMOTION_KEYWORDS: Record<Exclude<DetectedEmotion, "neutral">, readonly string[]> = {
  anger: [
    "화나", "분노", "짜증", "열받", "미치겠", "죽이", "용서 못", "배신",
    "angry", "furious", "rage", "damn", "hate", "betray",
  ],
  sorrow: [
    "슬프", "눈물", "울고", "미안", "외로", "그리워", "이별", "죽음", "아파",
    "sad", "cry", "tears", "sorry", "lonely", "miss", "farewell",
  ],
  joy: [
    "행복", "기쁘", "신나", "웃", "좋아", "최고", "사랑해", "축하",
    "happy", "joy", "excited", "laugh", "love", "great", "congrat",
  ],
  tension: [
    "긴장", "조심", "위험", "싸움", "전투", "공격", "도망", "숨",
    "tense", "careful", "danger", "fight", "battle", "attack", "run", "hide",
  ],
  romance: [
    "설레", "두근", "고백", "키스", "데이트", "첫사랑", "심쿵",
    "flutter", "confess", "kiss", "date", "heartbeat", "crush",
  ],
  fear: [
    "무서", "공포", "소름", "귀신", "괴물", "살려", "도망쳐",
    "scary", "fear", "horror", "ghost", "monster", "help",
  ],
  surprise: [
    "깜짝", "어머", "헉", "말도 안", "설마", "진짜?",
    "wow", "omg", "surprise", "really", "no way",
  ],
};

/** 감정 분석 우선순위 — 동점일 때 강한 감정을 우선한다. */
const EMOTION_PRIORITY: readonly DetectedEmotion[] = [
  "fear",
  "anger",
  "tension",
  "sorrow",
  "surprise",
  "romance",
  "joy",
  "neutral",
];

/** 대사 텍스트에서 감정을 분석한다. */
export function analyzeDialogueEmotion(text: string): DetectedEmotion {
  const normalized = text.toLowerCase();
  let best: DetectedEmotion = "neutral";
  let bestScore = 0;
  for (const emotion of EMOTION_PRIORITY) {
    if (emotion === "neutral") continue;
    const keywords = EMOTION_KEYWORDS[emotion];
    let score = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = emotion;
    }
  }
  return best;
}

/** 감정 → 씬 분위기. */
export function emotionToSceneMood(emotion: DetectedEmotion): MotionSceneMood {
  switch (emotion) {
    case "anger":
    case "tension":
      return "battle";
    case "sorrow":
      return "sad";
    case "joy":
      return "comedy";
    case "romance":
      return "romance";
    case "fear":
      return "horror";
    case "surprise":
      return "mystery";
    case "neutral":
      return "daily";
  }
}

/** 감정 → 음성 캐릭터 프리셋. */
export function emotionToVoicePreset(emotion: DetectedEmotion): VoiceCharacterPresetId {
  switch (emotion) {
    case "anger":
      return "passionate";
    case "tension":
    case "fear":
      return "dramatic";
    case "sorrow":
      return "mystic";
    case "joy":
      return "friendly";
    case "romance":
      return "mystic";
    case "surprise":
      return "passionate";
    case "neutral":
      return "narrator";
  }
}

/** 컷 구도 종류. */
export type ShotKind = "closeup" | "wide" | "action" | "dialogue" | "establishing";

/** 구도 → 카메라 무브 추천. */
export function suggestCameraMove(shotKind: ShotKind): CameraMove {
  switch (shotKind) {
    case "closeup":
      return "zoom-in";
    case "wide":
      return "zoom-out";
    case "action":
      return "shake";
    case "dialogue":
      return "pan-right";
    case "establishing":
      return "pan-down";
  }
}

/** 감정 → 대사 텍스트에 붙일 감정 마크업. */
export function emotionToMarkup(emotion: DetectedEmotion): string {
  switch (emotion) {
    case "anger":
      return "강조";
    case "sorrow":
      return "슬픔";
    case "joy":
      return "기쁨";
    case "tension":
      return "긴장";
    case "romance":
      return "신비";
    case "fear":
      return "긴장";
    case "surprise":
      return "놀람";
    case "neutral":
      return "";
  }
}

/** 컷의 대표 감정 — 대사들의 감정 중 가장 강한 것. */
export function dominantCutEmotion(cut: Pick<MotionCut, "dialogues">): DetectedEmotion {
  let best: DetectedEmotion = "neutral";
  let bestRank = EMOTION_PRIORITY.indexOf("neutral");
  for (const dialogue of cut.dialogues) {
    const emotion = analyzeDialogueEmotion(dialogue.text);
    const rank = EMOTION_PRIORITY.indexOf(emotion);
    if (rank < bestRank) {
      bestRank = rank;
      best = emotion;
    }
  }
  return best;
}

/** 컷 자동 연출 — 연출·BGM을 감정 기반으로 채운다. */
export function autoDirectCut(
  cut: MotionCut,
  options?: { readonly shotKind?: ShotKind },
): MotionCut {
  const emotion = dominantCutEmotion(cut);
  const sceneMood = emotionToSceneMood(emotion);
  const direction: CutDirection = {
    ...defaultCutDirection(),
    cameraMove: options?.shotKind ? suggestCameraMove(options.shotKind) : suggestCameraMove(emotionToShotKind(emotion)),
    intensity: emotion === "neutral" ? 0.35 : 0.65,
    durationSeconds: clampCutDuration(
      cut.direction.durationSeconds + cut.dialogues.length * 1.5,
    ),
  };
  const dialogues: DialogueLine[] = cut.dialogues.map((dialogue, index) => {
    const lineEmotion = analyzeDialogueEmotion(dialogue.text);
    const markup = emotionToMarkup(lineEmotion);
    return {
      ...dialogue,
      // 감정 마크업이 이미 있으면 유지하고, 없을 때만 추천 마크업을 붙인다.
      text: markup && !dialogue.text.includes("[") ? `[${markup}]${dialogue.text}[/${markup}]` : dialogue.text,
      startOffsetSeconds: index * 2.5,
    };
  });
  return {
    ...cut,
    direction,
    bgm: { ...defaultCutBgmCue(), sceneMood },
    dialogues,
  };
}

function emotionToShotKind(emotion: DetectedEmotion): ShotKind {
  switch (emotion) {
    case "anger":
    case "tension":
      return "action";
    case "sorrow":
    case "romance":
      return "closeup";
    case "joy":
    case "surprise":
      return "dialogue";
    case "fear":
      return "wide";
    case "neutral":
      return "establishing";
  }
}

/** 회차 전체 자동 연출. */
export function autoDirectEpisode(episode: MotionEpisode): MotionEpisode {
  return {
    ...episode,
    cuts: episode.cuts.map((cut) => autoDirectCut(cut)),
  };
}
