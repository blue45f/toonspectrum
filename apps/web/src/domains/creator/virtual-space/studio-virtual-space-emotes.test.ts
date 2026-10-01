import { describe, expect, it } from "vitest";
import {
  IDLE_EMOTE_STATE,
  STUDIO_EMOTES,
  startStudioEmote,
  stepStudioEmote,
  stopStudioEmote,
  studioEmoteByShortcut,
  studioEmoteDefinition,
  studioEmoteKindForKey,
  studioEmoteRenderHint,
} from "./studio-virtual-space-emotes";

const base = { time: 1_000, moving: false, reducedMotion: false };

describe("이모트 정의", () => {
  it("10종의 이모트가 한/영 라벨과 아이콘을 가진다", () => {
    expect(STUDIO_EMOTES).toHaveLength(10);
    for (const emote of STUDIO_EMOTES) {
      expect(emote.labelKo.trim().length).toBeGreaterThan(0);
      expect(emote.labelEn.trim().length).toBeGreaterThan(0);
      expect(emote.icon.trim().length).toBeGreaterThan(0);
    }
  });

  it("Z키는 춤추기, 숫자는 순서대로 매칭된다", () => {
    expect(studioEmoteKindForKey("Z")).toBe("dance");
    expect(studioEmoteKindForKey("z")).toBe("dance");
    expect(studioEmoteKindForKey("1")).toBe("wave");
    expect(studioEmoteKindForKey("9")).toBe("celebrate");
    expect(studioEmoteKindForKey("0")).toBeNull();
    expect(studioEmoteKindForKey("Enter")).toBeNull();
  });

  it("없는 이모트 조회는 null이다", () => {
    expect(studioEmoteDefinition("unknown" as never)).toBeNull();
    expect(studioEmoteByShortcut("Q")).toBeNull();
  });
});

describe("이모트 시작", () => {
  it("이모트를 시작하면 active에 kind가 들어간다", () => {
    const state = startStudioEmote(null, { ...base, kind: "wave" });
    expect(state.active).toBe("wave");
    expect(state.startedAt).toBe(1_000);
  });

  it("같은 이모트를 다시 누르면 토글로 종료된다", () => {
    const started = startStudioEmote(null, { ...base, kind: "dance" });
    const toggled = startStudioEmote(started, { ...base, time: 2_000, kind: "dance" });
    expect(toggled.active).toBeNull();
  });

  it("다른 이모트는 교체된다", () => {
    const started = startStudioEmote(null, { ...base, kind: "dance" });
    const swapped = startStudioEmote(started, { ...base, time: 2_000, kind: "wave" });
    expect(swapped.active).toBe("wave");
  });

  it("이동 중에는 이동 불가 이모트가 시작되지 않는다", () => {
    const state = startStudioEmote(null, { ...base, moving: true, kind: "dance" });
    expect(state.active).toBeNull();
    const clap = startStudioEmote(null, { ...base, moving: true, kind: "clap" });
    expect(clap.active).toBe("clap");
  });

  it("reduced-motion에서는 루프형 이모트가 시작되지 않는다", () => {
    const state = startStudioEmote(null, { ...base, reducedMotion: true, kind: "sleep" });
    expect(state.active).toBeNull();
    const wave = startStudioEmote(null, { ...base, reducedMotion: true, kind: "wave" });
    expect(wave.active).toBe("wave");
  });
});

describe("이모트 진행", () => {
  it("단발형은 duration 후 자동 종료된다", () => {
    const started = startStudioEmote(null, { ...base, kind: "wave" });
    expect(stepStudioEmote(started, { time: 2_000, moving: false }).active).toBe("wave");
    expect(stepStudioEmote(started, { time: 2_800, moving: false }).active).toBeNull();
  });

  it("루프형은 시간이 지나도 유지된다", () => {
    const started = startStudioEmote(null, { ...base, kind: "dance" });
    expect(stepStudioEmote(started, { time: 60_000, moving: false }).active).toBe("dance");
  });

  it("이동 시작 시 이동 불가 이모트는 종료된다", () => {
    const started = startStudioEmote(null, { ...base, kind: "dance" });
    expect(stepStudioEmote(started, { time: 2_000, moving: true }).active).toBeNull();
  });

  it("stopStudioEmote로 강제 종료된다", () => {
    const started = startStudioEmote(null, { ...base, kind: "dance" });
    expect(stopStudioEmote(started, 5_000)).toEqual({ active: null, startedAt: 5_000, lastTime: 5_000 });
    expect(stopStudioEmote(null, 5_000).active).toBeNull();
  });

  it("IDLE 상태에서는 step이 그대로 유지된다", () => {
    expect(stepStudioEmote(IDLE_EMOTE_STATE, { time: 9_999, moving: false })).toBe(IDLE_EMOTE_STATE);
  });
});

describe("이모트 렌더 힌트", () => {
  it("10종 모두 렌더 힌트를 제공한다", () => {
    for (const emote of STUDIO_EMOTES) {
      const hint = studioEmoteRenderHint(emote.kind);
      expect(hint).toBeDefined();
    }
  });

  it("종별로 팔 자세·호흡 오프셋·파티클이 다르다", () => {
    expect(studioEmoteRenderHint("wave")).toEqual({ armPose: "wave", particle: "sparkle" });
    expect(studioEmoteRenderHint("dance")).toEqual({ bobOffset: -6, particle: "music" });
    expect(studioEmoteRenderHint("clap")).toEqual({ armPose: "clap" });
    expect(studioEmoteRenderHint("cheer")).toEqual({ armPose: "raised", bobOffset: -8, particle: "hearts" });
    expect(studioEmoteRenderHint("laugh")).toEqual({ bobOffset: -4, particle: "sparkle" });
    expect(studioEmoteRenderHint("bow")).toEqual({ armPose: "bowed", bobOffset: 6 });
    expect(studioEmoteRenderHint("think")).toEqual({ armPose: "chin", particle: "sweat" });
    expect(studioEmoteRenderHint("sit")).toEqual({ bobOffset: 10 });
    expect(studioEmoteRenderHint("sleep")).toEqual({ bobOffset: 4, particle: "zzz" });
    expect(studioEmoteRenderHint("celebrate")).toEqual({ armPose: "raised", bobOffset: -6, particle: "confetti" });
  });

  it("프로시저럴 프레임 힌트가 undefined가 아니다", () => {
    expect(studioEmoteRenderHint("unknown" as never)).toEqual({});
  });
});
