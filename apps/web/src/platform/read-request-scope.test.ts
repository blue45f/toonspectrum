import { describe, expect, it } from "vitest";

import { ReadRequestScope } from "./read-request-scope";

describe("읽기 요청 수명주기", () => {
  it("취소 이벤트 리스너 실행 전에 이전 요청을 무효화한다", () => {
    const scope = new ReadRequestScope();
    const first = scope.begin();
    let staleWasCurrent: boolean | undefined;
    first.signal.addEventListener("abort", () => {
      staleWasCurrent = first.isCurrent();
    });
    const next = scope.begin();
    expect(staleWasCurrent).toBe(false);
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(next.isCurrent()).toBe(true);
  });

  it("각 요청을 독립적이고 멱등적으로 취소하고 effect 재실행을 지원한다", () => {
    const list = new ReadRequestScope();
    const detail = new ReadRequestScope();
    const firstList = list.begin();
    const firstDetail = detail.begin();
    list.cancel();
    list.cancel();
    expect(firstList.isCurrent()).toBe(false);
    expect(firstDetail.isCurrent()).toBe(true);
    expect(list.begin().isCurrent()).toBe(true);
  });
});
