import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRewardedAdSnapshot,
  notifyRewardedAdEvent,
  onRewardedAdEvent,
  publishRewardedAdProvider,
  showRewardedAd,
  subscribeRewardedAd,
} from "../rewarded-ad";

describe("rewarded-ad compat registry", () => {
  afterEach(() => {
    // 테스트 간 provider 게시 상태 초기화(모듈 싱글톤).
    publishRewardedAdProvider(null);
  });

  it("provider 미게시(웹) 기본 스냅샷은 available=false", () => {
    expect(getRewardedAdSnapshot()).toEqual({ available: false, ready: false });
  });

  it("provider 게시/해제가 스냅샷과 구독자에게 반영된다", () => {
    const onChange = vi.fn();
    const off = subscribeRewardedAd(onChange);

    publishRewardedAdProvider({ ready: false, show: () => false });
    expect(getRewardedAdSnapshot()).toEqual({ available: true, ready: false });
    expect(onChange).toHaveBeenCalledTimes(1);

    publishRewardedAdProvider({ ready: true, show: () => true });
    expect(getRewardedAdSnapshot()).toEqual({ available: true, ready: true });
    expect(onChange).toHaveBeenCalledTimes(2);

    publishRewardedAdProvider(null);
    expect(getRewardedAdSnapshot()).toEqual({ available: false, ready: false });
    expect(onChange).toHaveBeenCalledTimes(3);
    off();
  });

  it("상태가 실제로 안 바뀌면 스냅샷 참조를 유지하고 통지하지 않는다", () => {
    publishRewardedAdProvider({ ready: true, show: () => true });
    const before = getRewardedAdSnapshot();
    const onChange = vi.fn();
    const off = subscribeRewardedAd(onChange);

    // show 함수만 새 참조로 갱신(available/ready 동일) — useSyncExternalStore 호환 요건.
    publishRewardedAdProvider({ ready: true, show: () => false });
    expect(getRewardedAdSnapshot()).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
    off();
  });

  it("showRewardedAd 는 최신 provider 의 show 로 위임하고, 미게시면 false", () => {
    expect(showRewardedAd()).toBe(false);
    const show = vi.fn(() => true);
    publishRewardedAdProvider({ ready: true, show });
    expect(showRewardedAd()).toBe(true);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("보상/종료 이벤트가 구독자에게 전달되고 구독 해제가 동작한다", () => {
    const events: string[] = [];
    const off = onRewardedAdEvent((event) => {
      events.push(event.type);
    });
    notifyRewardedAdEvent({ type: "reward", reward: { unitType: "coin", unitAmount: 1 } });
    notifyRewardedAdEvent({ type: "closed" });
    expect(events).toEqual(["reward", "closed"]);
    off();
    notifyRewardedAdEvent({ type: "closed" });
    expect(events).toEqual(["reward", "closed"]);
  });

  it("한 이벤트 구독자의 예외가 다른 구독자를 막지 않는다", () => {
    const seen: string[] = [];
    const offBad = onRewardedAdEvent(() => {
      throw new Error("boom");
    });
    const offGood = onRewardedAdEvent((event) => {
      seen.push(event.type);
    });
    expect(() => notifyRewardedAdEvent({ type: "closed" })).not.toThrow();
    expect(seen).toEqual(["closed"]);
    offBad();
    offGood();
  });
});
