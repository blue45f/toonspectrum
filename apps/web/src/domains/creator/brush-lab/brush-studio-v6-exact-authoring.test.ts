import { describe, expect, it } from "vitest";
import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program, nextBrushStudioV6Seed, normalizeBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "./brush-studio-v6-material-receipt";
import { createBrushStudioV6ExactEditorProgram, serializeBrushStudioV6Authoring } from "./brush-studio-v6-authoring-document";
import { parseBrushStudioV6Import, createBrushStudioV6EditHistory, reduceBrushStudioV6EditHistory } from "./brush-studio-v6-experiments";
import { createBrushStudioV6MaterialStroke, mapBrushStudioV6Pressure, mapBrushStudioV6Tilt } from "./brush-studio-v6-material-engine";
import { planStudioMaterialBrush } from "../brush/studio-material-brush-runtime";
import { sameBrushStudioData } from "./brush-studio-data-equality";

const fixture = () => createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("oil-hair-mixer"));

describe("exact material authoring instead of recipe approximation", () => {
  it.each(BRUSH_STUDIO_V6_RECIPES.map((recipe) => [recipe.id, recipe] as const))(
    "preserves %s through editor, JSON and product receipt", (_id, recipe) => {
      const original = createBrushStudioV6MaterialReceipt(recipe.create());
      const before = structuredClone(original);
      const program = createBrushStudioV6ExactEditorProgram(original, "exact-test", "원본");
      const restored = parseBrushStudioV6Import(serializeBrushStudioV6Authoring(program));
      expect(createBrushStudioV6MaterialReceipt(restored)).toEqual(original);
      expect(original).toEqual(before);
    });

  it.each(["permissive-only", "source-available", "noncommercial-full"] as const)(
    "preserves the internal execution profile %s", (profile) => {
      const original = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program(), profile);
      const program = createBrushStudioV6ExactEditorProgram(original, "exact", "원본");
      expect(createBrushStudioV6MaterialReceipt(parseBrushStudioV6Import(serializeBrushStudioV6Authoring(program))))
        .toEqual(original);
    });
  it.each(["flow", "opacity"] as const)("preserves zero %s instead of painting a faint stroke", (key) => {
    const original = fixture();
    const material = { ...original, tuning: { ...original.tuning, [key]: 0 } };
    const program = createBrushStudioV6ExactEditorProgram(material, "zero", "영값");
    const history = createBrushStudioV6EditHistory(program);
    const restored = parseBrushStudioV6Import(serializeBrushStudioV6Authoring(history.present));
    expect(restored.tuning[key]).toBe(0);
    expect(createBrushStudioV6MaterialReceipt(restored)).toEqual(material);
    expect(createBrushStudioV6MaterialStroke(restored).push({ x: 10, y: 10, pressure: 1 })).toEqual([]);
  });

  it("applies only explicit current-tool values without retaining a previous brush", () => {
    const a = fixture();
    const b = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("mineral-bloom"));
    const tool = { strokeWidth: 53, color: "#ABCDEF", brushOpacity: 0 };
    const first = createBrushStudioV6ExactEditorProgram(a, "a", "A", tool);
    createBrushStudioV6ExactEditorProgram(b, "b", "B");
    expect(createBrushStudioV6ExactEditorProgram(a, "a", "A", tool)).toEqual(first);
    expect(first.tuning).toEqual({ ...a.tuning, size: 53, primaryColor: "#abcdef", opacity: 0 });
    expect(first.slots).toEqual(a.slots);
  });

  it("rejects legacy material rather than silently enabling newer adapters", () => {
    const { runtime: _runtime, ...core } = fixture();
    expect(() => createBrushStudioV6ExactEditorProgram({ ...core, version: 1 }, "old", "원본"))
      .toThrow(/자동 변환/u);
  });
  it("rejects changed provider receipts and unknown material settings", () => {
    const material = fixture();
    const modified = { ...material, runtime: { ...material.runtime, bindings:
      material.runtime.bindings.map((binding) => ({ ...binding, version: "future-unsupported" })) } };
    expect(() => createBrushStudioV6ExactEditorProgram(modified, "bad", "원본")).toThrow();
    expect(() => createBrushStudioV6ExactEditorProgram({ ...material,
      tuning: { ...material.tuning, newPhysics: 1 } }, "bad", "원본")).toThrow();
  });

  it.each(["authoringVersion", "authoringFormat", "seed", "materialReceipt"])(
    "does not drop invalid envelope field %s into a default recipe", (key) => {
      const document = JSON.parse(serializeBrushStudioV6Authoring(createBrushStudioV6Program()));
      document[key] = "unsupported";
      expect(() => parseBrushStudioV6Import(JSON.stringify(document))).toThrow();
    });

  it("detects program tampering even when the receipt itself is structurally valid", () => {
    const document = JSON.parse(serializeBrushStudioV6Authoring(createBrushStudioV6Program()));
    document.tuning.flow = 0.37;
    expect(() => parseBrushStudioV6Import(JSON.stringify(document))).toThrow(/실행/u);
  });

  it("preserves legacy authoring JSON and bounds imported file size", () => {
    const program = createBrushStudioV6Program();
    expect(parseBrushStudioV6Import(JSON.stringify({ program }))).toEqual(normalizeBrushStudioV6Program(program));
    expect(() => parseBrushStudioV6Import(" ".repeat(262_145))).toThrow(/크기/u);
  });
  it("keeps texture variation changing instead of saturating the signed seed boundary", () => {
    let seed = 2_147_483_647;
    const seen = new Set<number>();
    for (let i = 0; i < 512; i += 1) {
      seed = nextBrushStudioV6Seed(seed);
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThan(0);
      expect(seed).toBeLessThan(2_147_483_647);
      expect(seen.has(seed)).toBe(false);
      seen.add(seed);
      const program = { ...createBrushStudioV6Program(), seed };
      expect(createBrushStudioV6MaterialReceipt(program).seed).toBe(seed);
    }
  });

  it("restores zero flow through edit undo and redo", () => {
    const program = normalizeBrushStudioV6Program({ ...createBrushStudioV6Program(),
      tuning: { ...createBrushStudioV6Program().tuning, flow: 0 } });
    let state = createBrushStudioV6EditHistory(program);
    state = reduceBrushStudioV6EditHistory(state, { type: "edit", program: {
      ...program, tuning: { ...program.tuning, flow: 0.8 } } });
    state = reduceBrushStudioV6EditHistory(state, { type: "undo" });
    expect(state.present.tuning.flow).toBe(0);
    expect(reduceBrushStudioV6EditHistory(state, { type: "redo" }).present.tuning.flow).toBe(0.8);
  });
  it.each(["pigment-spectral-js", "pigment-open-km-spectral", "pigment-colormix-lab"])(
    "matches editor and manuscript contact output with %s", (pigment) => {
      const base = createBrushStudioV6Program("oil-hair-mixer");
      const original = createBrushStudioV6MaterialReceipt({ ...base, slots: { ...base.slots, pigment } });
      const editor = createBrushStudioV6ExactEditorProgram(original, "parity", "원본");
      const samples = Array.from({ length: 33 }, (_, i) => ({
        x: 20 + i * 5, y: 60 + Math.sin(i / 4) * 22, p: i / 32, tx: i, ty: i / 2, twist: i * 4,
      }));
      const stroke = createBrushStudioV6MaterialStroke(editor);
      const expected = samples.flatMap((sample) => stroke.push({ x: sample.x, y: sample.y,
        pressure: mapBrushStudioV6Pressure(sample.p, editor.input),
        tilt: mapBrushStudioV6Tilt(Math.hypot(sample.tx, sample.ty), editor.input), twist: sample.twist }));
      const material = createBrushStudioV6MaterialReceipt(parseBrushStudioV6Import(serializeBrushStudioV6Authoring(editor)));
      const actual = planStudioMaterialBrush({ points: samples.flatMap((p) => [p.x, p.y]),
        pressures: samples.map((p) => p.p), tiltXs: samples.map((p) => p.tx),
        tiltYs: samples.map((p) => p.ty), twists: samples.map((p) => p.twist),
        stroke: material.tuning.primaryColor, strokeWidth: material.tuning.size, opacity: material.tuning.opacity,
        brushEnginePrograms: { version: 1, material } });
      expect(actual.length).toBeGreaterThan(0);
      expect(actual).toEqual(expected);
    });

  it("compares records independently of key order and refuses sparse/extra values", () => {
    expect(sameBrushStudioData({ b: [1], a: 0 }, { a: 0, b: [1] })).toBe(true);
    expect(sameBrushStudioData({ a: 0, hidden: {} }, { a: 0 })).toBe(false);
    expect(sameBrushStudioData(Array(1), [undefined])).toBe(false);
  });
  it("does not regenerate a deliberately missing receipt for an executable program", () => {
    const document = JSON.parse(serializeBrushStudioV6Authoring(createBrushStudioV6Program()));
    document.materialReceipt = null;
    expect(() => parseBrushStudioV6Import(JSON.stringify(document))).toThrow(/실행 정보/u);
  });

  it("refuses a profile conflict instead of adopting a different profile on autosave", () => {
    const document = JSON.parse(serializeBrushStudioV6Authoring(createBrushStudioV6Program()));
    document.licenseProfile = "permissive-only";
    expect(() => parseBrushStudioV6Import(JSON.stringify(document))).toThrow(/실행 정보/u);
  });

});
