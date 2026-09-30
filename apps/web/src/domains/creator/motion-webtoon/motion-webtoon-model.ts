/**
 * 모션 웹툰 도메인 모델.
 *
 * 정적 웹툰 컷에 연출(카메라 무브·전환 효과)·BGM 큐·대사 음성을 입혀
 * "모션 웹툰"으로 재생하기 위한 순수 데이터 모델 + 타임라인 계산.
 * 렌더링·오디오 엔진에 의존하지 않는다.
 */

import type { BgmMood } from "@/shared/bgm/bgm-engine";
import type { VoiceCharacterPresetId } from "@/shared/voice/voice-character-presets";

/** 씬 분위기 — BGM/연출 자동 추천의 기준. */
export type MotionSceneMood =
  | "battle"
  | "tension"
  | "romance"
  | "daily"
  | "sad"
  | "mystery"
  | "comedy"
  | "horror";

export const MOTION_SCENE_MOODS: readonly MotionSceneMood[] = [
  "battle",
  "tension",
  "romance",
  "daily",
  "sad",
  "mystery",
  "comedy",
  "horror",
] as const;

/** 카메라 연출. */
export type CameraMove =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "shake"
  | "static";

export const CAMERA_MOVES: readonly CameraMove[] = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "shake",
  "static",
] as const;

/** 컷 전환 효과. */
export type CutTransition =
  | "cut"
  | "fade"
  | "wipe-left"
  | "wipe-right"
  | "blur"
  | "flash";

export const CUT_TRANSITIONS: readonly CutTransition[] = [
  "cut",
  "fade",
  "wipe-left",
  "wipe-right",
  "blur",
  "flash",
] as const;

/** 컷 하나에 적용되는 연출. */
export interface CutDirection {
  /** 카메라 무브. */
  readonly cameraMove: CameraMove;
  /** 이 컷의 재생 길이(초). */
  readonly durationSeconds: number;
  /** 연출 강도 (0~1). shake 진폭·zoom 배율 등에 반영. */
  readonly intensity: number;
}

/** 대사 한 줄. */
export interface DialogueLine {
  readonly id: string;
  /** 말풍선 원문 (감정 마크업 포함 가능: [강조]...[/강조]). */
  readonly text: string;
  /** 발화 캐릭터 ID. */
  readonly characterId: string;
  /** 컷 시작 기준 대사 시작 시점(초). */
  readonly startOffsetSeconds: number;
}

/** 등장 캐릭터. */
export interface MotionCharacter {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly presetId: VoiceCharacterPresetId;
}

/** 컷별 BGM 큐. */
export interface CutBgmCue {
  readonly sceneMood: MotionSceneMood;
  /** 이전 BGM에서 전환할 때 크로스페이드(초). */
  readonly crossfadeSeconds: number;
}

/** 모션 웹툰 컷. */
export interface MotionCut {
  readonly id: string;
  readonly imageUrl: string;
  readonly altKo: string;
  readonly altEn: string;
  readonly direction: CutDirection;
  /** 이 컷으로 들어올 때의 전환 효과. */
  readonly transitionIn: CutTransition;
  readonly bgm: CutBgmCue;
  readonly dialogues: readonly DialogueLine[];
}

/** 모션 웹툰 회차. */
export interface MotionEpisode {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly characters: readonly MotionCharacter[];
  readonly cuts: readonly MotionCut[];
}

export const MOTION_CUT_MIN_DURATION_SECONDS = 2;
export const MOTION_CUT_MAX_DURATION_SECONDS = 30;
export const MOTION_CUT_DEFAULT_DURATION_SECONDS = 6;

/** 기본 컷 연출. */
export function defaultCutDirection(): CutDirection {
  return {
    cameraMove: "zoom-in",
    durationSeconds: MOTION_CUT_DEFAULT_DURATION_SECONDS,
    intensity: 0.5,
  };
}

/** 기본 BGM 큐. */
export function defaultCutBgmCue(): CutBgmCue {
  return { sceneMood: "daily", crossfadeSeconds: 2 };
}

/**
 * 씬 분위기 → BGM 엔진 무드 매핑.
 * shared/bgm 엔진을 수정하지 않고 도메인에서 매핑한다.
 */
