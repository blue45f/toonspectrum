import { describe, expect, it } from "vitest";

import {
  bubbleShareVisibleTo,
  canWatchShare,
  createBubbleShareSession,
  resolveShareRoute,
  resolveStudioShareBandwidthHint,
  STUDIO_BUBBLE_SHARE_RADIUS,
  STUDIO_SHARE_BANDWIDTH_HINTS,
} from "./studio-virtual-space-bubble-share";

describe("createBubbleShareSession", () => {
  it("유효한 입력으로 세션을 만든다", () => {
    const session = createBubbleShareSession({
      id: "share-1",
      sharerId: "kim",
      sharerLabel: "김작가",
      participants: [{ id: "lee", label: "이작가" }],
      bandwidth: "full",
      now: 1000,
    });
    expect(session?.sharerId).toBe("kim");
    expect(session?.participants.map((entry) => entry.id)).toEqual(["kim", "lee"]);
    expect(session?.bandwidth).toBe("full");
    expect(session?.startedAt).toBe(1000);
  });

  it("빈 id는 거부한다", () => {
    expect(createBubbleShareSession({ id: " ", sharerId: "kim", sharerLabel: "", participants: [] })).toBeNull();
    expect(createBubbleShareSession({ id: "s", sharerId: "!!", sharerLabel: "", participants: [] })).toBeNull();
  });

  it("참가자 중복을 제거하고 라벨을 살균한다", () => {
    const session = createBubbleShareSession({
      id: "s",
      sharerId: "kim",
      sharerLabel: "  김작가  ",
      participants: [
        { id: "lee", label: "이작가" },
        { id: "lee", label: "중복" },
        { id: "!!", label: "무효" },
      ],
    });
    expect(session?.participants.map((entry) => entry.id)).toEqual(["kim", "lee"]);
    expect(session?.sharerLabel).toBe("김작가");
  });
});

describe("bubbleShareVisibleTo", () => {
  it("반경 이내일 때만 보인다", () => {
    expect(bubbleShareVisibleTo(0)).toBe(true);
    expect(bubbleShareVisibleTo(STUDIO_BUBBLE_SHARE_RADIUS)).toBe(true);
    expect(bubbleShareVisibleTo(STUDIO_BUBBLE_SHARE_RADIUS + 1)).toBe(false);
    expect(bubbleShareVisibleTo(-1)).toBe(false);
    expect(bubbleShareVisibleTo(Number.NaN)).toBe(false);
  });
});

describe("resolveShareRoute", () => {
  it("스포트라이트 발표자는 방송 경로", () => {
    expect(resolveShareRoute({ spotlightActive: true, presenterId: "kim", sharerId: "kim" })).toBe("broadcast");
  });

  it("그 외에는 버블 경로", () => {
    expect(resolveShareRoute({ spotlightActive: true, presenterId: "kim", sharerId: "lee" })).toBe("bubble");
    expect(resolveShareRoute({ spotlightActive: false, presenterId: null, sharerId: "kim" })).toBe("bubble");
  });
});

describe("canWatchShare", () => {
  const session = createBubbleShareSession({
    id: "s",
    sharerId: "kim",
    sharerLabel: "김작가",
    participants: [{ id: "lee", label: "이작가" }],
  })!;

  it("방송 경로는 모두 볼 수 있다", () => {
    expect(canWatchShare(session, "stranger", 9999, "broadcast")).toBe(true);
  });

  it("버블 경로는 참가자+반경 내만 볼 수 있다", () => {
    expect(canWatchShare(session, "lee", 100, "bubble")).toBe(true);
    expect(canWatchShare(session, "lee", STUDIO_BUBBLE_SHARE_RADIUS + 50, "bubble")).toBe(false);
    expect(canWatchShare(session, "stranger", 10, "bubble")).toBe(false);
    expect(canWatchShare(session, "kim", 9999, "bubble")).toBe(true);
  });
});

describe("bandwidth hints", () => {
  it("3단계 힌트를 제공하고 알 수 없는 값은 balanced로", () => {
    expect(STUDIO_SHARE_BANDWIDTH_HINTS.map((hint) => hint.id)).toEqual(["full", "balanced", "low"]);
    expect(resolveStudioShareBandwidthHint("low")?.maxWidth).toBe(854);
    expect(resolveStudioShareBandwidthHint("unknown")?.id).toBe("balanced");
  });
});
