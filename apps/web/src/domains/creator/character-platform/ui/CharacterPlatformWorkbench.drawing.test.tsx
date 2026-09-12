// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PerspectiveCamera, Scene } from "three";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCharacterShaperBinding } from "../../character-shaper/useCharacterShaperBinding";
import { StudioCharacterShaperDialog } from "../../character-shaper/StudioCharacterShaperDialog";
import { useStudioVrmPoserBroadcast } from "../../vrm/useStudioVrmPoserBroadcast";
import { addCharacterSurfaceInkStroke, createEmptyCharacterSurfaceInkDocument } from "../surface-ink/character-surface-ink";

import { CharacterPlatformWorkbench } from "./CharacterPlatformWorkbench";

import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    asAsyncKeyValueStore: () => ({ get: async () => null, set: async () => {}, delete: async () => {} }),
  }),
}));
vi.mock("../../vrm/StudioVrmPoserViewport", () => ({ StudioVrmPoserViewport: () => <div /> }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderWorkbench(withParent = false, withShell = false) {
  const parent = document.createElement("div");
  parent.setAttribute("role", "dialog");
  parent.setAttribute("aria-label", "캐릭터 편집기");
  parent.tabIndex = -1;
  const parentClose = document.createElement("button");
  parentClose.textContent = "캐릭터 편집기 닫기";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "캐릭터 뷰포트");
  canvas.tabIndex = 0;
  parent.append(parentClose, canvas);
  document.body.append(parent);
  const onClose = vi.fn();
  const cancelStroke = vi.fn();
  const abort = vi.fn();
  const doUndo = vi.fn();
  const doRedo = vi.fn();
  const host = {
    activeModelId: "drawing-test", status: "ready",
    libraryItems: [], savedFullStates: {}, fullStateName: "", customColors: {},
    captureRef: { current: { gl: { domElement: canvas }, scene: new Scene(), camera: new PerspectiveCamera() } },
    ...(withParent ? {
      open: true, onClose, dialogRef: { current: parent }, closeButtonRef: { current: parentClose },
      vrm: null, viewportApiRef: { current: null }, captureOperationRef: { current: null },
      texturePaintSnapshotRef: { current: null }, pendingPersistentIkCommandRef: { current: null },
      jointIkTransactionRef: { current: null }, broadcastFocusFrameRef: { current: null },
      broadcastCameraLeaseRef: { current: null }, broadcastMutationLockSnapshotRef: { current: null },
      texturePaintMutationBlockedRef: { current: false }, wardrobeMutationBlockedRef: { current: false },
      sharePoseAbortRef: { current: { abort } }, cancelActiveTexturePaintStroke: cancelStroke,
      doUndo, doRedo, vrmPropItems: [], fingerEdits: {},
    } : {}),
  } as unknown as StudioVrmPoserHost;
  function ParentKeyboard() { useStudioVrmPoserBroadcast(host); return null; }
  function Workbench() {
    const binding = useCharacterShaperBinding(host);
    return <>{withParent ? <ParentKeyboard /> : null}{withShell ? <StudioCharacterShaperDialog h={host} binding={binding} /> : null}<CharacterPlatformWorkbench h={host} binding={binding} /></>;
  }
  const view = render(<StrictMode><Workbench /></StrictMode>);
  return { parent, parentClose, canvas, onClose, cancelStroke, abort, doUndo, doRedo, dispose: () => { view.unmount(); parent.remove(); } };
}

async function startDrawing() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /품질 도구.*V2/u }));
  });
  fireEvent.click(screen.getByRole("tab", { name: "3D 펜선" }));
  fireEvent.click(screen.getByRole("switch", { name: "뷰포트에 그리기" }));
}

