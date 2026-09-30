import { describe, expect, it } from "vitest";

import {
  createSilentZone,
  findSilentZone,
  INITIAL_STUDIO_SILENT_MUTE_STATE,
  reduceSilentMuteState,
  resolveSilentMicMuted,
  resolveSilentZoneTransition,
  studioSilentZoneContains,
  STUDIO_SILENT_ZONE_TILE_TAG,
} from "./studio-virtual-space-silent-zone";

const ZONE = createSilentZone({ id: "focus-room", name: "집중 작업실", rect: { x: 0, y: 0, width: 400, height: 300 } })!;

describe("createSilentZone", () => {
  it("유효한 입력으로 구역을 만든다", () => {
    expect(ZONE.id).toBe("focus-room");
    expect(STUDIO_SILENT_ZONE_TILE_TAG).toBe("silent");
  });

  it("무효 입력을 거부한다", () => {
    expect(createSilentZone({ id: " ", name: "x", rect: { x: 0, y: 0, width: 10, height: 10 } })).toBeNull();
    expect(createSilentZone({ id: "a", name: " ", rect: { x: 0, y: 0, width: 10, height: 10 } })).toBeNull();
    expect(createSilentZone({ id: "a", name: "x", rect: { x: 0, y: 0, width: 0, height: 10 } })).toBeNull();
    expect(createSilentZone({ id: "a", name: "x", rect: { x: -5, y: 0, width: 10, height: 10 } })).toBeNull();
  });
});

describe("studioSilentZoneContains / findSilentZone", () => {
  it("경계 포함 판정", () => {
    expect(studioSilentZoneContains(ZONE, 0, 0)).toBe(true);
    expect(studioSilentZoneContains(ZONE, 400, 300)).toBe(true);
    expect(studioSilentZoneContains(ZONE, 401, 300)).toBe(false);
    expect(studioSilentZoneContains(ZONE, Number.NaN, 0)).toBe(false);
  });

  it("속한 구역을 찾는다", () => {
    expect(findSilentZone([ZONE], 100, 100)?.id).toBe("focus-room");
    expect(findSilentZone([ZONE], 500, 500)).toBeNull();
    expect(findSilentZone([], 100, 100)).toBeNull();
  });
});

describe("resolveSilentZoneTransition", () => {
  it("전이 5종을 판정한다", () => {
    expect(resolveSilentZoneTransition(null, null)).toBe("stay-outside");
    expect(resolveSilentZoneTransition("a", "a")).toBe("stay-inside");
    expect(resolveSilentZoneTransition(null, "a")).toBe("enter");
    expect(resolveSilentZoneTransition("a", null)).toBe("exit");
    expect(resolveSilentZoneTransition("a", "b")).toBe("switch");
  });
});

describe("reduceSilentMuteState", () => {
  it("진입 시 음소 적용 + 이전 상태 기억, 퇴장 시 복원", () => {
    const entered = reduceSilentMuteState(INITIAL_STUDIO_SILENT_MUTE_STATE, "enter", "focus-room", false);
    expect(entered).toMatchObject({ mutedByZone: true, rememberedMuted: false, zoneId: "focus-room" });
    const exited = reduceSilentMuteState(entered, "exit", null, true);
    expect(exited).toMatchObject({ mutedByZone: false, rememberedMuted: false, zoneId: null });
  });

  it("진입 전 이미 음소였다면 퇴장 후에도 음소 유지", () => {
    const entered = reduceSilentMuteState(INITIAL_STUDIO_SILENT_MUTE_STATE, "enter", "focus-room", true);
    const exited = reduceSilentMuteState(entered, "exit", null, true);
    expect(resolveSilentMicMuted(exited, exited.rememberedMuted)).toBe(true);
  });

  it("구역 전환 시 음소를 유지한다", () => {
    const entered = reduceSilentMuteState(INITIAL_STUDIO_SILENT_MUTE_STATE, "enter", "a", false);
    const switched = reduceSilentMuteState(entered, "switch", "b", true);
    expect(switched).toMatchObject({ mutedByZone: true, zoneId: "b" });
  });

  it("stay 전이는 상태를 바꾸지 않는다", () => {
    const entered = reduceSilentMuteState(INITIAL_STUDIO_SILENT_MUTE_STATE, "enter", "a", false);
    expect(reduceSilentMuteState(entered, "stay-inside", "a", true)).toBe(entered);
    expect(reduceSilentMuteState(INITIAL_STUDIO_SILENT_MUTE_STATE, "stay-outside", null, true)).toBe(
      INITIAL_STUDIO_SILENT_MUTE_STATE,
    );
  });
});

describe("resolveSilentMicMuted", () => {
  it("구역 음소가 켜져 있으면 항상 true", () => {
    const entered = reduceSilentMuteState(INITIAL_STUDIO_SILENT_MUTE_STATE, "enter", "a", false);
    expect(resolveSilentMicMuted(entered, false)).toBe(true);
    expect(resolveSilentMicMuted(INITIAL_STUDIO_SILENT_MUTE_STATE, true)).toBe(true);
    expect(resolveSilentMicMuted(INITIAL_STUDIO_SILENT_MUTE_STATE, false)).toBe(false);
  });
});
