import { describe, expect, it } from "vitest";

import {
  STUDIO_DRAWING_ASSIST_MAX_COORDINATE,
  areStudioDrawingAssistDocumentsEqual,
  createDefaultStudioDrawingAssistDocument,
  mirrorStudioDrawingAssistDocument,
  normalizeStudioDrawingAssistDocument,
  parseStudioDrawingAssistDocument,
  studioDrawingAssistHasContent,
} from "./studio-drawing-assist-document";

const viewport = { canvasWidth: 800, canvasHeight: 1_200 };

describe("studio drawing-assist document", () => {
  it("creates a page-centered, inactive v1 document", () => {
    expect(createDefaultStudioDrawingAssistDocument(viewport)).toEqual({
      version: 1,
      perspective: { active: false, points: [] },
      isometric: {
        active: false,
        angleDeg: 30,
        cellSize: 40,
        originX: 400,
        originY: 600,
      },
    });
  });

  it("normalizes legacy/malformed values and gives perspective the single snap owner", () => {
    expect(normalizeStudioDrawingAssistDocument({
      perspective: {
        active: true,
        points: [
          { id: "vp-a", x: 10, y: 20 },
          { id: "vp-a", x: 30, y: 40 },
          { id: "broken", x: Number.NaN, y: 1 },
          { id: "vp-b", x: STUDIO_DRAWING_ASSIST_MAX_COORDINATE * 2, y: -30 },
        ],
      },
      isometric: {
        active: true,
        angleDeg: 500,
        cellSize: 1,
        originX: Number.POSITIVE_INFINITY,
        originY: -STUDIO_DRAWING_ASSIST_MAX_COORDINATE * 2,
      },
    }, viewport)).toEqual({
      version: 1,
      perspective: {
        active: true,
        points: [
          { id: "vp-a", x: 10, y: 20 },
          { id: "vp-b", x: STUDIO_DRAWING_ASSIST_MAX_COORDINATE, y: -30 },
        ],
      },
      isometric: {
        active: false,
        angleDeg: 89,
        cellSize: 8,
        originX: 400,
        originY: -STUDIO_DRAWING_ASSIST_MAX_COORDINATE,
      },
    });

    expect(normalizeStudioDrawingAssistDocument({
      version: 2,
      perspective: { active: true, points: [{ id: "future", x: 1, y: 2 }] },
    }, viewport)).toEqual(createDefaultStudioDrawingAssistDocument(viewport));
  });

  it("strictly accepts canonical documents and rejects ambiguous or unsafe shared data", () => {
    const document = {
      ...createDefaultStudioDrawingAssistDocument(viewport),
      perspective: { active: true, points: [{ id: "vp-a", x: 100, y: 200 }] },
    };
    expect(parseStudioDrawingAssistDocument(document)).toEqual(document);
    expect(parseStudioDrawingAssistDocument({
      ...document,
      isometric: { ...document.isometric, active: true },
    })).toBeNull();
    expect(parseStudioDrawingAssistDocument({
      ...document,
      perspective: { active: true, points: [{ id: "vp-a", x: Infinity, y: 0 }] },
    })).toBeNull();
    expect(parseStudioDrawingAssistDocument({ ...document, version: 2 })).toBeNull();
  });

  it("rejects unknown keys, clamped coordinates, duplicate ids, and excess points", () => {
    const document = createDefaultStudioDrawingAssistDocument(viewport);
    expect(parseStudioDrawingAssistDocument({ ...document, future: true })).toBeNull();
    expect(parseStudioDrawingAssistDocument({
      ...document,
      perspective: { ...document.perspective, future: true },
    })).toBeNull();
    expect(parseStudioDrawingAssistDocument({
      ...document,
      perspective: {
        active: true,
        points: [{
          id: "vp-a",
          x: STUDIO_DRAWING_ASSIST_MAX_COORDINATE + 1,
          y: 0,
        }],
      },
    })).toBeNull();
    expect(parseStudioDrawingAssistDocument({
      ...document,
      perspective: {
        active: true,
        points: [
          { id: "vp-a", x: 0, y: 0 },
          { id: "vp-a", x: 1, y: 1 },
        ],
      },
    })).toBeNull();
    expect(parseStudioDrawingAssistDocument({
      ...document,
      perspective: {
        active: true,
        points: Array.from({ length: 4 }, (_, index) => ({
          id: `vp-${index}`,
          x: index,
          y: index,
        })),
      },
    })).toBeNull();
  });

  it("rejects accessor-backed objects without invoking the accessor", () => {
    const document = createDefaultStudioDrawingAssistDocument(viewport);
    let getterCalls = 0;
    const hostile = {
      version: 1,
      isometric: document.isometric,
      get perspective() {
        getterCalls += 1;
        return document.perspective;
      },
    };
    expect(parseStudioDrawingAssistDocument(hostile)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("recognizes authored guide-only content and mirrors horizontal coordinates", () => {
    const empty = createDefaultStudioDrawingAssistDocument(viewport);
    expect(studioDrawingAssistHasContent(undefined, viewport)).toBe(false);
    expect(studioDrawingAssistHasContent(empty, viewport)).toBe(false);

    const authored = {
      ...empty,
      perspective: {
        active: false,
        points: [{ id: "vp-a", x: 100, y: 250 }],
      },
      isometric: { ...empty.isometric, originX: 300 },
    };
    expect(studioDrawingAssistHasContent(authored, viewport)).toBe(true);
    expect(mirrorStudioDrawingAssistDocument(authored, 800)).toEqual({
      ...authored,
      perspective: {
        active: false,
        points: [{ id: "vp-a", x: 700, y: 250 }],
      },
      isometric: { ...authored.isometric, originX: 500 },
    });
  });

  it("compares every persisted field without relying on object identity", () => {
    const left = createDefaultStudioDrawingAssistDocument(viewport);
    const same = structuredClone(left);
    expect(areStudioDrawingAssistDocumentsEqual(left, same)).toBe(true);
    same.isometric.originX += 1;
    expect(areStudioDrawingAssistDocumentsEqual(left, same)).toBe(false);
  });
});
