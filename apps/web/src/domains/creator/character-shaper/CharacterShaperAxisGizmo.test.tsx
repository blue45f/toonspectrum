// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterShaperAxisGizmo } from "./CharacterShaperAxisGizmo";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const BEHIND = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];

function host(elements: number[], status = "ready"): StudioVrmPoserHost {
  return { status, captureRef: { current: { camera: { matrixWorldInverse: { elements } } } } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CharacterShaperAxisGizmo", () => {
  it("따라 그리는 축 끝점이 실제 카메라 회전을 반영한다", () => {
    const elements = [...IDENTITY];
    render(<CharacterShaperAxisGizmo h={host(elements)} />);
    act(() => { vi.advanceTimersToNextFrame(); });
    const xLine = document.querySelector('[data-axis="x"] line');
    expect(Number(xLine?.getAttribute("x2"))).toBeGreaterThan(32);
    // 같은 카메라 객체가 뒤쪽으로 돌면 다음 프레임에 X가 왼쪽으로 뒤집힌다.
    elements.splice(0, elements.length, ...BEHIND);
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(Number(document.querySelector('[data-axis="x"] line')?.getAttribute("x2"))).toBeLessThan(32);
    expect(document.querySelector("svg")?.lastElementChild?.getAttribute("data-axis")).not.toBe("z");
  });

  it("모델이 준비되기 전에는 그리지 않는다", () => {
    render(<CharacterShaperAxisGizmo h={host([...IDENTITY], "loading")} />);
    expect(document.querySelector("[data-character-axis-gizmo]")).toBeNull();
  });
});
