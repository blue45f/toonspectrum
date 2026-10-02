import { describe, expect, it } from "vitest";

import { STUDIO_SPACE_EMOTES } from "./studio-virtual-space-emote-catalog";
import {
  startStudioEmotePlayback,
  studioColorHex,
  studioEmoteEffectiveTime,
  studioEmoteMotionTime,
  studioEmoteBodyMotion,
  studioEmoteBubbleScale,
  studioEmotePlaybackActive,
  studioEmotePose,
  studioSpeechBubbleAlpha,
  STUDIO_SPEECH_BUBBLE_FADE_IN_MS,
  STUDIO_SPEECH_BUBBLE_FADE_OUT_MS,
} from "./studio-virtual-space-emote-runtime";

describe("studio emote playback schedule", () => {
  it("같은 이모트 재요청은 애니메이션을 재시작한다", () => {
    const first = startStudioEmotePlayback("wave", 1_000);
    expect(first).toMatchObject({ id: "wave", startedAt: 1_000, sequence: 1, motion: "pop", expression: "wave" });
    const again = startStudioEmotePlayback("wave", 1_900, first?.sequence);
    expect(again).toMatchObject({ id: "wave", startedAt: 1_900, sequence: 2 });
    // 재시작 직후에는 팝인 초반이라 작게, 이전 시작 기준이었다면 이미 1이었을 시점이다.
    const restarted = studioEmotePose(again, 1_940, false);
    expect(restarted?.bubbleScale).toBeLessThan(1);
    expect(studioEmotePose(first, 1_940, false)?.bubbleScale).toBe(1);
    expect(startStudioEmotePlayback("wave", Number.NaN)).toBeNull();
    expect(startStudioEmotePlayback("nope" as never, 0)).toBeNull();
  });

  it("지속 시간이 끝나면 재생이 멈춘다", () => {
    const dance = startStudioEmotePlayback("dance", 0);
    expect(studioEmotePlaybackActive(dance, 3_999)).toBe(true);
    expect(studioEmotePlaybackActive(dance, 4_000)).toBe(false);
    expect(studioEmotePose(dance, 4_000, false)).toBeNull();
    expect(studioEmotePlaybackActive(null, 10)).toBe(false);
  });

  it("말풍선은 0에서 1.15를 거쳐 1로 자리 잡고, 끝에서 흐려지며 위로 뜬다", () => {
    expect(studioEmoteBubbleScale(0, false)).toBe(0);
    const samples = [20, 60, 120, 179, 200, 260, 319, 400].map((elapsed) => studioEmoteBubbleScale(elapsed, false));
    expect(Math.max(...samples)).toBeGreaterThanOrEqual(1.1);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.16);
    expect(samples.at(-1)).toBe(1);
    const heart = startStudioEmotePlayback("heart", 0);
    const early = studioEmotePose(heart, 500, false);
    const late = studioEmotePose(heart, 2_300, false);
    expect(early?.bubbleAlpha).toBe(1);
    expect(late?.bubbleAlpha).toBeLessThan(1);
    expect(late?.bubbleRise).toBeGreaterThan(early?.bubbleRise ?? 0);
  });

  it("reduced-motion이면 오프셋 0", () => {
    for (const emote of STUDIO_SPACE_EMOTES) {
      const playback = startStudioEmotePlayback(emote.id, 0);
      for (const time of [0, 150, 700, emote.durationMs - 1]) {
        const pose = studioEmotePose(playback, time, true);
        expect(pose, emote.id).toMatchObject({ bubbleScale: 1, bubbleAlpha: 1, bubbleRise: 0, bodyX: 0, bodyY: 0, bodyAngle: 0, facing: null });
      }
    }
  });

  it("몸동작은 종류마다 다르게 움직이고 춤은 0.18초마다 방향 프레임을 바꾼다", () => {
    expect(studioEmoteBodyMotion("hop", 150, 2_000, false).bodyY).toBeLessThan(-5);
    expect(studioEmoteBodyMotion("hop", 1_200, 2_000, false).bodyY).toBe(0);
    expect(Math.abs(studioEmoteBodyMotion("shake", 30, 2_000, false).bodyX)).toBeGreaterThan(0.5);
    expect(Math.abs(studioEmoteBodyMotion("sway", 350, 3_000, false).bodyAngle)).toBeGreaterThan(4);
    expect(studioEmoteBodyMotion("pop", 300, 2_000, false)).toEqual({ bodyX: 0, bodyY: 0, bodyAngle: 0, facing: null });
    const facings = [0, 180, 360, 540, 720].map((elapsed) => studioEmoteBodyMotion("dance", elapsed, 4_000, false).facing);
    expect(facings).toEqual(["down", "left", "up", "right", "down"]);
    expect(studioEmoteBodyMotion("dance", 4_000, 4_000, false).facing).toBeNull();
    expect(Math.abs(studioEmoteBodyMotion("doze", 400, 4_000, false).bodyY)).toBeGreaterThan(0);
  });

  it("표정 있는 이모트는 표정을 함께 알려 준다", () => {
    expect(studioEmotePose(startStudioEmotePlayback("laugh", 0), 10, false)?.expression).toBe("happy");
    expect(studioEmotePose(startStudioEmotePlayback("wow", 0), 10, false)?.expression).toBe("surprised");
    expect(studioEmotePose(startStudioEmotePlayback("sleep", 0), 10, false)?.expression).toBe("calm");
    expect(studioEmotePose(startStudioEmotePlayback("dance", 0), 10, false)?.expression).toBeNull();
  });

  it("Phaser 색 정수를 #rrggbb로 바꾼다", () => {
    expect(studioColorHex(0x0b101d)).toBe("#0b101d");
    expect(studioColorHex(0xb39bff)).toBe("#b39bff");
  });

  it("프레임이 아주 느려도 처음 몇 프레임은 다 펼쳐진 말풍선을 보여 준다", () => {
    const wave = startStudioEmotePlayback("wave", 1_000);
    if (!wave) throw new Error("wave playback");
    // 10초 뒤 첫 프레임이어도 다 펼쳐진 상태(320ms)로 묶여 보인다.
    const slow = studioEmoteEffectiveTime(wave, 11_000, 1);
    expect(studioEmotePose(wave, slow, false)?.bubbleScale).toBe(1);
    // 60fps에서는 실제 경과 시간을 그대로 쓴다.
    expect(studioEmoteEffectiveTime(wave, 1_016, 1)).toBe(1_016);
    // 최소 프레임을 채우면 실제 시간으로 끝난다.
    expect(studioEmotePose(wave, studioEmoteEffectiveTime(wave, 11_000, 4), false)).toBeNull();
    // 느린 프레임 동안 춤 방향은 한 주기 안에서 계속 바뀐다(한 자세로 굳지 않는다).
    const dance = startStudioEmotePlayback("dance", 0);
    if (!dance) throw new Error("dance playback");
    const facings = [9_000, 9_180, 9_360].map((time, frame) => studioEmotePose(dance,
      studioEmoteEffectiveTime(dance, time, frame), false, studioEmoteMotionTime(dance, time, frame))?.facing);
    expect(new Set(facings).size).toBeGreaterThan(1);
    expect(studioEmoteMotionTime(dance, 1_000, 0)).toBe(1_000);
  });
});

