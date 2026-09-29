import { describe, expect, it } from "vitest";
import {
  EMPTY_PROXIMITY_TRACKER,
  STUDIO_PROXIMITY_FAREWELL_RADIUS,
  STUDIO_PROXIMITY_GREET_RADIUS,
  removeStudioProximityPeer,
  studioProximityPeerCount,
  updateStudioProximity,
  type StudioProximityPeer,
} from "./studio-virtual-space-proximity";

const peer: StudioProximityPeer = {
  id: "p1",
  relation: "teammate",
  displayNameKo: "지민",
  displayNameEn: "Jimin",
};
const npcPeer: StudioProximityPeer = { ...peer, id: "npc1", relation: "npc", displayNameKo: "바리스타", displayNameEn: "Barista" };

describe("근접 인사", () => {
  it("인사 반경 진입 시 wave와 함께 인사한다", () => {
    const [, reactions] = updateStudioProximity(EMPTY_PROXIMITY_TRACKER, peer, STUDIO_PROXIMITY_GREET_RADIUS - 1, false);
    expect(reactions).toHaveLength(1);
    expect(reactions[0].kind).toBe("greet");
    expect(reactions[0].emote).toBe("wave");
    expect(reactions[0].messageKo).toContain("지민");
  });

  it("반경 밖에서는 반응하지 않는다", () => {
    const [, reactions] = updateStudioProximity(EMPTY_PROXIMITY_TRACKER, peer, STUDIO_PROXIMITY_GREET_RADIUS + 10, false);
    expect(reactions).toHaveLength(0);
  });

  it("NPC는 따뜻한 인사 문구를 사용한다", () => {
    const [, reactions] = updateStudioProximity(EMPTY_PROXIMITY_TRACKER, npcPeer, 100, false);
    expect(reactions[0].messageKo).toContain("반갑게 인사");
  });
});

describe("히스테리시스", () => {
  it("경계에서 진동하지 않는다 (이탈은 더 먼 거리에서)", () => {
    let state = EMPTY_PROXIMITY_TRACKER;
    // 진입
    let result = updateStudioProximity(state, peer, STUDIO_PROXIMITY_GREET_RADIUS - 1, false);
    state = result[0];
    expect(result[1][0].kind).toBe("greet");
    // 인사 반경 바로 밖 (이탈 반경 안) — 작별하지 않음
    result = updateStudioProximity(state, peer, STUDIO_PROXIMITY_GREET_RADIUS + 10, false);
    state = result[0];
    expect(result[1].filter((r) => r.kind === "farewell")).toHaveLength(0);
    // 이탈 반경 밖 — 작별
    result = updateStudioProximity(state, peer, STUDIO_PROXIMITY_FAREWELL_RADIUS + 1, false);
    expect(result[1][0].kind).toBe("farewell");
  });

  it("작별 후 재진입하면 다시 인사한다", () => {
    let state = EMPTY_PROXIMITY_TRACKER;
    let result = updateStudioProximity(state, peer, 100, false);
    state = result[0];
    result = updateStudioProximity(state, peer, STUDIO_PROXIMITY_FAREWELL_RADIUS + 1, false);
    state = result[0];
    result = updateStudioProximity(state, peer, 100, false);
    expect(result[1][0].kind).toBe("greet");
  });
});

describe("대화 힌트·알아봄", () => {
  it("인사 후 대화 반경에 머무르면 힌트를 1회 표시한다", () => {
    let state = EMPTY_PROXIMITY_TRACKER;
    let result = updateStudioProximity(state, peer, 100, false);
    state = result[0];
    result = updateStudioProximity(state, peer, 150, false);
    state = result[0];
    // 150은 인사 반경(160) 안, 대화 반경(200) 안 → chat-hint (acknowledge는 96 이하에서만)
    expect(result[1].some((r) => r.kind === "chat-hint")).toBe(true);
    // 다음 틱에는 반복하지 않음
    result = updateStudioProximity(state, peer, 150, false);
    expect(result[1].filter((r) => r.kind === "chat-hint")).toHaveLength(0);
  });

  it("아주 가까워지면 알아봄 반응을 1회 표시한다", () => {
    let state = EMPTY_PROXIMITY_TRACKER;
    let result = updateStudioProximity(state, peer, 100, false);
    state = result[0];
    result = updateStudioProximity(state, peer, 50, false);
    expect(result[1].some((r) => r.kind === "acknowledge")).toBe(true);
    const nextState = result[0];
    const again = updateStudioProximity(nextState, peer, 50, false);
    expect(again[1].filter((r) => r.kind === "acknowledge")).toHaveLength(0);
  });
});

describe("reduced-motion", () => {
  it("이모트 대신 null을 반환한다", () => {
    const [, reactions] = updateStudioProximity(EMPTY_PROXIMITY_TRACKER, peer, 100, true);
    expect(reactions[0].kind).toBe("greet");
    expect(reactions[0].emote).toBeNull();
    expect(reactions[0].messageKo.length).toBeGreaterThan(0);
  });
});

describe("피어 관리", () => {
  it("피어를 제거할 수 있다", () => {
    const [state] = updateStudioProximity(EMPTY_PROXIMITY_TRACKER, peer, 100, false);
    expect(studioProximityPeerCount(state)).toBe(1);
    const removed = removeStudioProximityPeer(state, peer.id);
    expect(studioProximityPeerCount(removed)).toBe(0);
    // 없는 피어 제거는 동일 상태 반환
    expect(removeStudioProximityPeer(removed, "unknown")).toBe(removed);
  });

  it("잘못된 거리는 무한대로 취급한다", () => {
    const [, reactions] = updateStudioProximity(EMPTY_PROXIMITY_TRACKER, peer, NaN, false);
    expect(reactions).toHaveLength(0);
  });
});
