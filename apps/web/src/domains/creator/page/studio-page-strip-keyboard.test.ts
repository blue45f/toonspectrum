import { describe, expect, it } from "vitest";

import {
  resolveStudioPageStripKeyAction,
  type StudioPageStripKeyInput,
} from "./studio-page-strip-keyboard";

function input(overrides: Partial<StudioPageStripKeyInput>): StudioPageStripKeyInput {
  return {
    key: "ArrowRight",
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    index: 1,
    count: 4,
    rtl: false,
    canReorder: true,
    ...overrides,
  };
}

describe("페이지 스트립 키보드 규칙", () => {
  it("방향키·Home·End는 초점만 옮기고 처음·끝에서 멈춘다", () => {
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowRight" }))).toEqual({ kind: "focus", index: 2 });
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowLeft" }))).toEqual({ kind: "focus", index: 0 });
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowLeft", index: 0 }))).toEqual({ kind: "focus", index: 0 });
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowRight", index: 3 }))).toEqual({ kind: "focus", index: 3 });
    expect(resolveStudioPageStripKeyAction(input({ key: "Home" }))).toEqual({ kind: "focus", index: 0 });
    expect(resolveStudioPageStripKeyAction(input({ key: "End" }))).toEqual({ kind: "focus", index: 3 });
  });

  it("Alt+←/→ 는 한 칸, Shift+Alt+←/→ 는 맨 앞·맨 뒤로 옮긴다", () => {
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "ArrowRight" }))).toEqual({ kind: "reorder", index: 2 });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "ArrowLeft" }))).toEqual({ kind: "reorder", index: 0 });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, shiftKey: true, key: "ArrowRight" }))).toEqual({ kind: "reorder", index: 3 });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, shiftKey: true, key: "ArrowLeft" }))).toEqual({ kind: "reorder", index: 0 });
  });

  it("이미 맨 앞·맨 뒤면 옮기지 않고 키만 소비해 브라우저 뒤로가기로 새지 않는다", () => {
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "ArrowLeft", index: 0 }))).toEqual({ kind: "edge", edge: "start" });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "ArrowRight", index: 3 }))).toEqual({ kind: "edge", edge: "end" });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, shiftKey: true, key: "ArrowLeft", index: 0 }))).toEqual({ kind: "edge", edge: "start" });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, shiftKey: true, key: "ArrowRight", index: 3 }))).toEqual({ kind: "edge", edge: "end" });
  });

  it("순서 바꾸기가 막힌 스트립(잠금)에서는 Alt 조합을 가로채지 않는다", () => {
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "ArrowRight", canReorder: false }))).toBeNull();
    // 이동(초점)은 잠금과 무관하게 계속 된다.
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowRight", canReorder: false }))).toEqual({ kind: "focus", index: 2 });
  });

  it("오른쪽→왼쪽 문서에서는 ←/→ 의 앞·뒤가 뒤집힌다", () => {
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowLeft", rtl: true }))).toEqual({ kind: "focus", index: 2 });
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowRight", rtl: true }))).toEqual({ kind: "focus", index: 0 });
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "ArrowLeft", rtl: true }))).toEqual({ kind: "reorder", index: 2 });
  });

  it("Ctrl/Meta 조합·Shift 단독·그 밖의 키는 건드리지 않는다", () => {
    expect(resolveStudioPageStripKeyAction(input({ ctrlKey: true }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ metaKey: true, altKey: true }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ shiftKey: true }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ key: "a" }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ key: "ArrowDown" }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ altKey: true, key: "Home" }))).toBeNull();
  });

  it("페이지가 없거나 index가 범위를 벗어나면 아무 일도 하지 않는다", () => {
    expect(resolveStudioPageStripKeyAction(input({ count: 0 }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ index: 9 }))).toBeNull();
    expect(resolveStudioPageStripKeyAction(input({ index: -1 }))).toBeNull();
  });
});
