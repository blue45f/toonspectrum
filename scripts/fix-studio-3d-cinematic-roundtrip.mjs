import { readFile, writeFile } from "node:fs/promises";

const TEST_PATH =
  "apps/web/src/domains/creator/bg3d/studio-bg3d-procedural-starter-pack.test.ts";

const source = await readFile(TEST_PATH, "utf8");
const startMarker =
  '  it("round-trips the complete catalog through the real scene runtime adapter", () => {';
const endMarker =
  '\n\n  it("fails closed on unknown ids, collisions, invalid transforms, and malformed usage", () => {';

const start = source.indexOf(startMarker);
if (start < 0) {
  throw new Error("Missing aggregate catalog round-trip test");
}
if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
  throw new Error("Aggregate catalog round-trip test is not unique");
}

const end = source.indexOf(endMarker, start + startMarker.length);
if (end < 0) {
  throw new Error("Missing round-trip test end marker");
}

const replacement = `  it("round-trips every catalog asset independently through the real scene runtime adapter", () => {
    for (const asset of STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS) {
      const plan = planStudioBg3dProceduralStarterInsertion({
        assetId: asset.id,
        occupiedNodeIds: [],
        currentUsage: EMPTY_USAGE,
        limits: DEFAULT_LIMITS,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;

      const primitives: BgPrimitive[] = [...plan.primitives];
      const adapted = adaptStudioBg3dRuntimeToDocument({
        primitives,
        customModels: [],
        attachmentByStorageModelId: new Map(),
      });
      expect(adapted.counts.droppedPrimitives).toBe(0);
      expect(adapted.counts.emittedPrimitives).toBe(primitives.length);
      expect(adapted.diagnostics).toEqual([]);
      expect(adapted.document.nodes).toHaveLength(primitives.length);
      expect(new Set(adapted.document.nodes.map((node) => node.id)).size).toBe(
        primitives.length,
      );
    }
  });`;

await writeFile(
  TEST_PATH,
  `${source.slice(0, start)}${replacement}${source.slice(end)}`,
  "utf8",
);

console.log("Replaced aggregate catalog round-trip with per-asset runtime validation.");
