import { describe, expect, it } from "vitest";

import {
  INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE,
  reduceStudioLocalScreenShare,
} from "./studio-virtual-space-screen-share";

describe("Studio local screen-share state machine", () => {
  it("idle에서 화면 선택을 시작하고 미리보기를 확정한다", () => {
    const requesting = reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "request" });
    expect(requesting).toEqual({ status: "requesting", screenId: null, error: null, startedAt: null });
    const previewing = reduceStudioLocalScreenShare(requesting, { type: "preview-ready", screenId: "screen:hall", startedAt: 1700 });
    expect(previewing).toEqual({ status: "previewing", screenId: "screen:hall", error: null, startedAt: 1700 });
  });

  it("중지하면 어떤 활성 상태에서든 idle로 되돌린다", () => {
    const previewing = reduceStudioLocalScreenShare(
      reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "request" }),
      { type: "preview-ready", screenId: "screen:hall", startedAt: 1700 },
    );
    expect(reduceStudioLocalScreenShare(previewing, { type: "stop" })).toEqual(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE);
    const failed = reduceStudioLocalScreenShare(
      reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "request" }),
      { type: "fail", error: "denied" },
    );
    expect(failed.error).toBe("denied");
    expect(reduceStudioLocalScreenShare(failed, { type: "stop" })).toEqual(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE);
  });

  it("실패하면 에러 코드를 유지하고 다시 요청할 수 있다", () => {
    const requesting = reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "request" });
    const failed = reduceStudioLocalScreenShare(requesting, { type: "fail", error: "unsupported" });
    expect(failed).toEqual({ status: "failed", screenId: null, error: "unsupported", startedAt: null });
    const retried = reduceStudioLocalScreenShare(failed, { type: "request" });
    expect(retried.status).toBe("requesting");
    expect(retried.error).toBeNull();
  });

  it("허용되지 않은 전이는 현재 상태를 그대로 반환한다", () => {
    const requesting = reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "request" });
    expect(reduceStudioLocalScreenShare(requesting, { type: "request" })).toBe(requesting);
    expect(reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, {
      type: "preview-ready", screenId: "screen:hall", startedAt: 1,
    })).toBe(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE);
    expect(reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "fail", error: "failed" }))
      .toBe(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE);
    expect(reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "stop" }))
      .toBe(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE);
  });

  it("잘못된 스크린 id나 시각의 미리보기 확정을 거부한다", () => {
    const requesting = reduceStudioLocalScreenShare(INITIAL_STUDIO_LOCAL_SCREEN_SHARE_STATE, { type: "request" });
    expect(reduceStudioLocalScreenShare(requesting, { type: "preview-ready", screenId: "not valid!!", startedAt: 1 }))
      .toBe(requesting);
    expect(reduceStudioLocalScreenShare(requesting, { type: "preview-ready", screenId: "screen:hall", startedAt: Number.NaN }))
      .toBe(requesting);
  });
});
