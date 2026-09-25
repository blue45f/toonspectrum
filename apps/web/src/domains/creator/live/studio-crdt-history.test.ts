import { describe, expect, it } from "vitest";

import {
  reconcileStudioCrdtHistory,
  reconcileStudioCrdtSceneGraphHistory,
} from "./studio-crdt-history";

import type {
  StudioCrdtPageRecord,
  StudioCrdtSceneElementRecord,
  StudioCrdtStrokeRecord,
} from "./studio-crdt-document";

interface TestElement {
  id: string;
  type: string;
  points?: number[];
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  fontSize?: number;
  fill?: string;
  rotation?: number;
}

interface TestPage {
  id: string;
  elements: TestElement[];
}

interface ScenePage extends TestPage {
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  name?: string;
}

function record(
  id: string,
  point: number,
  options: { deleted?: boolean; orderIndex?: number } = {}
): StudioCrdtStrokeRecord {
  return {
    id,
    pageId: "page-a",
    layerId: "page-root",
    status: "finalized",
    deleted: options.deleted ?? false,
    orderIndex: options.orderIndex ?? point,
    payload: {
      version: 1,
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [point, point, point + 1, point + 1],
      pressures: [0.5, 0.5],
      stroke: "#111111",
      strokeWidth: 4,
    },
  };
}

function draw(id: string, point: number): TestElement {
  return {
    id,
    type: "draw",
    points: [point, point, point + 1, point + 1],
    stroke: "#111111",
    strokeWidth: 4,
  };
}

describe("협업 이력의 불변 획 공유", () => {
  it("긴 획의 모든 센서 채널을 이력 200단계에서 한 번만 보관하고 반복 반영을 생략한다", () => {
    const remote = record("remote", 0);
    remote.payload.points = Array.from({ length: 6000 }, (_, index) => index / 2);
    remote.payload.pressures = Array.from({ length: 3000 }, (_, index) => index / 3000);
    Object.freeze(remote.payload.points);
    Object.freeze(remote.payload.pressures);
    Object.freeze(remote.payload);
    const untouched = { id: "page-b", elements: [draw("local", 4)] };
    const history: TestPage[][] = Array.from({ length: 200 }, () => [
      { id: "page-a", elements: [] }, untouched,
    ]);
    const result = reconcileStudioCrdtHistory(history, 199, [remote], null);
    const shared = result.history[0]?.[0]?.elements[0];
    expect(shared?.points).toEqual(remote.payload.points);
    expect(new Set(result.history.map((snapshot) => snapshot[0]?.elements[0])).size).toBe(1);
    expect(result.history.every((snapshot) => snapshot[1] === untouched)).toBe(true);
    const repeated = reconcileStudioCrdtHistory(result.history, 199, [remote], null);
    expect(repeated.changed).toBe(false);
    expect(repeated.history).toBe(result.history);
    expect(history[0]?.[0]?.elements).toEqual([]);

    const updated = record("remote", 8);
    Object.freeze(updated.payload.points);
    Object.freeze(updated.payload.pressures);
    Object.freeze(updated.payload);
    const next = reconcileStudioCrdtHistory(result.history, 199, [updated], null);
    expect(next.history[0]?.[0]?.elements[0]?.points).toEqual([8, 8, 9, 9]);
    expect(shared?.points).toEqual(remote.payload.points);
  });

  it("가변 입력 레코드 변경을 불변 캐시로 숨기지 않는다", () => {
    const remote = record("remote", 1);
    const history: TestPage[][] = [[{ id: "page-a", elements: [] }]];
    const result = reconcileStudioCrdtHistory(history, 0, [remote], null);
    remote.payload.points[0] = 99;
    const updated = reconcileStudioCrdtHistory(result.history, 0, [remote], null);
    expect(updated.history[0]?.[0]?.elements[0]?.points?.[0]).toBe(99);
    expect(result.history[0]?.[0]?.elements[0]?.points?.[0]).toBe(1);
  });
});

function points(history: TestPage[][], historyIndex: number, id: string): number[] | undefined {
  return history[historyIndex]?.[0]?.elements.find((element) => element.id === id)?.points;
}

function scenePage(id: string, elements: TestElement[], name = id): ScenePage {
  return { id, elements, bg: "#fff", bgGrad: null, canvasH: 1600, name };
}

function textRecord(id: string, text: string, orderIndex: number): StudioCrdtSceneElementRecord {
  return {
    id,
    pageId: "page-a",
    layerId: "lettering",
    deleted: false,
    orderIndex,
    payload: {
      version: 1,
      type: "text",
      props: {
        text, x: 10, y: 20, width: 240, fontSize: 28, fill: "#111", rotation: 0,
      },
    },
  };
}

function pageRecord(id: string, name: string, orderIndex: number): StudioCrdtPageRecord {
  return {
    id,
    deleted: false,
    orderIndex,
    payload: {
      version: 1,
      props: { bg: "#fff", bgGrad: null, canvasH: 1600, name },
    },
  };
}