describe("CharacterPlatformWorkbench drawing mode", () => {
  it("handles Escape before the actual Shaper shell's existing key layer", async () => {
    const f = renderWorkbench(true, true);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => f.canvas });
    try {
      const launcher = screen.getByRole("button", { name: /품질 도구.*V2/u });
      expect(launcher.closest("[data-character-quality-launcher]")).toBeTruthy();
      await startDrawing();
      expect(document.querySelector('[data-character-shaper="true"]')).toBeTruthy();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("dialog", { name: "캐릭터 품질 워크벤치" }).getAttribute("aria-modal")).toBe("true");
      expect(f.onClose).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "캐릭터 품질 워크벤치" })).toBeNull();
      expect(f.onClose).not.toHaveBeenCalled();
      expect(document.querySelector('[data-character-shaper="true"]')).toBeTruthy();
    } finally { f.dispose(); Reflect.deleteProperty(document, "elementFromPoint"); }
  });

  it("routes ink Undo and Redo to actual ink history while preserving typing and other tabs", async () => {
    const f = renderWorkbench(true);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => f.canvas });
    try {
      await startDrawing();
      fireEvent.click(screen.getByRole("button", { name: "그리기 종료" }));
      const anchor = { meshAssetId: "drawing-test:face", topologyRevision: "v1", primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] as const, localNormal: [0, 0, 1] as const, localTangent: [1, 0, 0] as const, skinIndices: [0, 0, 0, 0] as const, skinWeights: [1, 0, 0, 0] as const, pressure: 0.5, width: 1 };
      const ink = addCharacterSurfaceInkStroke(createEmptyCharacterSurfaceInkDocument(), "default", {
        strokeId: "imported-stroke", meshAssetId: anchor.meshAssetId, topologyRevision: "v1", anchors: [anchor, { ...anchor, barycentric: [0, 1, 0] }], status: "valid",
        style: { color: "#111111", widthMode: "surface", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0, pressureOpacity: 0, smoothing: 0.4, surfaceOffset: 0.001, cap: "round", join: "round", frontFacesOnly: true },
      });
      const file = new File([JSON.stringify(ink)], "ink.json", { type: "application/json" });
      Object.defineProperty(file, "text", { value: async () => JSON.stringify(ink) });
      fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
      await act(async () => { fireEvent.change(screen.getByLabelText("캐릭터 품질 데이터 파일 선택"), { target: { files: [file] } }); });
      expect(screen.getByRole("heading", { name: "3D 펜선 · 1획" })).toBeTruthy();
      const key = (event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }, count: number) => {
        f.canvas.focus(); fireEvent.keyDown(f.canvas, event);
        expect(screen.getByRole("heading", { name: `3D 펜선 · ${count}획` })).toBeTruthy();
      };
      key({ key: "z", ctrlKey: true }, 0);
      key({ key: "z", ctrlKey: true, shiftKey: true }, 1);
      key({ key: "z", ctrlKey: true }, 0);
      key({ key: "y", ctrlKey: true }, 1);
      key({ key: "z", metaKey: true }, 0);
      key({ key: "z", metaKey: true, shiftKey: true }, 1);
      const color = screen.getByLabelText("3D 펜선 색"); color.focus();
      expect(fireEvent.keyDown(color, { key: "z", ctrlKey: true })).toBe(true);
      expect(screen.getByRole("heading", { name: "3D 펜선 · 1획" })).toBeTruthy();
      fireEvent.click(screen.getByRole("switch", { name: "뷰포트에 그리기" }));
      f.canvas.focus(); fireEvent.keyDown(f.canvas, { key: "z", ctrlKey: true });
      fireEvent.click(screen.getByRole("button", { name: "그리기 종료" }));
      expect(screen.getByRole("heading", { name: "3D 펜선 · 0획" })).toBeTruthy();
      expect(f.doUndo).not.toHaveBeenCalled(); expect(f.doRedo).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("tab", { name: "품질" }));
      f.canvas.focus(); fireEvent.keyDown(f.canvas, { key: "z", ctrlKey: true });
      expect(f.doUndo).toHaveBeenCalledOnce();
    } finally { f.dispose(); Reflect.deleteProperty(document, "elementFromPoint"); }
  });

  it("keeps its trigger and drawing controls in the real parent focus boundary", async () => {
    const f = renderWorkbench(true);
    // jsdom has no layout: only geometry is supplied, never the keyboard handler or binding.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => f.canvas });
    try {
      const trigger = screen.getByRole("button", { name: /품질 도구.*V2/u });
      expect(f.parent.contains(trigger)).toBe(true);
      await startDrawing();
      const panel = screen.getByRole("dialog", { name: "캐릭터 품질 워크벤치" });
      const stop = screen.getByRole("button", { name: "그리기 종료" });
      expect(f.parent.contains(panel)).toBe(true);
      f.parentClose.focus();
      fireEvent.keyDown(f.parentClose, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(stop);
      fireEvent.keyDown(stop, { key: "Tab" });
      expect(document.activeElement).toBe(f.parentClose);

      f.canvas.focus();
      fireEvent.keyDown(f.canvas, { key: "Escape" });
      expect(f.onClose).not.toHaveBeenCalled();
      expect(panel.getAttribute("aria-modal")).toBe("true");
      fireEvent.keyDown(panel, { key: "Tab" });
      const childClose = screen.getByRole("button", { name: "캐릭터 품질 워크벤치 닫기" });
      expect(document.activeElement).toBe(childClose);
      fireEvent.keyDown(childClose, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "불러오기" }));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "캐릭터 품질 워크벤치" })).toBeNull();
      expect(f.onClose).not.toHaveBeenCalled();
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      fireEvent.keyDown(trigger, { key: "Escape" });
      expect(f.cancelStroke).toHaveBeenCalledOnce();
      expect(f.abort).toHaveBeenCalledOnce();
      expect(f.onClose).toHaveBeenCalledOnce();
    } finally { f.dispose(); Reflect.deleteProperty(document, "elementFromPoint"); }
    fireEvent.keyDown(window, { key: "Escape" });
    expect(f.onClose).toHaveBeenCalledOnce();
  });

  it("keeps the drawing surface reachable and exits drawing into the existing tools", async () => {
    const f = renderWorkbench();
    try {
      await startDrawing();
      const panel = screen.getByRole("dialog", { name: "캐릭터 품질 워크벤치" });
      expect(panel.getAttribute("aria-modal")).toBe("false");
      expect(screen.queryByRole("tablist", { name: "캐릭터 품질 기능" })).toBeNull();
      f.canvas.focus();
      fireEvent.pointerDown(f.canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(f.canvas, { button: 0, pointerId: 1 });
      expect(screen.getByRole("button", { name: "그리기 종료" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "그리기 종료" }));
      expect(panel.getAttribute("aria-modal")).toBe("true");
      expect(screen.getByRole("tab", { name: "3D 펜선" }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByRole("switch", { name: "뷰포트에 그리기" }).getAttribute("aria-checked")).toBe("false");
    } finally { f.dispose(); }
  });

  it("uses Escape to stop drawing before closing the tools and restoring trigger focus", async () => {
    const f = renderWorkbench();
    try {
      await startDrawing();
      f.canvas.focus();
      fireEvent.keyDown(f.canvas, { key: "Escape" });
      expect(screen.getByRole("dialog", { name: "캐릭터 품질 워크벤치" }).getAttribute("aria-modal"))
        .toBe("true");
      expect(screen.getByRole("switch", { name: "뷰포트에 그리기" }).getAttribute("aria-checked"))
        .toBe("false");
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "캐릭터 품질 워크벤치" })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /품질 도구.*V2/u })));
    } finally { f.dispose(); }
  });
});
