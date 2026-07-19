import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function expectTokenOrder(value: string, tokens: readonly string[]): void {
  let cursor = -1;
  for (const token of tokens) {
    const index = value.indexOf(token, cursor + 1);
    expect(index, `missing or out-of-order token: ${token}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

describe("studio save payload ownership boundary", () => {
  it("keeps the leaf pure and separate from publish/compliance validation", () => {
    const payload = source("./studio-save-payload.ts");

    expect(payload).not.toMatch(/from\s+["']react["']/u);
    expect(payload).not.toMatch(/studio-publish-(?:preflight|compliance)/u);
    expect(payload).not.toMatch(
      /\b(?:fetch|Blob|File|localStorage|AbortController|AbortSignal)\b|\bapi\s*\./u,
    );
    expect(payload).not.toMatch(
      /\b(?:createWork|updateWork|updateStudioSharedDocument|assertStudioApiJsonPayloadSize)\s*\(/u,
    );
    expect(payload).not.toMatch(
      /authoritativeSaveBarrier|studioCrdt|\b(?:toast|setError|setSaving)\b/iu,
    );
    expect(payload.split("\n").length).toBeLessThanOrEqual(200);
  });

  it("keeps capture, freshness, transport, CRDT, and cleanup ordering in StudioPage", () => {
    const page = source("./StudioPage.tsx");
    const saveStart = page.indexOf('async function handleSave(status: "published" | "draft")');
    const saveEnd = page.indexOf("// 터치 기기(작은 폰)", saveStart);
    const save = page.slice(saveStart, saveEnd);

    expect(page).toContain('from "./studio-save-payload"');
    expect(save).toContain("validateStudioPublishPreflight(");
    expect(save).toContain("publishComplianceResult.readyForDestinationReview");
    expect(save).toContain("new AbortController()");
    expect(save).toContain("await authoritativeSaveBarrier(10_000)");
    expect(save).toContain("await captureReadyStageForPage(page)");
    expect(save).toContain("await downscaleDataUrl(pageImages[0] || \"\", 480)");
    expect(save).toContain("await updateStudioSharedDocument(");
    expect(save).toContain("await updateWork(");
    expect(save).toContain("await createWork(");
    expect(save).toContain("localStorage.removeItem(autosaveKey)");
    expect(save).toContain("finally {");
    expect(save).not.toMatch(/tagsText\s*\.split/u);

    expectTokenOrder(save, [
      "validateStudioPublishPreflight(",
      "sharedDocumentSaveAbortRef.current?.abort()",
      "await authoritativeSaveBarrier(10_000)",
      "await captureReadyStageForPage(page)",
      "await downscaleDataUrl(pageImages[0] || \"\", 480)",
      "buildStudioSavePayload({",
    ]);

    const sharedTransport = save.slice(save.indexOf("if (workId && sharedDocument)"));
    expectTokenOrder(sharedTransport, [
      'await import("./studio-shared-document-client")',
      "!saveScopeStillCurrent()",
      "authoritativeCrdtServerSequence === null",
      "buildStudioSharedSavePatch({",
      "assertStudioApiJsonPayloadSize(sharedPatch)",
      "await updateStudioSharedDocument(",
      "!isStudioSharedDocumentScopeCurrent(",
    ]);

    const directTransport = save.slice(
      save.indexOf('await import("@/src/infrastructure/creator-client")'),
    );
    expectTokenOrder(directTransport, [
      'await import("@/src/infrastructure/creator-client")',
      "!saveScopeStillCurrent()",
      "buildStudioDirectWorkSavePlan({",
      'if (directSavePlan.kind === "update")',
      "assertStudioApiJsonPayloadSize(directSavePlan.payload)",
      "await updateWork(",
    ]);

    expectTokenOrder(save, [
      "if (!canApplyStudioMutation(saveMutationTicket, { allowDuringSave: true })) {",
      "localStorage.removeItem(autosaveKey)",
      "navigate(`/create/${savedWorkId}`)",
      "catch (err)",
      "finally {",
      "documentSaveInFlightRef.current = false",
    ]);
  });
});
