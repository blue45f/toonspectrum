import { describe, expect, it } from "vitest";

import {
  bindStudioScreenShare,
  createStudioScreenObject,
} from "./studio-virtual-space-object-runtime";
import {
  resolveStudioScreenSlotAction,
  studioScreenInteractionSlots,
} from "./studio-virtual-space-interaction-slots";

const freeScreen = createStudioScreenObject("screen:hall", { x: 100, y: 200 });
const sharedScreen = bindStudioScreenShare(freeScreen, {
  sharerId: "avatar:jun", sharerLabel: "준 작가", trackState: "live", startedAt: 1700,
});

describe("screen interaction slots", () => {
  it("공유 중이 아닐 때는 시작 액션만, 공유 중일 때는 연결·해제 액션을 제공한다", () => {
    const slots = studioScreenInteractionSlots([freeScreen, sharedScreen]);
    expect(slots).toHaveLength(2);
    const [free, shared] = slots;
    expect(free).toMatchObject({
      slotId: "screen-slot:screen:hall",
      screenId: "screen:hall",
      labelKo: "대형 스크린",
      labelEn: "Large screen",
      actions: ["start-screen-share"],
    });
    expect(shared?.actions).toEqual(["connect-screen", "disconnect-screen"]);
  });

  it("시작은 빈 스크린에서만 허용하고 라이브 공유 중이면 거부한다", () => {
    expect(resolveStudioScreenSlotAction({
      action: "start-screen-share", screen: freeScreen, viewerId: "avatar:kim", distance: 30,
    })).toEqual({ allowed: true });
    expect(resolveStudioScreenSlotAction({
      action: "start-screen-share", screen: sharedScreen, viewerId: "avatar:kim", distance: 30,
    })).toEqual({ allowed: false, reason: "already-sharing" });
  });

  it("연결은 라이브 공유 중이고 가시 반경 안에 있을 때만 허용한다", () => {
    expect(resolveStudioScreenSlotAction({
      action: "connect-screen", screen: sharedScreen, viewerId: "avatar:kim", distance: 100,
    })).toEqual({ allowed: true });
    expect(resolveStudioScreenSlotAction({
      action: "connect-screen", screen: freeScreen, viewerId: "avatar:kim", distance: 100,
    })).toEqual({ allowed: false, reason: "no-share" });
    expect(resolveStudioScreenSlotAction({
      action: "connect-screen", screen: sharedScreen, viewerId: "avatar:kim", distance: 10_000,
    })).toEqual({ allowed: false, reason: "out-of-range" });
    const ended = bindStudioScreenShare(freeScreen, {
      sharerId: "avatar:jun", sharerLabel: "준 작가", trackState: "ended", startedAt: 1700,
    });
    expect(resolveStudioScreenSlotAction({
      action: "connect-screen", screen: ended, viewerId: "avatar:kim", distance: 10,
    })).toEqual({ allowed: false, reason: "share-ended" });
  });

  it("해제는 공유자 본인만 허용한다", () => {
    expect(resolveStudioScreenSlotAction({
      action: "disconnect-screen", screen: sharedScreen, viewerId: "avatar:jun", distance: 100,
    })).toEqual({ allowed: true });
    expect(resolveStudioScreenSlotAction({
      action: "disconnect-screen", screen: sharedScreen, viewerId: "avatar:kim", distance: 100,
    })).toEqual({ allowed: false, reason: "not-sharer" });
    expect(resolveStudioScreenSlotAction({
      action: "disconnect-screen", screen: freeScreen, viewerId: "avatar:jun", distance: 100,
    })).toEqual({ allowed: false, reason: "no-share" });
  });
});