describe("말풍선 페이드 (studioSpeechBubbleAlpha)", () => {
  const timed = { shownAtMs: 1_000, expiresAtMs: 6_000 };

  it("시간 무지정 표시는 항상 1이다", () => {
    expect(studioSpeechBubbleAlpha({ shownAtMs: null, expiresAtMs: null }, 5_000)).toBe(1);
    expect(studioSpeechBubbleAlpha(timed, Number.NaN)).toBe(1);
  });

  it("나타난 직후 페이드 인하고 중간에는 1을 유지한다", () => {
    expect(studioSpeechBubbleAlpha(timed, 1_000)).toBe(0);
    expect(studioSpeechBubbleAlpha(timed, 1_000 + STUDIO_SPEECH_BUBBLE_FADE_IN_MS / 2)).toBeCloseTo(0.5);
    expect(studioSpeechBubbleAlpha(timed, 1_000 + STUDIO_SPEECH_BUBBLE_FADE_IN_MS)).toBe(1);
    expect(studioSpeechBubbleAlpha(timed, 3_000)).toBe(1);
  });

  it("만료가 가까우면 페이드 아웃하고 만료를 넘기면 0이다", () => {
    expect(studioSpeechBubbleAlpha(timed, 6_000 - STUDIO_SPEECH_BUBBLE_FADE_OUT_MS)).toBe(1);
    expect(studioSpeechBubbleAlpha(timed, 6_000 - STUDIO_SPEECH_BUBBLE_FADE_OUT_MS / 2)).toBeCloseTo(0.5);
    expect(studioSpeechBubbleAlpha(timed, 6_000)).toBe(0);
    expect(studioSpeechBubbleAlpha(timed, 9_000)).toBe(0);
  });

  it("만료가 없는 시간 지정 표시는 페이드 아웃하지 않는다", () => {
    expect(studioSpeechBubbleAlpha({ shownAtMs: 0, expiresAtMs: null }, 60_000)).toBe(1);
  });
});
