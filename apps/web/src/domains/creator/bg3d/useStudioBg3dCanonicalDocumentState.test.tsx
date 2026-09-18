// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-primitives";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { useStudioBg3dCanonicalDocumentState } from "./useStudioBg3dCanonicalDocumentState";

function primitive(id: string): BgPrimitive {
  return {
    id,
    kind: "box",
    name: id,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#ffffff",
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
    parentId: null,
  };
}

describe("useStudioBg3dCanonicalDocumentState", () => {
  it("publishes one synchronous revision for an atomic scene replacement", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    const nextDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      background: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
        color: "#123456",
      },
    };

    act(() => {
      result.current.replaceCanonicalDocumentState({
        primitives: [primitive("cube")],
        customModels: [],
        document: nextDocument,
      });
    });

    expect(result.current.canonicalRevision).toBe(1);
    expect(result.current.liveSceneRef.current).toMatchObject({
      revision: 1,
      primitives: [{ id: "cube" }],
      customModels: [],
      document: { background: { color: "#123456" } },
    });
    expect(result.current.primitives[0]?.id).toBe("cube");
    expect(result.current.sceneBaseDocument.background.color).toBe("#123456");
  });

  it("keeps transient no-op setter calls outside canonical history", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    act(() => {
      result.current.setPrimitives((current) => current);
      result.current.setCustomModels((current) => current);
      result.current.setSceneBaseDocument((current) => current);
    });
    expect(result.current.canonicalRevision).toBe(0);
    expect(result.current.liveSceneRef.current.revision).toBe(0);
  });

  it("serializes consecutive functional updates against the live revision fence", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    act(() => {
      result.current.setPrimitives((current) => [...current, primitive("a")]);
      result.current.setPrimitives((current) => [...current, primitive("b")]);
    });
    expect(result.current.liveSceneRef.current.primitives.map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
    expect(result.current.canonicalRevision).toBe(2);
  });
});
