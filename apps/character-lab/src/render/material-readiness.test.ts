import { describe, expect, it } from "vitest";

import { waitUntilReady } from "./material-readiness";

/** 가짜 시계: sleep이 시간을 앞으로 돌린다 */
function fakeClock() {
  let time = 1000;
  return { now: () => time, sleep: (ms: number) => Promise.resolve().then(() => void (time += ms)) };
}

describe("material-readiness", () => {
  it("검사가 비어 있으면 즉시 준비 완료", async () => {
    const clock = fakeClock();
    await expect(waitUntilReady([], { timeoutMs: 1000, ...clock })).resolves.toEqual({ ready: true, elapsedMs: 0, pending: 0, polls: 1 });
  });

  it("모든 검사가 true가 될 때까지 폴링한다(폴링이 컴파일을 일으키는 재질 모사)", async () => {
    const clock = fakeClock();
    let polls = 0;
    const result = await waitUntilReady([() => true, () => (polls += 1) >= 4], { timeoutMs: 10_000, pollMs: 50, ...clock });
    expect(result.ready).toBe(true);
    expect(result.polls).toBe(4);
    expect(result.elapsedMs).toBe(150);
    expect(result.pending).toBe(0);
  });

  it("시간 안에 안 되면 ready=false와 미준비 수를 돌려준다(호출자가 LabFailure로 올린다 — 무음 폴백 없음)", async () => {
    const clock = fakeClock();
    const result = await waitUntilReady([() => true, () => false, () => false], { timeoutMs: 500, pollMs: 100, ...clock });
    expect(result.ready).toBe(false);
    expect(result.pending).toBe(2);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(500);
    expect(result.polls).toBe(6);
  });

  it("마지막 검사에서 막 준비되면 시간 초과 직전이라도 성공이다", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitUntilReady([() => (calls += 1) === 3], { timeoutMs: 200, pollMs: 100, ...clock });
    expect(result.ready).toBe(true);
    expect(result.elapsedMs).toBe(200);
  });
});
