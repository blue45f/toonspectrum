import { describe, expect, it } from "vitest";
import { SCENE3D_SPECIALIST_BUNDLE_ENTRIES as entries, verifyScene3dSpecialistBundle } from "./verify-scene3d-specialist-bundle.mjs";
function fixture() {
  const manifest = Object.fromEntries(Object.values(entries).map((key) => [key, { imports: [], isDynamicEntry: ![entries.app, entries.studio, entries.editor].includes(key) }]));
  manifest["node_modules/@sparkjsdev/spark/dist/spark.module.js"] = { imports: [], isDynamicEntry: true };
  return manifest;
}
const files = ["specialist.worker-a1b2.js"];
describe("specialist production isolation gate", () => {
  it("allows arbitrary lazy payload size while keeping initial scenes independent", () => {
    expect(verifyScene3dSpecialistBundle(fixture(), files).status).toBe("passed");
  });
  it.each([entries.app, entries.studio, entries.editor])("rejects an eager specialist in %s", (source) => {
    const manifest = fixture(); manifest[source].imports.push(entries.tools);
    expect(() => verifyScene3dSpecialistBundle(manifest, files)).toThrow("leaked into startup");
  });
  it("rejects missing Worker output and main-thread processing kernels", () => {
    expect(() => verifyScene3dSpecialistBundle(fixture(), [])).toThrow("Worker");
    const manifest = fixture(); manifest["specialist-navigation.ts"] = { imports: [] };
    expect(() => verifyScene3dSpecialistBundle(manifest, files)).toThrow("escaped the Worker");
  });
});