describe("reconcileStudioCrdtHistory", () => {
  it("hydrates the complete initial frontier into every undo snapshot", () => {
    const history: TestPage[][] = [
      [{ id: "page-a", elements: [{ id: "legacy", type: "text" }] }],
      [{ id: "page-a", elements: [{ id: "legacy", type: "text" }] }],
    ];

    const result = reconcileStudioCrdtHistory(history, 1, [record("remote", 10)], null);

    expect(result.changed).toBe(true);
    expect(result.history[0]?.[0]?.elements.map((element) => element.id)).toEqual([
      "legacy",
      "remote",
    ]);
    expect(result.history[1]?.[0]?.elements.map((element) => element.id)).toEqual([
      "legacy",
      "remote",
    ]);
  });

  it("carries only remotely changed IDs through history and keeps untouched local undo", () => {
    const history: TestPage[][] = [
      [{ id: "page-a", elements: [draw("shared", 1)] }],
      [{ id: "page-a", elements: [draw("shared", 1), draw("local", 5)] }],
    ];
    const records = [record("shared", 20), record("local", 30)];

    const result = reconcileStudioCrdtHistory(history, 1, records, new Set(["shared"]));

    expect(points(result.history, 0, "shared")).toEqual([20, 20, 21, 21]);
    expect(points(result.history, 1, "shared")).toEqual([20, 20, 21, 21]);
    expect(points(result.history, 0, "local")).toBeUndefined();
    expect(points(result.history, 1, "local")).toEqual([30, 30, 31, 31]);
  });

  it("propagates a remote tombstone through every snapshot", () => {
    const history: TestPage[][] = [
      [{ id: "page-a", elements: [draw("deleted", 1)] }],
      [{ id: "page-a", elements: [draw("deleted", 2)] }],
    ];

    const result = reconcileStudioCrdtHistory(
      history,
      1,
      [record("deleted", 3, { deleted: true })],
      new Set(["deleted"])
    );

    expect(result.history[0]?.[0]?.elements).toEqual([]);
    expect(result.history[1]?.[0]?.elements).toEqual([]);
  });

  it("ignores a remote transaction that did not touch a stroke", () => {
    const history: TestPage[][] = [[{ id: "page-a", elements: [draw("local", 1)] }]];

    const result = reconcileStudioCrdtHistory(
      history,
      0,
      [record("local", 9)],
      new Set()
    );

    expect(result.changed).toBe(false);
    expect(result.history).toBe(history);
  });

  it("uses the full scene frontier as reorder context without overwriting an unchanged sibling", () => {
    const a: TestElement = { id: "a", type: "text", text: "A-old" };
    const b: TestElement = { id: "b", type: "text", text: "B-local-history" };
    const history: ScenePage[][] = [
      [scenePage("page-a", [a, b])],
      [scenePage("page-a", [{ ...a }, { ...b }])],
    ];

    const result = reconcileStudioCrdtSceneGraphHistory(
      history,
      1,
      {
        strokes: [],
        sceneElements: [textRecord("a", "A-remote", 5), textRecord("b", "B-frontier", 2)],
        pages: [],
        layerGroups: [],
      },
      {
        strokeIds: new Set(),
        sceneElementIds: new Set(["a"]),
        pageIds: new Set(),
        layerGroupIds: new Set(),
      }
    );

    expect(result.history[0]?.[0]?.elements.map((element) => element.id)).toEqual(["b", "a"]);
    expect(result.history[0]?.[0]?.elements[0]?.text).toBe("B-local-history");
    expect(result.history[0]?.[0]?.elements[1]?.text).toBe("A-remote");
    expect(result.history[1]?.[0]?.elements[0]?.text).toBe("B-frontier");
  });

  it("uses unchanged managed pages as order context while preserving their historical payload", () => {
    const history: ScenePage[][] = [
      [scenePage("page-a", [], "A-old"), scenePage("page-b", [], "B-local-history")],
      [scenePage("page-a", [], "A-current"), scenePage("page-b", [], "B-current")],
    ];

    const result = reconcileStudioCrdtSceneGraphHistory(
      history,
      1,
      {
        strokes: [],
        sceneElements: [],
        pages: [pageRecord("page-a", "A-remote", 5), pageRecord("page-b", "B-frontier", 2)],
        layerGroups: [],
      },
      {
        strokeIds: new Set(),
        sceneElementIds: new Set(),
        pageIds: new Set(["page-a"]),
        layerGroupIds: new Set(),
      }
    );

    expect(result.history[0]?.map((page) => page.id)).toEqual(["page-b", "page-a"]);
    expect(result.history[0]?.[0]?.name).toBe("B-local-history");
    expect(result.history[0]?.[1]?.name).toBe("A-remote");
    expect(result.history[1]?.[0]?.name).toBe("B-frontier");
  });
});
