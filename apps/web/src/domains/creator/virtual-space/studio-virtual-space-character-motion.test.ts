import { describe, expect, it } from "vitest";

import {
  createMotionStateMachine,
  motionBlendFactor,
  motionKindToLegacyState,
  motionOneShotFinished,
  requestMotionState,
  resolveAvatarEmotion,
  sampleCustomSheetMotionCell,
  sampleMotionRender,
  studioEmotionFace,
  studioEmotionFromEmote,
  studioEmotionFromUserStatus,
  STUDIO_EMOTION_KINDS,
  STUDIO_MOTION_KINDS,
  STUDIO_MOTION_PROFILES,
  type StudioMotionKind,
} from "./studio-virtual-space-character-motion";
import { spriteSheetConfigSchema } from "./studio-virtual-space-sprite-sheet";

const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function sheetConfig() {
  return spriteSheetConfigSchema.parse({
    image: IMAGE,
    frameWidth: 48,
    frameHeight: 48,
    framesPerDirection: 4,
    directionCount: 4,
  });
}

describe("감정 API", () => {
  it("6종 감정의 표정 데이터를 정의한다", () => {
    expect(STUDIO_EMOTION_KINDS).toHaveLength(6);
    expect(studioEmotionFace("joy")).toMatchObject({ eyes: "joyful", mouth: "grin", blush: true });
    expect(studioEmotionFace("sadness")).toMatchObject({ eyes: "sad", mouth: "frown", tear: true });
    expect(studioEmotionFace("surprise")).toMatchObject({ eyes: "surprised", mouth: "open", sweat: true });
    expect(studioEmotionFace("sleep")).toMatchObject({ eyes: "closed", zzz: true });
    expect(studioEmotionFace("focus")).toMatchObject({ eyes: "focused", mouth: "flat" });
    expect(studioEmotionFace("neutral")).toMatchObject({ eyes: "open", mouth: "smile" });
  });

  it("이모트를 감정으로 바꾼다", () => {
    expect(studioEmotionFromEmote("laugh")).toBe("joy");
    expect(studioEmotionFromEmote("dance")).toBe("joy");
    expect(studioEmotionFromEmote("wow")).toBe("surprise");
    expect(studioEmotionFromEmote("question")).toBe("surprise");
    expect(studioEmotionFromEmote("think")).toBe("focus");
    expect(studioEmotionFromEmote("sleep")).toBe("sleep");
    expect(studioEmotionFromEmote("coffee")).toBe("neutral");
    expect(studioEmotionFromEmote(null)).toBe("neutral");
  });

  it("사용자 상태를 감정으로 바꾼다", () => {
    expect(studioEmotionFromUserStatus("in-meeting")).toBe("focus");
    expect(studioEmotionFromUserStatus("away")).toBe("sleep");
    expect(studioEmotionFromUserStatus("break")).toBe("sleep");
    expect(studioEmotionFromUserStatus("available")).toBe("neutral");
    expect(studioEmotionFromUserStatus(null)).toBe("neutral");
  });

  it("presence 연동: 유효한 이모트가 상태보다 우선한다", () => {
    // laugh 이모트 TTL 2400ms 안
    expect(resolveAvatarEmotion({ emote: "laugh", emoteStartedAt: 1000, userStatus: "in-meeting", now: 2000 })).toBe("joy");
    // 만료되면 사용자 상태 감정으로
    expect(resolveAvatarEmotion({ emote: "laugh", emoteStartedAt: 1000, userStatus: "in-meeting", now: 5000 })).toBe("focus");
    // 이모트 없으면 상태 감정
    expect(resolveAvatarEmotion({ userStatus: "away", now: 9000 })).toBe("sleep");
    expect(resolveAvatarEmotion({ now: 9000 })).toBe("neutral");
  });
});

