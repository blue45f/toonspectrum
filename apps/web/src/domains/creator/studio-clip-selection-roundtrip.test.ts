import { readFileSync } from "node:fs";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planStudioDrawPointerStart } from "./brush/studio-draw-pointer-start-plan";
import { studioDrawElementToCrdtStroke } from "./live/studio-crdt-draw-bridge";
import { studioCrdtStrokeToDrawElement } from "./live/studio-crdt-page-bridge";
import * as clipRuntime from "./studio-clips";
import { elBounds } from "./studio-element-geometry";
import { openStudioLocalDatabase } from "./studio-local-database";
import { createStudioSavedClipSqliteRepository } from "./studio-saved-clip-sqlite-repository";
import { copyStudioSmartShapeSnapshot } from "./studio-smart-shape-copy";
import { commitStudioSmartShapeEdit, createStudioSmartShapePath, restoreStudioSmartShapeOriginal } from "./studio-smart-shape-edit";

import type { DrawEl } from "./studio-element-model";
import type { StudioLocalDatabase } from "./studio-local-database";
import type { StudioSavedClipSqliteRepository } from "./studio-saved-clip-sqlite-repository";

const host = ts.createSourceFile("Host.tsx", readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8",
), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.FunctionDeclaration>();
function find(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name && ["shiftEl", "saveSelectionAsClip"].includes(node.name.text)) declarations.set(node.name.text, node);
  else ts.forEachChild(node, find);
}
find(host);
if (declarations.size !== 2) throw new Error("Missing product clip selection functions");
const executable = ts.transpileModule([...declarations.values()].map((node) => node.getText(host)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const databases: StudioLocalDatabase[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function authoredPen(): DrawEl {
  const { element } = planStudioDrawPointerStart({
    id: "authored", position: { x: 10.25, y: 20.5 },
    pointer: { pointerType: "pen", pressure: 0.5, timeStamp: 123 },
    drawMode: "pen", drawShape: "line", shapeFill: false, color: "#7c3aed", strokeWidth: 8,
    brushOpacity: 1, brush: "pen", stampTuning: null, brushDynamics: {},
    stabilizer: 0, stabilizerMode: "standard", velocitySensitivity: 0.65, pressureCurve: 1,
    positionScale: 1, brushTip: { tiltEnabled: false, angleDeg: 0, roundness: 1 },
    symmetry: { type: "none", centerX: 360, centerY: 540, radialCount: 6 },
  });
  const completed = { ...element, points: [10.25, 20.5, 30.75, 40.125, 80.625, 25.25] };
  // Complete the start sample as pointer moves do, keeping all authored channels aligned.
  for (const field of ["pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures", "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets"] as const) {
    if (element[field]) completed[field] = Array.from({ length: 3 }, (_, index) => field === "sampleTimeOffsets" ? index * 16 : element[field]![0]!);
  }
  return completed;
}

function selectionFunctions(selected: DrawEl, repository: StudioSavedClipSqliteRepository, clipId = "saved-clip") {
  const context = {
    ...clipRuntime, selected, elements: [selected], elBounds, copyStudioSmartShapeSnapshot,
    uid: () => clipId, editorMountedRef: { current: true }, setMenu: vi.fn(),
    commitSavedClipMutation: async (save: (repository: StudioSavedClipSqliteRepository) => Promise<unknown>) => save(repository),
  };
  return new Function(...Object.keys(context), `${executable}; return { saveSelectionAsClip, shiftEl };`)(...Object.values(context)) as {
    saveSelectionAsClip(): Promise<void>;
    shiftEl(element: DrawEl, x: number, y: number): DrawEl;
  };
}

describe("authored selection to saved clip retains canonical document data", () => {
  it.each([false, true])("saves a real pen producer through Host and SQLite (Smart Shape=%s)", async (smartShape) => {
    const original = authoredPen();
    // These are real optional own properties from pointer-start, not a synthetic malformed input.
    expect(Object.hasOwn(original, "stamp")).toBe(true);
    expect(original.stamp).toBeUndefined();
    const source = smartShape ? commitStudioSmartShapeEdit(original, "rect", createStudioSmartShapePath(original, "rect"))! : original;
    expect(source).not.toBeNull();
    const before = structuredClone(source);
    const database = await openStudioLocalDatabase({ vfs: "memory" });
    databases.push(database);
    const repository = createStudioSavedClipSqliteRepository({ acquireDatabase: async () => database });
    await repository.save({ id: "existing", name: "기존 클립", createdAt: 1, els: [{ id: "keep", type: "text", text: "preserve" }] });
    vi.stubGlobal("prompt", () => "교정한 펜");
    const functions = selectionFunctions(source, repository);

    await functions.saveSelectionAsClip();

    const reopened = createStudioSavedClipSqliteRepository({ acquireDatabase: async () => database });
    const clips = await reopened.list();
    expect(clips.map(({ id }) => id)).toEqual(["saved-clip", "existing"]);
    const saved = clips[0]!.els[0] as DrawEl;
    const bounds = elBounds(source);
    expect(saved.points).toEqual(source.points.map((value, index) => value - (index % 2 ? bounds.y : bounds.x)));
    expect(Object.hasOwn(saved, "stamp")).toBe(false);
    expect(saved.inkInput).toEqual(original.inkInput);
    expect(saved.strokeWidth).toBe(original.strokeWidth);
    expect(saved.pressures).toEqual(source.pressures);
    expect(source).toStrictEqual(before);
    expect(Object.hasOwn(source, "stamp")).toBe(true);

    if (smartShape) {
      const shifted = functions.shiftEl(saved, 100, 200);
      const inserted = copyStudioSmartShapeSnapshot(shifted, { ...shifted, id: "inserted", groupId: "new-group", hidden: false, locked: false });
      const corrected = commitStudioSmartShapeEdit(inserted, "ellipse", createStudioSmartShapePath(inserted, "ellipse"))!;
      const crdt = studioDrawElementToCrdtStroke("page-copy", corrected);
      const restored = restoreStudioSmartShapeOriginal(studioCrdtStrokeToDrawElement({ ...crdt, status: "finalized", deleted: false, orderIndex: 0 }) as DrawEl)!;
      expect(restored.points).toEqual(original.points.map((value, index) => value - (index % 2 ? bounds.y : bounds.x) + (index % 2 ? 200 : 100)));
      expect(restored).toMatchObject({ id: "inserted", groupId: "new-group", hidden: false, locked: false, inkInput: original.inkInput, strokeWidth: original.strokeWidth });
      expect(restored.pressures).toEqual(original.pressures);
    }
    // insertClip creates an own groupId: undefined for ungrouped clips; a second save must work too.
    const shifted = functions.shiftEl(saved, 100, 200);
    const inserted = copyStudioSmartShapeSnapshot(shifted, { ...shifted, id: "inserted-again", groupId: undefined, hidden: false, locked: false });
    expect(Object.hasOwn(inserted, "groupId")).toBe(true);
    await selectionFunctions(inserted, reopened, "resaved-clip").saveSelectionAsClip();
    const resaved = (await reopened.list())[0]!.els[0] as DrawEl;
    expect(resaved.id).toBe("inserted-again");
    expect(resaved.points).toEqual(saved.points);
    expect(Object.hasOwn(resaved, "groupId")).toBe(false);
    if (smartShape) {
      expect(restoreStudioSmartShapeOriginal(resaved)?.points).toEqual(restoreStudioSmartShapeOriginal(saved)?.points);
      expect(restoreStudioSmartShapeOriginal(resaved)?.pressures).toEqual(original.pressures);
    }
    expect((await reopened.list()).map(({ id }) => id)).toEqual(["resaved-clip", "saved-clip", "existing"]);
  });
});


describe("selection projection keeps strict JSON storage", () => {
  it("omits only absent object values without mutating retained metadata", () => {
    const metadata = JSON.parse('{"__proto__":{"label":"retained"},"unknown":{"samples":[0,0.25,null],"name":"원본"}}');
    metadata.unknown.absent = undefined;
    const source = { id: "draw", metadata, optional: undefined };
    const before = structuredClone(source);
    const [prepared] = clipRuntime.prepareStudioSavedClipElements([source]);
    expect(prepared).toStrictEqual({ id: "draw", metadata: JSON.parse('{"__proto__":{"label":"retained"},"unknown":{"samples":[0,0.25,null],"name":"원본"}}') });
    expect(source).toStrictEqual(before);
    expect(Object.getPrototypeOf((prepared as { metadata: object }).metadata)).toBe(Object.prototype);
    const clip = { id: "clip", name: "clip", createdAt: 1, els: [source] };
    expect(() => clipRuntime.serializeStudioSavedClipLibrary([clip])).toThrow(/canonical JSON/);
    expect(() => clipRuntime.serializeStudioSavedClipLibrary([{ ...clip, els: [prepared] }])).not.toThrow();
  });

  it.each([
    ["undefined array entry", [undefined]], ["sparse array", Array(1)],
    ["NaN", NaN], ["Infinity", Infinity], ["negative zero", -0],
    ["BigInt", BigInt(1)], ["function", () => 1], ["symbol", Symbol("invalid")], ["class instance", new Date(0)],
  ])("rejects %s rather than changing document data", (_label, value) => {
    expect(() => clipRuntime.prepareStudioSavedClipElements([{ id: "draw", metadata: value }])).toThrow();
  });

  it("rejects accessors without evaluating them", () => {
    const getter = vi.fn(() => undefined);
    const source = Object.defineProperty({ id: "draw" }, "metadata", { get: getter, enumerable: true });
    expect(() => clipRuntime.prepareStudioSavedClipElements([source])).toThrow(/접근자/);
    expect(getter).not.toHaveBeenCalled();
  });

  it("leaves the existing SQLite library untouched when authored metadata is invalid", async () => {
    const database = await openStudioLocalDatabase({ vfs: "memory" });
    databases.push(database);
    const repository = createStudioSavedClipSqliteRepository({ acquireDatabase: async () => database });
    const existing = { id: "existing", name: "보존", createdAt: 1, els: [{ id: "keep", type: "text", text: "보존" }] };
    await repository.save(existing);
    const source = Object.assign(authoredPen(), { metadata: { samples: [1, NaN, 3] } });
    vi.stubGlobal("prompt", () => "invalid");
    await expect(selectionFunctions(source, repository).saveSelectionAsClip()).rejects.toThrow(/비정규 숫자/);
    expect(await repository.list()).toStrictEqual([existing]);
    expect(Number.isNaN(source.metadata.samples[1])).toBe(true);
  });
});
