/**
 * 모션 웹툰 재생 컨트롤러.
 *
 * React·DOM에 의존하지 않는 재생 상태 머신. BGM 엔진·대사 스피커·타이머를
 * 포트로 주입받아 테스트에서 가짜 구현으로 교체할 수 있다.
 */

import { bgmEngine, type BgmMood } from "@/shared/bgm/bgm-engine";
import { unwireVoiceBgmDucking, wireVoiceBgmDucking } from "@/shared/voice/voice-bgm-ducking";

import type { VoiceCharacterPresetId } from "@/shared/voice/voice-character-presets";

import {
  clampCutDuration,
  sceneMoodToBgmMood,
  type DialogueLine,
  type MotionCut,
  type MotionEpisode,
} from "./motion-webtoon-model";
import { speakDialogueLine, stopDialogue, type DialogueSpeakHandle, type DialogueSpeakRequest } from "./motion-webtoon-dialogue-speaker";

/**
 * BGM 포트.
 * - playMood(): 재생 중이 아니면 시작하고, 재생 중이면 무드만 전환(크로스페이드).
 *   실제 엔진의 start()는 멱등이라 매 컷 호출해도 안전하다.
 */
export interface MotionBgmPort {
  playMood(mood: BgmMood): void;
  stop(): void;
}

/** 대사 스피커 포트. */
export interface MotionSpeakerPort {
  speak(request: DialogueSpeakRequest): DialogueSpeakHandle;
  stop(): void;
}