describe("모션 프로필", () => {
  it("14종 모션 프로필이 라벨·블렌딩 시간을 가진다", () => {
    expect(STUDIO_MOTION_KINDS).toHaveLength(14);
    for (const kind of STUDIO_MOTION_KINDS) {
      const profile = STUDIO_MOTION_PROFILES[kind];
      expect(profile.labelKo.length, kind).toBeGreaterThan(0);
      expect(profile.labelEn.length, kind).toBeGreaterThan(0);
      expect(profile.blendMs, kind).toBeGreaterThan(0);
    }
  });

  it("점프·인사는 단발성, 나머지는 루프다", () => {
    expect(STUDIO_MOTION_PROFILES.jump.oneShotMs).toBe(600);
    expect(STUDIO_MOTION_PROFILES.greet.oneShotMs).toBe(1200);
    expect(STUDIO_MOTION_PROFILES.walk.oneShotMs).toBe(0);
    expect(STUDIO_MOTION_PROFILES.dance.oneShotMs).toBe(0);
  });

  it("레거시 스킨 파이프라인 상태로 매핑한다", () => {
    expect(motionKindToLegacyState("run")).toBe("walk");
    expect(motionKindToLegacyState("jump")).toBe("walk");
    expect(motionKindToLegacyState("dance")).toBe("walk");
    expect(motionKindToLegacyState("lie")).toBe("sit");
    expect(motionKindToLegacyState("greet")).toBe("wave");
    expect(motionKindToLegacyState("clap")).toBe("wave");
    expect(motionKindToLegacyState("work")).toBe("talk");
    expect(motionKindToLegacyState("idle")).toBe("idle");
    expect(motionKindToLegacyState("walk")).toBe("walk");
    expect(motionKindToLegacyState("sit")).toBe("sit");
  });
});

