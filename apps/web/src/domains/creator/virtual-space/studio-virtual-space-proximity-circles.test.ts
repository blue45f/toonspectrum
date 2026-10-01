import { describe, expect, it } from "vitest";

import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import {
  diffProximityCircles,
  formProximityCircles,
  proximityAudioGain,
  proximityAudioMixes,
  proximityCircleDescriptionCopy,
  STUDIO_PROXIMITY_AUDIO_FULL_DISTANCE,
  STUDIO_PROXIMITY_AUDIO_MAX_DISTANCE,
  STUDIO_PROXIMITY_CIRCLE_MAX_MEMBERS,
  STUDIO_PROXIMITY_CIRCLE_RADIUS,
} from "./studio-virtual-space-proximity-circles";

function peer(sessionId: string, x: number, y: number): StudioVirtualSpacePeer {
  return {
    participant: { sessionId } as StudioVirtualSpacePeer["participant"],
    state: {
      x, y,
      zoneId: "lounge",
      facing: "down",
      activity: "available",
      moving: false,
      avatarIndex: 0,
    },
    lastSeen: Date.now(),
    sequence: 1,
  };
}

describe("proximityAudioGain", () => {
  it("가까우면 풀 볼륨, 최대 거리 밖은 무음", () => {
    expect(proximityAudioGain(0)).toBe(1);
    expect(proximityAudioGain(STUDIO_PROXIMITY_AUDIO_FULL_DISTANCE)).toBe(1);
    expect(proximityAudioGain(STUDIO_PROXIMITY_AUDIO_MAX_DISTANCE)).toBe(0);
    expect(proximityAudioGain(STUDIO_PROXIMITY_AUDIO_MAX_DISTANCE + 100)).toBe(0);
  });

  it("중간 거리는 0과 1 사이에서 단조 감소", () => {
    const near = proximityAudioGain(120);
    const mid = proximityAudioGain(200);
    const far = proximityAudioGain(300);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("비정상 입력은 안전하게 처리", () => {
    expect(proximityAudioGain(NaN)).toBe(1);
    expect(proximityAudioGain(-10)).toBe(1);
    expect(proximityAudioGain(Infinity)).toBe(0);
  });
});

describe("formProximityCircles", () => {
  it("혼자면 서클이 생기지 않는다", () => {
    expect(formProximityCircles("me", { x: 0, y: 0 }, [])).toHaveLength(0);
  });

  it("2명 근접 시 서클 1개가 형성된다", () => {
    const circles = formProximityCircles("me", { x: 0, y: 0 }, [peer("a", 50, 0)]);
    expect(circles).toHaveLength(1);
    expect(circles[0]!.memberSessionIds).toEqual(["me", "a"]);
    expect(circles[0]!.id).toContain("me");
    expect(circles[0]!.id).toContain("+a");
  });

  it("반경 밖 피어는 제외된다", () => {
    const circles = formProximityCircles("me", { x: 0, y: 0 }, [
      peer("near", 50, 0),
      peer("far", STUDIO_PROXIMITY_CIRCLE_RADIUS + 500, 0),
    ]);
    expect(circles).toHaveLength(1);
    expect(circles[0]!.memberSessionIds).not.toContain("far");
  });

  it("최대 인원을 초과하면 가까운 순으로만 포함", () => {
    const peers = Array.from({ length: 10 }, (_, i) => peer(`p${i}`, 20 + i * 10, 0));
    const circles = formProximityCircles("me", { x: 0, y: 0 }, peers);
    expect(circles).toHaveLength(1);
    expect(circles[0]!.memberSessionIds).toHaveLength(STUDIO_PROXIMITY_CIRCLE_MAX_MEMBERS);
  });

  it("서클 중심은 멤버들의 무게중심", () => {
    const circles = formProximityCircles("me", { x: 0, y: 0 }, [peer("a", 100, 0)]);
    expect(circles[0]!.center.x).toBeCloseTo(50, 6);
    expect(circles[0]!.center.y).toBeCloseTo(0, 6);
  });
});

describe("proximityAudioMixes", () => {
  it("서클 멤버는 최소 게인을 보장받는다", () => {
    const peers = [peer("a", STUDIO_PROXIMITY_CIRCLE_RADIUS - 10, 0)];
    const circles = formProximityCircles("me", { x: 0, y: 0 }, peers);
    const mixes = proximityAudioMixes({ x: 0, y: 0 }, peers, circles);
    expect(mixes[0]!.inCircle).toBe(true);
    expect(mixes[0]!.gain).toBeGreaterThanOrEqual(0.35);
  });

  it("서클 밖 피어는 거리 게인 그대로", () => {
    const peers = [peer("solo", 200, 0)];
    const mixes = proximityAudioMixes({ x: 0, y: 0 }, peers, []);
    expect(mixes[0]!.inCircle).toBe(false);
    expect(mixes[0]!.gain).toBeCloseTo(proximityAudioGain(200), 6);
  });
});

describe("diffProximityCircles", () => {
  it("형성·해산을 구분한다", () => {
    const formed = formProximityCircles("me", { x: 0, y: 0 }, [peer("a", 50, 0)]);
    const diff1 = diffProximityCircles([], formed);
    expect(diff1.formed).toHaveLength(1);
    expect(diff1.dissolved).toHaveLength(0);

    const diff2 = diffProximityCircles(formed, []);
    expect(diff2.formed).toHaveLength(0);
    expect(diff2.dissolved).toHaveLength(1);
  });

  it("멤버가 바뀌면 해산+형성으로 본다", () => {
    const before = formProximityCircles("me", { x: 0, y: 0 }, [peer("a", 50, 0)]);
    const after = formProximityCircles("me", { x: 0, y: 0 }, [peer("b", 50, 0)]);
    const diff = diffProximityCircles(before, after);
    expect(diff.formed).toHaveLength(1);
    expect(diff.dissolved).toHaveLength(1);
  });
});

describe("서클 설명 문구", () => {
  it("멤버 수 기반 한/영 문구를 만든다", () => {
    const circles = formProximityCircles("self", { x: 0, y: 0 }, [
      peer("p1", 50, 0),
      peer("p2", 0, 60),
    ]);
    expect(circles).toHaveLength(1);
    const ko = proximityCircleDescriptionCopy((k, _e) => k, circles[0]);
    const en = proximityCircleDescriptionCopy((_k, e) => e, circles[0]);
    expect(ko).toContain("3명이 대화 중");
    expect(en).toContain("3 people are chatting");
  });
});
