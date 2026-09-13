import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
describe("durable save intent product wiring", () => {
  it("passes authoritative account and local document scope through the typed view", () => {
    expect(source("StudioCuttoonEditorHost.tsx")).toContain("saveIntentScope={{ ownerId: studioAuthUserId, documentKey: autosaveKey }}");
    expect(source("studio-cuttoon-editor/StudioCuttoonEditorViewSessionRest.ts")).toContain("saveIntentScope?: StudioSaveIntentScope | null");
    expect(source("studio-cuttoon-editor/StudioCuttoonEditorView.tsx")).toContain("saveIntentScope={s.saveIntentScope}");
  });
  it("acknowledges only after verified save, never a metadata or recovered-existing branch", () => {
    const pipeline = source("studio-page-save-pipeline.ts");
    const ack = pipeline.indexOf("await acknowledgeStudioDurableSaveIntent(");
    expect(ack).toBeGreaterThan(pipeline.indexOf('stagedLinkedNewWork?.outcome === "recovered-existing"'));
    expect(ack).toBeLessThan(pipeline.indexOf("clearAutosaveDurableAuthority();"));
    expect(pipeline.slice(pipeline.indexOf("} catch (err) {"))).not.toContain("acknowledgeStudioDurableSaveIntent");
  });
  it("uses the shared SQLite authority without a network or alternative database writer", () => {
    const persistence = source("studio-durable-save-intent-sqlite.ts");
    expect(persistence).toContain('from "./studio-local-database-runtime"');
    for (const forbidden of ["fetch(", "sessionStorage", "localStorage", "indexedDB", "new Worker(", "setInterval("]) {
      expect(persistence).not.toContain(forbidden);
    }
    expect(source("use-studio-durable-save-intent.ts")).not.toContain("onSaveDraft");
  });
});