describe("모션 상태머신", () => {
  it("기본 idle 머신을 만든다", () => {
    const machine = createMotionStateMachine();
    expect(machine.kind).toBe("idle");
    expect(machine.blendFrom).toBeNull();
  });

  it("전이 요청 시 블렌딩 구간을 기록한다", () => {
    const machine = createMotionStateMachine("idle", 0);
    const next = requestMotionState(machine, "walk", 100);
    expect(next.kind).toBe("walk");
    expect(next.blendFrom).toBe("idle");
    expect(next.blendUntil).toBe(100 + STUDIO_MOTION_PROFILES.walk.blendMs);
    expect(next.startedAt).toBe(100);
    // 원본은 바뀌지 않는다 (immutable)
    expect(machine.kind).toBe("idle");
  });

  it("같은 모션 요청은 머신을 그대로 돌려준다", () => {
    const machine = requestMotionState(createMotionStateMachine("idle", 0), "walk", 100);
    expect(requestMotionState(machine, "walk", 200)).toBe(machine);
  });

  it("단발 모션은 같은 요청에도 다시 시작한다", () => {
    const machine = requestMotionState(createMotionStateMachine("idle", 0), "jump", 100);
    const restarted = requestMotionState(machine, "jump", 200);
    expect(restarted).not.toBe(machine);
    expect(restarted.startedAt).toBe(200);
  });

  it("블렌딩 팩터가 0→1로 easing된다", () => {
    const machine = requestMotionState(createMotionStateMachine("idle", 0), "sit", 1000);
    expect(motionBlendFactor(machine, 1000)).toBe(0);
    const mid = motionBlendFactor(machine, 1000 + STUDIO_MOTION_PROFILES.sit.blendMs / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(motionBlendFactor(machine, 1000 + STUDIO_MOTION_PROFILES.sit.blendMs)).toBe(1);
    expect(motionBlendFactor(machine, 9999)).toBe(1);
  });

  it("단발 모션 종료를 판정한다", () => {
    const jump = requestMotionState(createMotionStateMachine("idle", 0), "jump", 1000);
    expect(motionOneShotFinished(jump, 1200)).toBe(false);
    expect(motionOneShotFinished(jump, 1600)).toBe(true);
    const walk = requestMotionState(createMotionStateMachine("idle", 0), "walk", 1000);
    expect(motionOneShotFinished(walk, 99999)).toBe(false);
  });
});

describe("sampleMotionRender", () => {
  it("점프는 포물선 호핑 오프셋을 만든다", () => {
    const machine = requestMotionState(createMotionStateMachine("idle", 0), "jump", 1000);
    const start = sampleMotionRender(machine, 1000);
    const mid = sampleMotionRender(machine, 1300);
    const end = sampleMotionRender(machine, 1600);
    expect(start.offsetYPx).toBeCloseTo(0, 5);
    expect(mid.offsetYPx).toBeLessThan(-10);
    expect(end.offsetYPx).toBeCloseTo(0, 5);
  });

  it("인사는 엔벨로프를 곱한 기울기를 만든다", () => {
    const machine = requestMotionState(createMotionStateMachine("idle", 0), "greet", 1000);
    const mid = sampleMotionRender(machine, 1600);
    expect(mid.tiltRad).toBeGreaterThan(0.15);
    const end = sampleMotionRender(machine, 2200);
    expect(end.tiltRad).toBeCloseTo(0, 5);
  });

  it("눕기·앉기는 회전·스케일 변형을 가진다", () => {
    const lie = sampleMotionRender(requestMotionState(createMotionStateMachine("idle", 0), "lie", 0), 500);
    expect(lie.rotationDeg).toBe(-72);
    const sit = sampleMotionRender(requestMotionState(createMotionStateMachine("idle", 0), "sit", 0), 500);
    expect(sit.scaleY).toBeCloseTo(0.82);
  });

  it("뛰기는 사이클 배율을 올린다", () => {
    const run = sampleMotionRender(requestMotionState(createMotionStateMachine("idle", 0), "run", 0), 500);
    expect(run.cycleRate).toBe(1.8);
  });
});

describe("sampleCustomSheetMotionCell", () => {
  it("8방향을 시트 행에 매핑한다", () => {
    const config = sheetConfig();
    const machine = createMotionStateMachine("walk", 0);
    // 4방향 시트: left=1행, up=3행
    expect(sampleCustomSheetMotionCell(config, machine, "left", 0, false).row).toBe(1);
    expect(sampleCustomSheetMotionCell(config, machine, "up", 0, false).row).toBe(3);
    // 대각선은 facing으로 접힌다 (down-left → down = 0행)
    expect(sampleCustomSheetMotionCell(config, machine, "down-left", 0, false).row).toBe(0);
    // 8방향 시트: up-right=5행
    const config8 = { ...config, directionCount: 8 as const };
    expect(sampleCustomSheetMotionCell(config8, machine, "up-right", 0, false).row).toBe(5);
  });

  it("걷기 사이클이 시간에 따라 프레임을 바꾼다", () => {
    const config = sheetConfig();
    const machine = createMotionStateMachine("walk", 0);
    const first = sampleCustomSheetMotionCell(config, machine, "down", 0, false);
    const second = sampleCustomSheetMotionCell(config, machine, "down", 200, false);
    expect(first.column).toBe(0);
    expect(second.column).toBe(1);
    expect(first.frameIndex).toBe(first.row * 4 + first.column);
  });

  it("대기는 정지 프레임을 쓰고 호흡 바운스를 준다", () => {
    const config = sheetConfig();
    const machine = createMotionStateMachine("idle", 0);
    const sample = sampleCustomSheetMotionCell(config, machine, "down", 600, false);
    expect(sample.column).toBe(0);
    expect(sample.bobYPx).not.toBe(0);
  });

  it("reducedMotion이면 바운스가 0이다", () => {
    const config = sheetConfig();
    const machine = createMotionStateMachine("idle", 0);
    expect(sampleCustomSheetMotionCell(config, machine, "down", 600, true).bobYPx).toBe(0);
    const run = createMotionStateMachine("run", 0);
    expect(sampleCustomSheetMotionCell(config, run, "down", 600, true).bobYPx).toBe(0);
  });

  it("앉기·눕기는 스케일·회전 변형을 가진다", () => {
    const config = sheetConfig();
    const sit = sampleCustomSheetMotionCell(config, createMotionStateMachine("sit", 0), "down", 500, false);
    expect(sit.scaleY).toBeCloseTo(0.82);
    expect(sit.bobYPx).toBeGreaterThan(0);
    const lie = sampleCustomSheetMotionCell(config, createMotionStateMachine("lie", 0), "down", 500, false);
    expect(lie.rotationDeg).toBe(-72);
  });

  it("모든 모션이 유효한 셀 범위를 반환한다", () => {
    const config = sheetConfig();
    const kinds: StudioMotionKind[] = [...STUDIO_MOTION_KINDS];
    for (const kind of kinds) {
      const machine = createMotionStateMachine(kind, 0);
      for (const direction of ["down", "left", "up", "down-right"] as const) {
        const sample = sampleCustomSheetMotionCell(config, machine, direction, 350, false);
        expect(sample.row, `${kind}/${direction}`).toBeGreaterThanOrEqual(0);
        expect(sample.row, `${kind}/${direction}`).toBeLessThan(4);
        expect(sample.column, `${kind}/${direction}`).toBeGreaterThanOrEqual(0);
        expect(sample.column, `${kind}/${direction}`).toBeLessThan(4);
      }
    }
  });
});
