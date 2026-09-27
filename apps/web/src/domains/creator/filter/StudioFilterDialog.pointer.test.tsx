// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioUiPreferencesRepository } from "../studio-ui-preferences-sqlite";

import { StudioFilterDialog } from "./StudioFilterDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setupDialog() {
  const onClose = vi.fn();
  const values = new Map<string, string>();
  const repository = createStudioUiPreferencesRepository({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  });
  render(
    <StudioFilterDialog
      activeKey="pointer-regression"
      kind="motion-blur"
      image={{}}
      rootRef={createRef<HTMLElement>()}
      acquireUiPreferences={async () => repository}
      onPreview={vi.fn()}
      onApply={vi.fn()}
      onClose={onClose}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const handle = screen.getByRole("button", { name: /필터 창 옮기기/u });
  const header = handle.closest("header");
  if (!header) throw new Error("필터 창 제목 영역이 없습니다");
  const capture = vi.fn();
  const release = vi.fn();
  Object.defineProperties(header, {
    setPointerCapture: { configurable: true, value: capture },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: release },
  });
  fireEvent.keyDown(handle, { key: "Enter" });
  return { capture, dialog, handle, header, onClose, release };
}

const primaryPointer = { pointerId: 11, button: 0, isPrimary: true, clientX: 200, clientY: 100 };

describe("필터 창 포인터 소유권", () => {
  it("닫기 버튼과 내부 아이콘 입력을 제목 드래그로 가로채지 않는다", () => {
    const { capture, onClose } = setupDialog();
    const close = screen.getByRole("button", { name: /닫기$/u });
    const icon = close.querySelector("svg");
    if (!icon) throw new Error("닫기 아이콘이 없습니다");
    fireEvent.pointerDown(icon, primaryPointer);
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerUp(icon, primaryPointer);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("두 번째 터치가 진행 중인 드래그의 포인터를 바꾸지 않는다", () => {
    const { capture, header } = setupDialog();
    fireEvent.pointerDown(header, primaryPointer);
    fireEvent.pointerDown(header, { ...primaryPointer, pointerId: 12, isPrimary: false });
    expect(capture.mock.calls).toEqual([[11]]);
  });

  it("이미 드래그 중일 때 다른 주 포인터도 시작하지 않는다", () => {
    const { capture, header } = setupDialog();
    fireEvent.pointerDown(header, primaryPointer);
    fireEvent.pointerDown(header, { ...primaryPointer, pointerId: 12 });
    expect(capture.mock.calls).toEqual([[11]]);
  });

  it("포인터 캡처를 잃으면 남은 이동 이벤트가 창을 끌고 다니지 않는다", () => {
    const { dialog, header } = setupDialog();
    fireEvent.pointerDown(header, primaryPointer);
    fireEvent.pointerMove(header, { ...primaryPointer, clientX: 250, clientY: 130 });
    const before = dialog.style.translate;
    fireEvent.lostPointerCapture(header, primaryPointer);
    fireEvent.pointerMove(header, { ...primaryPointer, clientX: 350, clientY: 180 });
    expect(dialog.style.translate).toBe(before);
  });

  it("취소된 드래그를 정리한 뒤 새 입력을 허용한다", () => {
    const { capture, header, release } = setupDialog();
    fireEvent.pointerDown(header, primaryPointer);
    fireEvent.pointerCancel(header, primaryPointer);
    fireEvent.pointerDown(header, { ...primaryPointer, pointerId: 13 });
    expect(release).toHaveBeenCalledWith(11);
    expect(capture.mock.calls).toEqual([[11], [13]]);
  });

  it("마우스 보조 버튼으로 창을 이동하지 않는다", () => {
    const { capture, header } = setupDialog();
    fireEvent.pointerDown(header, { ...primaryPointer, button: 2 });
    expect(capture).not.toHaveBeenCalled();
  });

  it("드래그 손잡이도 모바일 44px 터치 영역을 제공한다", () => {
    const { handle } = setupDialog();
    expect(handle.className).toContain("size-11");
    expect(handle.className).toContain("pointer-coarse:size-11");
  });
});
