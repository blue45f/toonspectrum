import { describe, expect, it } from "vitest";

import {
  adjustStudioBrushOpacity,
  adjustStudioBrushWidth,
  resolveStudioDrawingShortcut,
} from "./studio-drawing-shortcuts";

describe("resolveStudioDrawingShortcut", () => {
  it("B는 펜, E는 펜·지우개 토글로 해석한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "KeyB", key: "b" })).toEqual({ type: "select-pen" });
    expect(resolveStudioDrawingShortcut({ code: "KeyE", key: "e" })).toEqual({ type: "toggle-eraser" });
  });

  it("가상 키보드·브라우저 자동화가 축약 code를 보내도 key 의미로 보완한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "b", key: "b" })).toEqual({ type: "select-pen" });
    expect(resolveStudioDrawingShortcut({ code: "E", key: "E" })).toEqual({ type: "toggle-eraser" });
    expect(resolveStudioDrawingShortcut({ code: "]", key: "]" })).toEqual({
      type: "adjust-width",
      delta: 1,
    });
  });

  it("B/E 자동 반복은 무시해 도구가 진동하지 않게 한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "KeyB", repeat: true })).toBeNull();
    expect(resolveStudioDrawingShortcut({ code: "KeyE", repeat: true })).toBeNull();
  });

  it("브래킷은 ±1px, Shift 브래킷은 ±5px이며 반복을 허용한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "BracketLeft", repeat: true })).toEqual({
      type: "adjust-width",
      delta: -1,
    });
    expect(resolveStudioDrawingShortcut({ code: "BracketRight", shiftKey: true })).toEqual({
      type: "adjust-width",
      delta: 5,
    });
  });

  it("Option/Alt 브래킷은 불투명도를 5%p 조절한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "BracketLeft", altKey: true })).toEqual({
      type: "adjust-opacity",
      delta: -0.05,
    });
    expect(resolveStudioDrawingShortcut({ code: "BracketRight", altKey: true, shiftKey: true })).toEqual({
      type: "adjust-opacity",
      delta: 0.05,
    });
  });

  it("Cmd/Ctrl 브래킷은 기존 레이어 명령에 양보한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "BracketLeft", metaKey: true })).toBeNull();
    expect(resolveStudioDrawingShortcut({ code: "BracketRight", ctrlKey: true })).toBeNull();
  });

  it("Shift/Option으로 key가 변형돼도 물리 code로 안정적으로 해석한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "BracketLeft", key: "{", shiftKey: true })).toEqual({
      type: "adjust-width",
      delta: -5,
    });
    expect(resolveStudioDrawingShortcut({ code: "BracketRight", key: "‘", altKey: true })).toEqual({
      type: "adjust-opacity",
      delta: 0.05,
    });
  });

  it("IME 조합과 keyCode 229는 무시한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "KeyB", isComposing: true })).toBeNull();
    expect(resolveStudioDrawingShortcut({ code: "KeyE", keyCode: 229 })).toBeNull();
  });

  it("Digit1–6은 최근 브러시 슬롯 호출로 해석한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "Digit1" })).toEqual({
      type: "recall-brush-slot",
      index: 0,
    });
    expect(resolveStudioDrawingShortcut({ code: "Digit6" })).toEqual({
      type: "recall-brush-slot",
      index: 5,
    });
    expect(resolveStudioDrawingShortcut({ code: "Digit1", shiftKey: true })).toBeNull();
  });

  it("Tab은 크롬 토글로 해석한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "Tab" })).toEqual({ type: "toggle-chrome" });
    expect(resolveStudioDrawingShortcut({ code: "Tab", metaKey: true })).toBeNull();
  });

  it("CSP/Photoshop/Procreate 계열 색·보정·잠금 단축키를 해석한다", () => {
    expect(resolveStudioDrawingShortcut({ code: "KeyX" })).toEqual({ type: "swap-colors" });
    expect(resolveStudioDrawingShortcut({ code: "KeyD" })).toEqual({ type: "default-colors" });
    expect(resolveStudioDrawingShortcut({ code: "KeyS" })).toEqual({ type: "cycle-stabilizer" });
    expect(resolveStudioDrawingShortcut({ code: "KeyS", shiftKey: true })).toEqual({
      type: "toggle-size-lock",
    });
    expect(resolveStudioDrawingShortcut({ code: "KeyS", altKey: true })).toEqual({
      type: "toggle-opacity-lock",
    });
    expect(resolveStudioDrawingShortcut({ code: "KeyF" })).toEqual({ type: "toggle-canvas-flip-h" });
    // Cmd+D is document duplicate — not default colors
    expect(resolveStudioDrawingShortcut({ code: "KeyD", metaKey: true })).toBeNull();
  });
});

describe("드로잉 단축키 수치 조절", () => {
  it("브러시 크기를 1~48px로 clamp하고 비정상 입력도 정규화한다", () => {
    expect(adjustStudioBrushWidth(1, -5)).toBe(1);
    expect(adjustStudioBrushWidth(48, 5)).toBe(48);
    expect(adjustStudioBrushWidth(Number.NaN, 5)).toBe(6);
  });

  it("불투명도를 0.1~1로 clamp하고 소수 오차를 누적하지 않는다", () => {
    expect(adjustStudioBrushOpacity(0.1, -0.05)).toBe(0.1);
    expect(adjustStudioBrushOpacity(1, 0.05)).toBe(1);
    expect(adjustStudioBrushOpacity(0.7, 0.05)).toBe(0.75);
    expect(adjustStudioBrushOpacity(0.7, -0.05)).toBe(0.65);
  });
});
