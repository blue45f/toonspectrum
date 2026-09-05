import { describe, expect, it } from "vitest";

import {
  brushLabCanCompose,
  composeBrushLabSnapshot,
  readBrushLabDraft,
  writeBrushLabDraft,
  type BrushLabSource,
} from "./studio-brush-lab-model";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";

describe("Brush Lab product adapter", () => {
  it("starts with the canonical composable core brush", () => {
    const snapshot = readBrushLabDraft(null);
    expect(snapshot.brushId).toBe("ink-particle");
    expect(brushLabCanCompose(snapshot)).toBe(true);
  });

  it("rejects carriers that do not consume the full portable trait set", async () => {
    const result = await composeBrushLabSnapshot(DEFAULT_STUDIO_BRUSH_SNAPSHOT, {}, [], () => true);
    expect(result).toEqual({ ok: false, reason: "incompatible-carrier" });
  });

  it("preserves brush identity, program set and deterministic seed when composing", async () => {
    const base = readBrushLabDraft(null);
    const selection = await materializeStudioBrushCatalogSelection("dry-media");
    expect(selection?.brushDynamics).toBeTruthy();
    const source: BrushLabSource = { id: "dry-media", name: "Dry", mediaGroup: "dry", selection: selection! };
    const result = await composeBrushLabSnapshot(base, { tip: "dry-media", surface: "dry-media" }, [source], () => true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.brushId).toBe(base.brushId);
    expect(result.snapshot.enginePrograms).toEqual(base.enginePrograms);
    expect(result.snapshot.brushDynamics.seed).toBe(base.brushDynamics.seed);
    expect(result.snapshot.brushDynamics.tip).toEqual(selection!.brushDynamics!.tip);
    expect(result.snapshot.brushDynamics.grain).toEqual(selection!.brushDynamics!.grain);
  });

  it("fails atomically for an unknown source", async () => {
    const result = await composeBrushLabSnapshot(readBrushLabDraft(null), { tip: "unknown" }, [], () => true);
    expect(result).toMatchObject({ ok: false, reason: "missing-source" });
  });

  it("round-trips a normalized snapshot without creating another library format", () => {
    const snapshot = readBrushLabDraft(null);
    expect(readBrushLabDraft(writeBrushLabDraft(snapshot))).toEqual(snapshot);
  });

  it.each(["{broken", "[]", '{"kind":"toonstudio-brush-lab-draft","version":99}', "x".repeat(1024 * 1024 + 1)])(
    "recovers safely from an invalid or oversized editing draft",
    (raw) => { expect(readBrushLabDraft(raw)).toEqual(readBrushLabDraft(null)); },
  );
});
