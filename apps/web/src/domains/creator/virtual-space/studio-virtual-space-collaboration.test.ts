import { describe, expect, it } from "vitest";
import {
  collabEmojiToFloating,
  floatingEmojiOffset,
  followDistanceExceeded,
  followTargetPosition,
  pruneFloatingEmojis,
  reactionToFloatingEmoji,
  shareButtonState,
  shareButtonText,
  shouldStopFollowingOnInput,
  speakerRingStates,
  startFollowing,
  stopFollowing,
  STUDIO_FLOATING_EMOJI_TTL_MS,
  STUDIO_SPEAKER_THRESHOLD,
} from "./studio-virtual-space-collaboration";

describe("speakerRingStates", () => {
  it("임계값 이상인 참가자만 링을 표시한다", () => {
    const states = speakerRingStates(
      [
        { sessionId: "a", level: 0.5, at: 1000 },
        { sessionId: "b", level: 0.05, at: 1000 },
      ],
      1100,
    );
    expect(states).toHaveLength(1);
    expect(states[0]?.sessionId).toBe("a");
    expect(states[0]?.intensity).toBeGreaterThan(0);
  });

  it("오래된 레벨은 무시한다", () => {
    const states = speakerRingStates([{ sessionId: "a", level: 0.9, at: 1000 }], 3000);
    expect(states).toHaveLength(0);
  });

  it("임계값 경계를 확인한다", () => {
    const below = speakerRingStates([{ sessionId: "a", level: STUDIO_SPEAKER_THRESHOLD - 0.01, at: 1000 }], 1100);
    const above = speakerRingStates([{ sessionId: "a", level: STUDIO_SPEAKER_THRESHOLD + 0.01, at: 1000 }], 1100);
    expect(below).toHaveLength(0);
    expect(above).toHaveLength(1);
  });
});

describe("shareButtonState", () => {
  it("회의실 밖에서는 숨긴다", () => {
    expect(shareButtonState({ inMeetingRoom: false, amSharing: false, peerSharingSessionId: null })).toBe("hidden");
  });

  it("회의실에서 시작 가능하다", () => {
    expect(shareButtonState({ inMeetingRoom: true, amSharing: false, peerSharingSessionId: null })).toBe("start");
  });

  it("내가 공유 중이면 중지 상태다", () => {
    expect(shareButtonState({ inMeetingRoom: true, amSharing: true, peerSharingSessionId: null })).toBe("sharing");
  });

  it("다른 사람이 공유 중이면 보기 상태다", () => {
    expect(shareButtonState({ inMeetingRoom: true, amSharing: false, peerSharingSessionId: "peer-1" })).toBe("viewing");
  });
});

describe("shareButtonText", () => {
  it("상태별 문구를 반환한다", () => {
    expect(shareButtonText("start").ko).toBe("화면 공유 시작");
    expect(shareButtonText("sharing").ko).toBe("공유 중지");
    expect(shareButtonText("viewing").ko).toBe("화면 보는 중");
    expect(shareButtonText("hidden").ko).toBe("");
  });
});

describe("reactionToFloatingEmoji", () => {
  it("리액션을 이모지로 변환한다", () => {
    const emoji = reactionToFloatingEmoji("e1", "user-1", "wave", 1000);
    expect(emoji.emoji).toBe("👋");
    expect(emoji.ttlMs).toBe(STUDIO_FLOATING_EMOJI_TTL_MS);
  });
});

describe("collabEmojiToFloating", () => {
  it("협업 이모지를 만든다", () => {
    const emoji = collabEmojiToFloating("e2", "user-1", "👏", 1000);
    expect(emoji.emoji).toBe("👏");
  });
});

describe("floatingEmojiOffset", () => {
  const emoji = reactionToFloatingEmoji("e1", "user-1", "heart", 1000);

  it("시간이 지날수록 위로 떠오른다", () => {
    const early = floatingEmojiOffset(emoji, 1100);
    const late = floatingEmojiOffset(emoji, 2000);
    expect(late.dy).toBeLessThan(early.dy);
  });

  it("끝나갈수록 투명해진다", () => {
    const mid = floatingEmojiOffset(emoji, 2000);
    const end = floatingEmojiOffset(emoji, 1000 + STUDIO_FLOATING_EMOJI_TTL_MS - 100);
    expect(end.opacity).toBeLessThan(mid.opacity);
  });

  it("reducedMotion에서는 고정 위치다", () => {
    const a = floatingEmojiOffset(emoji, 1100, true);
    const b = floatingEmojiOffset(emoji, 2000, true);
    expect(a.dy).toBe(b.dy);
  });
});

describe("pruneFloatingEmojis", () => {
  it("만료된 이모지를 제거한다", () => {
    const emojis = [
      reactionToFloatingEmoji("e1", "u1", "wave", 1000),
      reactionToFloatingEmoji("e2", "u2", "heart", 5000),
    ];
    const pruned = pruneFloatingEmojis(emojis, 1000 + STUDIO_FLOATING_EMOJI_TTL_MS + 100);
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.id).toBe("e2");
  });
});

describe("follow mode", () => {
  it("따라가기를 시작/중지한다", () => {
    const following = startFollowing("leader-1");
    expect(following.following).toBe(true);
    expect(following.leaderSessionId).toBe("leader-1");
    expect(stopFollowing().following).toBe(false);
  });

  it("리더 뒤쪽에 목표 위치를 만든다", () => {
    const target = followTargetPosition({ x: 100, y: 100 }, { x: 100, y: 0 }, 64);
    // 오른쪽으로 이동 중이면 왼쪽 뒤에 선다
    expect(target.x).toBeCloseTo(36, 5);
    expect(target.y).toBeCloseTo(100, 5);
  });

  it("리더가 정지 중이면 아래쪽에 선다", () => {
    const target = followTargetPosition({ x: 100, y: 100 }, { x: 0, y: 0 }, 64);
    expect(target.x).toBe(100);
    expect(target.y).toBe(164);
  });

  it("수동 입력이 들어오면 따라가기를 해제한다", () => {
    const following = startFollowing("leader-1");
    expect(shouldStopFollowingOnInput(following, { x: 1, y: 0 })).toBe(true);
    expect(shouldStopFollowingOnInput(following, { x: 0, y: 0 })).toBe(false);
    expect(shouldStopFollowingOnInput(stopFollowing(), { x: 1, y: 0 })).toBe(false);
  });

  it("리더가 너무 멀어지면 감지한다", () => {
    expect(followDistanceExceeded({ x: 0, y: 0 }, { x: 700, y: 0 })).toBe(true);
    expect(followDistanceExceeded({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(false);
  });
});
