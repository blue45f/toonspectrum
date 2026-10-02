// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { claimOverlayClearance, OVERLAY_CLEARANCE_PROPERTY } from "./overlay-clearance";

const root = document.documentElement;
const published = () => root.style.getPropertyValue(OVERLAY_CLEARANCE_PROPERTY);

function overlay(top: number, height: number, position = "fixed") {
  const element = document.createElement("div");
  element.style.position = position;
  document.body.append(element);
  const bounds = vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, top, 240, height));
  return { element, bounds };
}

afterEach(() => {
  document.body.replaceChildren();
  root.style.removeProperty(OVERLAY_CLEARANCE_PROPERTY);
  vi.restoreAllMocks();
});

describe("claimOverlayClearance", () => {
  it("고정 알림의 윗변 위 12px까지를 점유 높이로 게시하고, 해제하면 지운다", () => {
    const { element } = overlay(700, 34);
    const release = claimOverlayClearance(element);

    expect(published()).toBe(`${window.innerHeight - 700 + 12}px`);

    release();
    expect(published()).toBe("");
  });

  it("알림이 둘이면 더 높은 값을 게시하고, 낮은 쪽만 먼저 해제해도 높은 값이 남는다", () => {
    const low = overlay(720, 34);
    const high = overlay(600, 120);
    const releaseLow = claimOverlayClearance(low.element);
    const releaseHigh = claimOverlayClearance(high.element);

    expect(published()).toBe(`${window.innerHeight - 600 + 12}px`);

    releaseLow();
    expect(published()).toBe(`${window.innerHeight - 600 + 12}px`);

    releaseHigh();
    expect(published()).toBe("");
  });

  it("높은 알림이 먼저 사라지면 남은 알림의 높이로 내려온다", () => {
    const low = overlay(720, 34);
    const high = overlay(600, 120);
    const releaseLow = claimOverlayClearance(low.element);
    const releaseHigh = claimOverlayClearance(high.element);

    releaseHigh();
    expect(published()).toBe(`${window.innerHeight - 720 + 12}px`);

    releaseLow();
    expect(published()).toBe("");
  });

  it("해제 순서와 상관없이 처음 :root 값을 마지막에 되돌린다", () => {
    root.style.setProperty(OVERLAY_CLEARANCE_PROPERTY, "8px");
    const first = overlay(700, 34);
    const second = overlay(650, 60);
    const releaseFirst = claimOverlayClearance(first.element);
    const releaseSecond = claimOverlayClearance(second.element);

    releaseFirst();
    expect(published()).toBe(`${window.innerHeight - 650 + 12}px`);

    releaseSecond();
    expect(published()).toBe("8px");
  });

  it("문서 흐름 안의 알림이나 높이가 0인 알림은 공간을 만들지 않는다", () => {
    const flow = overlay(100, 50, "static");
    const hidden = overlay(700, 0);
    const releaseFlow = claimOverlayClearance(flow.element);
    const releaseHidden = claimOverlayClearance(hidden.element);

    expect(published()).toBe("0px");

    releaseFlow();
    releaseHidden();
    expect(published()).toBe("");
  });

  it("창 크기가 바뀌면 다시 재서 게시한다", () => {
    const { element, bounds } = overlay(700, 34);
    const release = claimOverlayClearance(element);

    bounds.mockReturnValue(new DOMRect(0, 640, 240, 94));
    window.dispatchEvent(new Event("resize"));
    expect(published()).toBe(`${window.innerHeight - 640 + 12}px`);

    release();
  });
});