export function sceneMoodToBgmMood(sceneMood: MotionSceneMood): BgmMood {
  switch (sceneMood) {
    case "battle":
      return "virtual"; // 활기찬 플럭 리듬
    case "tension":
      return "studio"; // 집중되는 마이너 아르페지오
    case "romance":
      return "home"; // 따뜻한 메이저 패드
    case "daily":
      return "material"; // 호기심 자극
    case "sad":
      return "draw"; // 몽환적
    case "mystery":
      return "draw";
    case "comedy":
      return "virtual";
    case "horror":
      return "studio";
  }
}

/** 타임라인 이벤트 종류. */
export type TimelineEventKind =
  | "cut-start"
  | "bgm-change"
  | "dialogue-start";

/** 재생 타임라인 이벤트. */
export interface TimelineEvent {
  readonly atSeconds: number;
  readonly kind: TimelineEventKind;
  readonly cutIndex: number;
  /** dialogue-start일 때만 존재. */
  readonly dialogueId?: string;
}

/**
 * 회차 전체의 재생 타임라인을 만든다.
 * 컷은 순차 재생되며, 각 컷 시작 시 BGM 큐·대사가 스케줄된다.
 */
export function buildTimeline(episode: MotionEpisode): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let cursor = 0;
  episode.cuts.forEach((cut, cutIndex) => {
    const duration = clampCutDuration(cut.direction.durationSeconds);
    events.push({ atSeconds: cursor, kind: "cut-start", cutIndex });
    events.push({ atSeconds: cursor, kind: "bgm-change", cutIndex });
    for (const dialogue of cut.dialogues) {
      const offset = Math.max(0, dialogue.startOffsetSeconds);
      if (offset < duration) {
        events.push({
          atSeconds: cursor + offset,
          kind: "dialogue-start",
          cutIndex,
          dialogueId: dialogue.id,
        });
      }
    }
    cursor += duration;
  });
  return events.sort((a, b) => a.atSeconds - b.atSeconds);
}

/** 회차 전체 재생 길이(초). */
export function episodeDurationSeconds(episode: MotionEpisode): number {
  return episode.cuts.reduce(
    (sum, cut) => sum + clampCutDuration(cut.direction.durationSeconds),
    0,
  );
}

export function clampCutDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MOTION_CUT_DEFAULT_DURATION_SECONDS;
  return Math.min(
    MOTION_CUT_MAX_DURATION_SECONDS,
    Math.max(MOTION_CUT_MIN_DURATION_SECONDS, seconds),
  );
}

export function clampIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) return 0.5;
  return Math.min(1, Math.max(0, intensity));
}

/** 검증 이슈. */
export interface MotionValidationIssue {
  readonly cutIndex: number;
  readonly messageKo: string;
  readonly messageEn: string;
}

/** 회차 데이터 검증 — 에디터에서 저장 전 경고용. */
export function validateMotionEpisode(episode: MotionEpisode): MotionValidationIssue[] {
  const issues: MotionValidationIssue[] = [];
  const characterIds = new Set(episode.characters.map((c) => c.id));
  episode.cuts.forEach((cut, cutIndex) => {
    if (!cut.imageUrl.trim()) {
      issues.push({
        cutIndex,
        messageKo: "컷 이미지가 비어 있습니다.",
        messageEn: "Cut image is empty.",
      });
    }
    for (const dialogue of cut.dialogues) {
      if (!dialogue.text.trim()) {
        issues.push({
          cutIndex,
          messageKo: "빈 대사가 있습니다.",
          messageEn: "There is an empty dialogue line.",
        });
      }
      if (!characterIds.has(dialogue.characterId)) {
        issues.push({
          cutIndex,
          messageKo: "등록되지 않은 캐릭터의 대사가 있습니다.",
          messageEn: "A dialogue line references an unknown character.",
        });
      }
    }
  });
  return issues;
}

/** 새 ID 생성 (저장 키·테스트 결정성용으로 주입 가능). */
export function createMotionId(prefix: string, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 6).toString(36);
  return `${prefix}-${suffix}`;
}
