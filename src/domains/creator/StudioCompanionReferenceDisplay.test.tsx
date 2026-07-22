// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCompanionReferenceDisplay,
  type StudioCompanionReferencePreviewMetadata,
} from "./StudioCompanionReferenceDisplay";

import type {
  StudioCompanionReferenceControl,
  StudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";

afterEach(cleanup);

function projection(
  overrides: Partial<StudioCompanionReferenceProjection> = {}
): StudioCompanionReferenceProjection {
  return {
    generation: 2,
    revision: 9,
    referenceRevision: 5,
    itemCount: 4,
    resolvedItemCount: 4,
    canPickColor: true,
    ...overrides,
  };
}

function preview(
  overrides: Partial<StudioCompanionReferencePreviewMetadata> = {}
): StudioCompanionReferencePreviewMetadata {
  return {
    url: "blob:reference-composite",
    generation: 2,
    revision: 9,
    referenceRevision: 5,
    sequence: 3,
    width: 100,
    height: 200,
    ...overrides,
  };
}

function renderDisplay(input: {
  projection?: StudioCompanionReferenceProjection | null;
  preview?: StudioCompanionReferencePreviewMetadata | null;
  connectionStatus?: "connected" | "reconnecting" | "disconnected";
  onControl?: (control: StudioCompanionReferenceControl) => void;
} = {}) {
  const onControl = input.onControl ?? vi.fn<(control: StudioCompanionReferenceControl) => void>();
  const view = render(
    <StudioCompanionReferenceDisplay
      projection={input.projection === undefined ? projection() : input.projection}
      preview={input.preview === undefined ? preview() : input.preview}
      connectionStatus={input.connectionStatus ?? "connected"}
      onControl={onControl}
    />
  );
  return { ...view, onControl };
}

function setViewportBounds(viewport: HTMLElement, width = 300, height = 300) {
  Object.defineProperty(viewport, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }),
  });
}

