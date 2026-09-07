import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_INSPECTOR_LAYOUT,
  STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY,
  filterStudioInspectorActions,
  loadStudioInspectorLayout,
  navigateStudioInspector,
  normalizeStudioInspectorLayout,
  saveStudioInspectorLayout,
  studioInspectorActions,
} from "./studio-inspector-layout";

describe("studio inspector layout", () => {
  it("normalizes every route axis independently", () => {
    expect(normalizeStudioInspectorLayout({
      primary: "layers", image: "fill", document: "navigator",
    })).toEqual({ primary: "layers", image: "fill", document: "navigator" });
    expect(normalizeStudioInspectorLayout({
      primary: "unknown", image: "nope", document: "grade",
    })).toEqual({ ...DEFAULT_STUDIO_INSPECTOR_LAYOUT, document: "grade" });
  });

  it("loads, saves and fails closed when workspace storage is unavailable", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    saveStudioInspectorLayout(storage, {
      primary: "document", image: "mask", document: "grade",
    });
    expect(values.has(STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY)).toBe(true);
    expect(loadStudioInspectorLayout(storage)).toEqual({
      primary: "document", image: "mask", document: "grade",
    });
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadStudioInspectorLayout(blocked)).toEqual(DEFAULT_STUDIO_INSPECTOR_LAYOUT);
    expect(() => saveStudioInspectorLayout(blocked, DEFAULT_STUDIO_INSPECTOR_LAYOUT)).not.toThrow();
  });

  it("moves one route without discarding remembered contextual panels", () => {
    const current = {
      primary: "document" as const,
      image: "retouch" as const,
      document: "grade" as const,
    };
    expect(navigateStudioInspector(current, {
      primary: "properties", image: "fill",
    })).toEqual({ primary: "properties", image: "fill", document: "grade" });
    expect(navigateStudioInspector(current, { primary: "layers" })).toEqual({
      primary: "layers", image: "retouch", document: "grade",
    });
    expect(navigateStudioInspector(
      { primary: "properties", image: "quick", document: "navigator" },
      { primary: "document" },
    )).toEqual({ primary: "document", image: "quick", document: "navigator" });
  });

  it("uses friendly image-tool names while keeping expert terms searchable", () => {
    const imageActions = studioInspectorActions({
      hasSelection: true, selectedType: "image", drawing: false,
    });
    const textActions = studioInspectorActions({
      hasSelection: true, selectedType: "text", drawing: false,
    });
    const drawActions = studioInspectorActions({
      hasSelection: true, selectedType: "draw", drawing: false,
    });

    expect(imageActions).toContainEqual(expect.objectContaining({
      id: "image-transform", label: "크기·회전",
      path: "선택 항목 › 이미지 › 크기·회전",
    }));
    expect(imageActions).toContainEqual(expect.objectContaining({
      id: "image-retouch", label: "선택·보정",
      path: "선택 항목 › 이미지 › 선택·보정",
    }));
    expect(imageActions).toContainEqual(expect.objectContaining({
      id: "image-mask", label: "원본 유지하고 가리기",
      path: "선택 항목 › 이미지 › 원본 유지하고 가리기",
    }));
    expect(textActions.map((entry) => entry.id)).not.toContain("image-fill");
    expect(drawActions.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "image-fill", "image-transform", "image-mask", "image-retouch",
    ]));
    expect(filterStudioInspectorActions(imageActions, "crop warp")).toEqual([
      expect.objectContaining({ id: "image-transform" }),
    ]);
    expect(filterStudioInspectorActions(imageActions, "크롭·변형")).toEqual([
      expect.objectContaining({ id: "image-transform" }),
    ]);
    expect(filterStudioInspectorActions(imageActions, "선택·리터치")).toEqual([
      expect.objectContaining({ id: "image-retouch" }),
    ]);
    expect(filterStudioInspectorActions(imageActions, "레이어 마스크")).toEqual([
      expect.objectContaining({ id: "image-mask" }),
    ]);
    expect(filterStudioInspectorActions(imageActions, "없는 메뉴")).toEqual([]);
  });

  it("routes leaf-property searches to a focusable inspector target", () => {
    const textActions = studioInspectorActions({
      hasSelection: true, selectedType: "text", drawing: false,
    });
    const pageActions = studioInspectorActions({
      hasSelection: false, selectedType: null, drawing: false,
    });
    expect(filterStudioInspectorActions(textActions, "자간")).toEqual([
      expect.objectContaining({
        id: "text-align",
        focusTarget: "element.text-align",
        path: "대상 › 글자 › 문단",
      }),
    ]);
    expect(filterStudioInspectorActions(textActions, "글꼴")).toEqual([
      expect.objectContaining({
        id: "typography",
        focusTarget: "element.typography",
        path: "대상 › 글자 › 글꼴",
      }),
    ]);
    expect(textActions).toContainEqual(expect.objectContaining({
      id: "selection-layout", focusTarget: "selection.geometry",
    }));
    expect(filterStudioInspectorActions(pageActions, "스냅")).toEqual([
      expect.objectContaining({
        id: "canvas-guides", focusTarget: "canvas.guide-lines",
      }),
    ]);
  });

  it("does not advertise text-only fill for speech bubbles", () => {
    const actions = studioInspectorActions({
      hasSelection: true, selectedType: "bubble", drawing: false,
    });
    const ids = actions.map((entry) => entry.id);
    expect(ids).not.toContain("text-fill");
    expect(ids).toContain("typography");
    expect(ids).toContain("text-align");
    expect(filterStudioInspectorActions(actions, "글자 채우기")).toEqual([]);
  });

  it("does not advertise targets unmounted for multi-select or shape tools", () => {
    const multi = studioInspectorActions({
      hasSelection: true, selectedType: null, drawing: false,
    });
    expect(multi.map((entry) => entry.id)).not.toContain("selection-order-align");
    expect(multi.map((entry) => entry.id)).toContain("selection-layout");

    const shape = studioInspectorActions({
      hasSelection: false,
      selectedType: null,
      drawing: true,
      drawingToolPropertiesAvailable: false,
    });
    expect(shape.map((entry) => entry.id)).not.toContain("brush-studio");
    expect(shape.map((entry) => entry.id)).not.toContain("brush-engines");
    expect(shape.map((entry) => entry.id)).toContain("drawing-properties");
  });
});
