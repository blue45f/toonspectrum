import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPage = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = studioPage.indexOf(start);
  const endIndex = studioPage.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return studioPage.slice(startIndex, endIndex);
}

describe("Studio OPFS autosave product boundary", () => {
  it("loads the heavy authority lazily and disposes the document-scoped session", () => {
    const setup = sourceBetween(
      "const autosaveOpfsSessionRef",
      "const [scenarioImageReferenceDocument",
    );

    expect(setup).toContain('import("./studio-autosave-opfs-session")');
    expect(setup).toContain("createStudioAutosaveOpfsSession(autosaveKey)");
    expect(setup).toContain("autosaveOpfsSessionRef.current = sessionPromise");
    expect(setup).toContain("session?.dispose()");
    expect(studioPage).not.toContain(
      'import { StudioAutosaveOpfsSession } from "./studio-autosave-opfs-session";',
    );
  });

  it("commits normal autosave through OPFS before updating the browser recovery cache", () => {
    const autosave = sourceBetween(
      "// 오토세이브 임시저장 리스너",
      "// 서버 자동저장",
    );

    expect(autosave).toContain("persistStudioAutosaveWithOpfsPrimary");
    expect(autosave).toContain("sessionPromise ?? Promise.resolve(null)");
    expect(autosave).toContain("storage: globalThis.localStorage");
    expect(autosave.indexOf("persistStudioAutosaveWithOpfsPrimary")).toBeLessThan(
      autosave.indexOf("studioLifecycleDurableGenerationRef.current = Math.max"),
    );
    expect(autosave).toContain("The diagnostic below reports both an unavailable OPFS authority");
  });

  it("reconciles the newest durable checkpoint before exposing the recovery banner", () => {
    const discovery = sourceBetween(
      "// 로드 시 임시저장 확인 리스너",
      "function prepareStudioDocumentReplacement",
    );

    expect(discovery).toContain("reconcileStudioAutosaveWithOpfsPrimary");
    expect(discovery).toContain("saved = reconciliation.candidate");
    expect(discovery.indexOf("saved = reconciliation.candidate")).toBeLessThan(
      discovery.indexOf("setHasAutosave(Boolean(saved))"),
    );
    expect(discovery).toContain("if (cancelled) return");
  });

  it("records a durable tombstone for explicit clear and successful server save", () => {
    const clear = sourceBetween(
      "function clearAutosaveDurableAuthority()",
      "function downloadAutosaveBackup()",
    );
    const saveSuccess = sourceBetween(
      "{ workId: savedWorkId, userScope: saveAuthScopeKey },",
      "if (!keepSharedEditorOpen)",
    );

    expect(clear).toContain("session?.clear()");
    expect(clear).toContain("function clearAutosave()");
    expect(clear.indexOf("clearAutosaveDurableAuthority()")).toBeLessThan(
      clear.indexOf("localStorage.removeItem(autosaveKey)"),
    );
    expect(saveSuccess).toContain("clearAutosaveDurableAuthority()");
    expect(saveSuccess.indexOf("clearAutosaveDurableAuthority()")).toBeLessThan(
      saveSuccess.indexOf("localStorage.removeItem(autosaveKey)"),
    );
  });

  it("keeps pagehide synchronous while opportunistically mirroring its exact payload", () => {
    const lifecycle = sourceBetween(
      "persistPendingStrokeEmergencyAutosaveRef.current = (reason) =>",
      "function applyStudioProjectSnapshotWithPreparedDocuments",
    );

    expect(lifecycle).toContain("writeStudioLifecycleAutosave(");
    expect(lifecycle).toContain("session?.write(emergency.payload)");
    expect(lifecycle).toContain(
      "The synchronous lifecycle sidecar remains the",
    );
  });
});