describe("StudioCompanionReferenceDisplay", () => {
  it("renders explicit loading, empty, partial, unavailable, reconnecting, and disconnected states", () => {
    const { rerender } = render(
      <StudioCompanionReferenceDisplay
        projection={null}
        preview={null}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect(screen.getAllByText("레퍼런스 미리보기를 준비하고 있어요").length).toBeGreaterThan(0);

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ itemCount: 0, resolvedItemCount: 0, canPickColor: false })}
        preview={null}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect(screen.getAllByText("레퍼런스가 아직 없습니다").length).toBeGreaterThan(0);

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ resolvedItemCount: 2 })}
        preview={preview()}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect(screen.getByRole("status").textContent).toContain("일부 레퍼런스만 표시 중 · 2/4");

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ resolvedItemCount: 0, canPickColor: false })}
        preview={null}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect(screen.getAllByText("표시할 수 있는 레퍼런스가 없습니다").length).toBeGreaterThan(0);

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview()}
        connectionStatus="reconnecting"
        onControl={vi.fn()}
      />
    );
    expect(screen.getAllByText("기본 스튜디오에 다시 연결하는 중").length).toBeGreaterThan(0);

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview()}
        connectionStatus="disconnected"
        onControl={vi.fn()}
      />
    );
    expect(screen.getAllByText("기본 스튜디오 연결이 끊겼습니다").length).toBeGreaterThan(0);
  });

  it("keeps the picker disabled without a current frame or color capability", () => {
    const { rerender } = render(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={null}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect((screen.getByRole("button", { name: "스포이드" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ canPickColor: false })}
        preview={preview()}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect((screen.getByRole("button", { name: "스포이드" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview({ referenceRevision: 4 })}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect((screen.getByRole("button", { name: "스포이드" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends exact demand, click-pick, Enter-pick, and release controls", () => {
    const onControl = vi.fn();
    const view = renderDisplay({ onControl });
    expect(onControl).toHaveBeenNthCalledWith(1, {
      kind: "reference-preview-demand",
      active: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "스포이드" }));
    const viewport = screen.getByRole("button", { name: "합성된 레퍼런스 보드" });
    setViewportBounds(viewport);
    fireEvent.click(viewport, { button: 0, clientX: 150, clientY: 75 });
    expect(onControl).toHaveBeenNthCalledWith(2, {
      kind: "reference-pick-color",
      point: { x: 0.5, y: 0.25 },
      referenceRevision: 5,
      sequence: 1,
    });

    fireEvent.keyDown(viewport, { key: "Enter" });
    expect(onControl).toHaveBeenNthCalledWith(3, {
      kind: "reference-pick-color",
      point: { x: 0.5, y: 0.5 },
      referenceRevision: 5,
      sequence: 2,
    });

    view.unmount();
    expect(onControl).toHaveBeenNthCalledWith(4, {
      kind: "reference-preview-demand",
      active: false,
    });
  });

  it("reissues demand after reconnect and releases it on disconnect or pagehide", () => {
    const onControl = vi.fn();
    const view = render(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview()}
        connectionStatus="disconnected"
        onControl={onControl}
      />
    );
    expect(onControl).not.toHaveBeenCalled();

    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview()}
        connectionStatus="connected"
        onControl={onControl}
      />
    );
    expect(onControl).toHaveBeenLastCalledWith({
      kind: "reference-preview-demand",
      active: true,
    });

    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview()}
        connectionStatus="reconnecting"
        onControl={onControl}
      />
    );
    expect(onControl).toHaveBeenLastCalledWith({
      kind: "reference-preview-demand",
      active: false,
    });

    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview()}
        connectionStatus="connected"
        onControl={onControl}
      />
    );
    window.dispatchEvent(new Event("pagehide"));
    expect(onControl).toHaveBeenLastCalledWith({
      kind: "reference-preview-demand",
      active: false,
    });
    window.dispatchEvent(new Event("pageshow"));
    expect(onControl).toHaveBeenLastCalledWith({
      kind: "reference-preview-demand",
      active: true,
    });

    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ generation: 3 })}
        preview={preview({ generation: 3 })}
        connectionStatus="connected"
        onControl={onControl}
      />
    );
    expect(onControl).toHaveBeenLastCalledWith({
      kind: "reference-preview-demand",
      active: true,
    });

    const replacementControl = vi.fn();
    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ generation: 3 })}
        preview={preview({ generation: 3 })}
        connectionStatus="connected"
        connectionEpoch={1}
        onControl={replacementControl}
      />
    );
    expect(replacementControl).toHaveBeenCalledWith({
      kind: "reference-preview-demand",
      active: true,
    });
  });

  it("rejects clicks in the letterbox and never floods controls during local panning", () => {
    const { onControl } = renderDisplay();
    fireEvent.click(screen.getByRole("button", { name: "스포이드" }));
    const viewport = screen.getByRole("button", { name: "합성된 레퍼런스 보드" });
    setViewportBounds(viewport);

    // A 1:2 image in a 1:1 viewport occupies x=75..225; x=30 is letterbox.
    fireEvent.click(viewport, { button: 0, clientX: 30, clientY: 150 });
    expect(onControl).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("이미지 안쪽");

    fireEvent.pointerDown(viewport, { button: 1, pointerId: 12, clientX: 140, clientY: 140 });
    fireEvent.pointerMove(viewport, { pointerId: 12, clientX: 150, clientY: 145 });
    fireEvent.pointerMove(viewport, { pointerId: 12, clientX: 170, clientY: 160 });
    fireEvent.pointerUp(viewport, { button: 1, pointerId: 12, clientX: 170, clientY: 160 });
    expect(onControl).toHaveBeenCalledTimes(1);
  });

  it("lets touch users pan with one finger when the picker is off", () => {
    const { container } = renderDisplay();
    const viewport = screen.getByRole("button", { name: "합성된 레퍼런스 보드" });
    fireEvent.pointerDown(viewport, {
      button: 0,
      pointerId: 21,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 21,
      pointerType: "touch",
      clientX: 124,
      clientY: 112,
    });
    fireEvent.pointerUp(viewport, {
      button: 0,
      pointerId: 21,
      pointerType: "touch",
      clientX: 124,
      clientY: 112,
    });

    expect(container.querySelector("img")?.style.transform)
      .toContain("translate3d(24px, 12px, 0)");
    expect(screen.getByRole("status").textContent).toContain("위치를 옮겼습니다");
  });

  it("hides stale, non-blob, empty, and generation-mismatched previews", () => {
    const view = renderDisplay({ preview: preview({ generation: 1 }) });
    expect(view.container.querySelector("img")).toBeNull();

    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ itemCount: 0, resolvedItemCount: 0, canPickColor: false })}
        preview={preview()}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect(view.container.querySelector("img")).toBeNull();

    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection()}
        preview={preview({ url: "https://example.com/reference.webp" })}
        connectionStatus="connected"
        onControl={vi.fn()}
      />
    );
    expect(view.container.querySelector("img")).toBeNull();
  });

  it("supports fit, zoom, eyedropper, Escape, Space-pan, and center-pick shortcuts", () => {
    const { onControl } = renderDisplay();
    const viewport = screen.getByRole("button", { name: "합성된 레퍼런스 보드" });
    setViewportBounds(viewport, 400, 400);

    fireEvent.keyDown(viewport, { key: "i", code: "KeyI" });
    expect(screen.getByRole("button", { name: "스포이드" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(viewport, { key: "Enter" });
    expect(onControl).toHaveBeenLastCalledWith({
      kind: "reference-pick-color",
      point: { x: 0.5, y: 0.5 },
      referenceRevision: 5,
      sequence: 1,
    });

    fireEvent.keyDown(viewport, { key: "+", code: "Equal" });
    expect(screen.getByRole("status").textContent).toContain("확대율");
    fireEvent.keyDown(viewport, { key: "0", code: "Digit0" });
    expect(screen.getByRole("button", { name: "원본 100% 크기" }).textContent).toBe("맞춤");

    fireEvent.keyDown(viewport, { key: " ", code: "Space" });
    expect(viewport.className).toContain("cursor-grab");
    fireEvent.keyUp(viewport, { key: " ", code: "Space" });
    fireEvent.keyDown(viewport, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("button", { name: "스포이드" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("uses 44px touch targets, accessible labels, and only aggregate reference copy", () => {
    const view = render(
      <StudioCompanionReferenceDisplay
        projection={projection({ itemCount: 7, resolvedItemCount: 6 })}
        preview={preview()}
        connectionStatus="connected"
        latestColorResult={null}
        onControl={vi.fn()}
      />
    );
    const { container } = view;

    expect(screen.queryByLabelText(/최근 선택 색상/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "스포이드" }));
    const viewport = screen.getByRole("button", { name: "합성된 레퍼런스 보드" });
    setViewportBounds(viewport);
    fireEvent.click(viewport, { button: 0, clientX: 150, clientY: 150 });
    view.rerender(
      <StudioCompanionReferenceDisplay
        projection={projection({ itemCount: 7, resolvedItemCount: 6 })}
        preview={preview()}
        connectionStatus="connected"
        latestColorResult={{
          color: "#32A6D8",
          generation: 2,
          revision: 9,
          referenceRevision: 5,
          sequence: 1,
        }}
        onControl={vi.fn()}
      />
    );

    const toolbar = screen.getByRole("toolbar", { name: "레퍼런스 보기 도구" });
    expect(toolbar).toBeTruthy();
    expect(screen.getByRole("button", { name: "합성된 레퍼런스 보드" }).getAttribute("aria-keyshortcuts"))
      .toBe("0 + - I Escape Enter Space");
    for (const button of within(toolbar).getAllByRole("button")) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
      expect(button.getAttribute("aria-label")).toBeTruthy();
    }
    const liveStatus = container.querySelector('p[role="status"]');
    expect(liveStatus?.getAttribute("aria-live")).toBe("polite");
    expect(liveStatus?.getAttribute("aria-atomic")).toBe("true");
    expect(liveStatus?.textContent).toContain("6/7");
    expect(liveStatus?.textContent).toContain("선택한 색 #32A6D8");
    expect(screen.getByLabelText("최근 선택 색상 #32A6D8")).toBeTruthy();
    expect(container.textContent).not.toMatch(/item[-_ ]?id|filename|source url|asset[-_ ]?id/iu);
    expect(container.textContent).not.toContain("blob:reference-composite");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("합성된 레퍼런스 보드 미리보기");
  });
});