/** 타이머 포트. */
export interface MotionClockPort {
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export const realMotionClock: MotionClockPort = {
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

export type MotionPlaybackState = "idle" | "playing" | "paused" | "ended";

export type MotionPlaybackEvent =
  | { readonly type: "state-change"; readonly state: MotionPlaybackState }
  | { readonly type: "cut-change"; readonly cutIndex: number }
  | { readonly type: "dialogue-start"; readonly dialogue: DialogueLine }
  | { readonly type: "dialogue-end"; readonly dialogueId: string }
  | { readonly type: "ended" };

export interface MotionPlaybackDeps {
  readonly bgm: MotionBgmPort;
  readonly speaker: MotionSpeakerPort;
  readonly clock: MotionClockPort;
  /** 대사 음성 on/off. */
  readonly voiceEnabled: () => boolean;
  /** BGM on/off. */
  readonly bgmEnabled: () => boolean;
}

interface ScheduledTask {
  readonly id: number;
  readonly dialogue: DialogueLine;
}

/**
 * 회차 재생 컨트롤러.
 *
 * - play(): 사용자 제스처 안에서 호출해야 BGM AudioContext가 생성된다.
 * - 컷 전환 시 BGM 무드를 바꾸고(crossfade), 컷별 대사를 오프셋에 맞춰 발화한다.
 * - pause(): 타이머·음성을 멈추고 현재 컷 처음으로 되돌린다(간단한 시맨틱).
 */
export class MotionPlaybackController {
  private state: MotionPlaybackState = "idle";
  private episode: MotionEpisode | null = null;
  private cutIndex = 0;
  private cutTimer: number | null = null;
  private dialogueTasks: ScheduledTask[] = [];
  private activeDialogue: DialogueLine | null = null;
  private activeHandle: DialogueSpeakHandle | null = null;
  private listeners = new Set<(event: MotionPlaybackEvent) => void>();

  constructor(private readonly deps: MotionPlaybackDeps) {}

  onEvent(listener: (event: MotionPlaybackEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: MotionPlaybackEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  get playbackState(): MotionPlaybackState {
    return this.state;
  }

  get currentCutIndex(): number {
    return this.cutIndex;
  }

  get currentCut(): MotionCut | null {
    return this.episode?.cuts[this.cutIndex] ?? null;
  }

  get activeDialogueLine(): DialogueLine | null {
    return this.activeDialogue;
  }

  load(episode: MotionEpisode): void {
    this.stopTimers();
    this.episode = episode;
    this.cutIndex = 0;
    this.activeDialogue = null;
    this.setState("idle");
  }

  play(): void {
    if (!this.episode || this.episode.cuts.length === 0) return;
    if (this.state === "playing") return;
    if (this.state === "ended") {
      this.cutIndex = 0;
    }
    this.setState("playing");
    this.enterCut(this.cutIndex);
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.stopTimers();
    this.setState("paused");
  }

  stop(): void {
    this.stopTimers();
    this.deps.bgm.stop();
    this.deps.speaker.stop();
    this.activeDialogue = null;
    this.setState("idle");
  }

  nextCut(): void {
    if (!this.episode) return;
    if (this.cutIndex + 1 >= this.episode.cuts.length) {
      this.finish();
      return;
    }
    this.enterCut(this.cutIndex + 1);
  }

  prevCut(): void {
    if (this.cutIndex === 0) return;
    this.enterCut(this.cutIndex - 1);
  }

  seekCut(index: number): void {
    if (!this.episode) return;
    const clamped = Math.max(0, Math.min(this.episode.cuts.length - 1, index));
    this.enterCut(clamped);
  }

  private enterCut(index: number): void {
    const episode = this.episode;
    if (!episode) return;
    const cut = episode.cuts[index];
    if (!cut) return;
    this.stopTimers();
    this.cutIndex = index;
    this.activeDialogue = null;
    this.emit({ type: "cut-change", cutIndex: index });

    // BGM 큐 — 매 컷 playMood() 호출. 엔진이 멱등하게 처리하고
    // 무드가 바뀌었을 때만 2초 크로스페이드로 전환한다.
    if (this.deps.bgmEnabled()) {
      this.deps.bgm.playMood(sceneMoodToBgmMood(cut.bgm.sceneMood));
    }

    // 대사 스케줄.
    if (this.deps.voiceEnabled()) {
      const characterById = new Map(episode.characters.map((c) => [c.id, c]));
      for (const dialogue of cut.dialogues) {
        const character = characterById.get(dialogue.characterId);
        if (!character) continue;
        const id = this.deps.clock.setTimeout(() => {
          this.startDialogue(dialogue, character.presetId);
        }, Math.max(0, dialogue.startOffsetSeconds) * 1000);
        this.dialogueTasks.push({ id, dialogue });
      }
    }

    // 컷 종료 → 다음 컷.
    const durationMs = clampCutDuration(cut.direction.durationSeconds) * 1000;
    this.cutTimer = this.deps.clock.setTimeout(() => {
      this.nextCut();
    }, durationMs);
  }

  private startDialogue(dialogue: DialogueLine, presetId: VoiceCharacterPresetId): void {
    this.activeDialogue = dialogue;
    this.emit({ type: "dialogue-start", dialogue });
    this.activeHandle = this.deps.speaker.speak({
      text: dialogue.text,
      presetId,
    });
    void this.activeHandle.finished.then(() => {
      if (this.activeDialogue?.id === dialogue.id) {
        this.activeDialogue = null;
        this.emit({ type: "dialogue-end", dialogueId: dialogue.id });
      }
    });
  }

  private finish(): void {
    this.stopTimers();
    this.deps.speaker.stop();
    this.setState("ended");
    this.emit({ type: "ended" });
  }

  private stopTimers(): void {
    if (this.cutTimer !== null) {
      this.deps.clock.clearTimeout(this.cutTimer);
      this.cutTimer = null;
    }
    for (const task of this.dialogueTasks) {
      this.deps.clock.clearTimeout(task.id);
    }
    this.dialogueTasks = [];
    this.deps.speaker.stop();
    this.activeHandle?.cancel();
    this.activeHandle = null;
  }

  private setState(state: MotionPlaybackState): void {
    this.state = state;
    this.emit({ type: "state-change", state });
  }
}

/** 실제 엔진에 연결하는 기본 포트 어댑터. */
export function createRealMotionPlaybackDeps(options?: {
  readonly voiceEnabled?: () => boolean;
  readonly bgmEnabled?: () => boolean;
}): MotionPlaybackDeps {
  // BGM 엔진은 정적 import: 싱글턴 생성에 부작용이 없고,
  // 사용자 클릭(재생 버튼) 안에서 start()를 동기 호출해야 autoplay 정책을 통과한다.
  let duckingCleanup: (() => void) | null = null;
  let duckingWired = false;
  const wireDuckingOnce = () => {
    if (duckingWired) return;
    duckingWired = true;
    duckingCleanup?.();
    duckingCleanup = wireVoiceBgmDucking();
  };
  const bgm: MotionBgmPort = {
    playMood: (mood) => {
      // BgmEngine.start()는 멱등: 재생 중이면 무드만 전환(크로스페이드)한다.
      bgmEngine.start(mood);
      wireDuckingOnce();
    },
    stop: () => {
      bgmEngine.stop();
      duckingWired = false;
      duckingCleanup?.();
      duckingCleanup = null;
      unwireVoiceBgmDucking();
    },
  };
  const speaker: MotionSpeakerPort = {
    speak: (request) => speakDialogueLine(request),
    stop: () => stopDialogue(),
  };
  return {
    bgm,
    speaker,
    clock: realMotionClock,
    voiceEnabled: options?.voiceEnabled ?? (() => true),
    bgmEnabled: options?.bgmEnabled ?? (() => true),
  };
}
