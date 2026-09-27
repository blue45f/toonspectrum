// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterPoseV3Panel } from "./CharacterPoseV3Panel";
import type { CharacterPoseRuntime } from "./use-character-pose-runtime";

vi.mock("@/shared/lib/i18n", () => ({ useT: () => (_key: string, fallback: string) => fallback }));
afterEach(cleanup);

function runtime(overrides: Partial<CharacterPoseRuntime> = {}): CharacterPoseRuntime {
  return { supported: true, effectors: ["leftHand", "leftFoot"], reason: null, ready: true, pending: false,
    previewing: false, blockedByPreview: false, preserveFootPlant: true, setPreserveFootPlant: vi.fn(), message: null,
    runtimeError: null, retryRuntime: vi.fn(), previewStabilization: vi.fn(() => true), previewTarget: vi.fn(() => true),
    apply: vi.fn(), cancel: vi.fn(), undo: vi.fn(() => true), canUndo: true, ...overrides };
}

describe("포즈 V3 편집 UI", () => {
  it("한국어 label로 선택한 끝 관절과 3축 변경값을 실제 runtime에 전달한다", () => {
    const state = runtime({ preserveFootPlant: false });
    render(<CharacterPoseV3Panel runtime={state} />);
    fireEvent.change(screen.getByLabelText("끝 관절"), { target: { value: "leftFoot" } });
    fireEvent.change(screen.getByRole("slider", { name: "좌우 이동" }), { target: { value: "0.12" } });
    fireEvent.change(screen.getByRole("slider", { name: "높이 이동" }), { target: { value: "-0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "위치 수정 미리보기" }));
    expect(state.previewTarget).toHaveBeenCalledWith("leftFoot", [0.12, -0.1, 0]);
    fireEvent.click(screen.getByRole("checkbox", { name: "현재 발 위치 고정" }));
    expect(state.setPreserveFootPlant).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "선택 부위 자연스럽게 보정 · 미리보기" }));
    expect(state.previewStabilization).toHaveBeenCalledOnce();
    for (const button of screen.getAllByRole("button")) expect(button.className).toContain("min-h-11");
  });

  it("발 고정 중 이동을 막고 preview에서는 적용·취소만 별도로 제공한다", () => {
    const state = runtime();
    const view = render(<CharacterPoseV3Panel runtime={state} />);
    fireEvent.change(screen.getByLabelText("끝 관절"), { target: { value: "leftFoot" } });
    expect(screen.getByRole("button", { name: "위치 수정 미리보기" }).matches(":disabled")).toBe(true);
    view.rerender(<CharacterPoseV3Panel runtime={{ ...state, previewing: true, blockedByPreview: true }} />);
    expect(screen.getByLabelText("끝 관절").matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "실행 취소" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "포즈 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "미리보기 취소" }));
    expect(state.apply).toHaveBeenCalledOnce(); expect(state.cancel).toHaveBeenCalledOnce();
  });

  it("미지원 모델·런타임 오류·재시도를 명확히 표시한다", () => {
    const state = runtime({ supported: false, ready: false, reason: "정규화된 VRM 사람형 뼈대가 필요합니다.", runtimeError: "포즈 상태 확인 실패" });
    render(<CharacterPoseV3Panel runtime={state} />);
    expect(screen.getByRole("status").textContent).toContain("VRM 사람형");
    expect(screen.getByRole("alert").textContent).toContain("포즈 상태 확인 실패");
    expect(screen.getByRole("button", { name: "선택 부위 자연스럽게 보정 · 미리보기" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "포즈 연결 다시 시도" }));
    expect(state.retryRuntime).toHaveBeenCalledOnce();
  });

  it("런타임 적용 확인 중에는 저장을 막고 취소 경로는 유지한다", () => {
    const state = runtime({ ready: false, pending: true, previewing: true, blockedByPreview: true });
    render(<CharacterPoseV3Panel runtime={state} />);
    expect(screen.getByRole("status").textContent).toContain("화면에 적용하는 중");
    expect(screen.getByRole("button", { name: "포즈 적용" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "미리보기 취소" }));
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.apply).not.toHaveBeenCalled();
  });
});
