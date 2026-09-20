import { describe, expect, it } from "vitest";

import {
  readStudioExactResumeContext,
  removeStudioExactResumeContext,
  studioExactResumeHref,
  studioExactResumeRequested,
  studioExactResumeSourceReady,
  studioExactResumeSummary,
  writeStudioExactResumeContext,
  type StudioExactResumeStorage,
} from "./studio-exact-resume-context";

describe("exact resume source authority", () => {
  const ready = { sourceHydrated: true, sourceHydrationPending: false, remoteSource: false,
    autosaveChecked: true, hasAutosave: false, localDocumentLocked: false };
  it.each([
    { autosaveChecked: false }, { hasAutosave: true }, { localDocumentLocked: true },
    { sourceHydrated: false }, { sourceHydrationPending: true },
  ])("keeps local resume pending while source/recovery is unresolved: %j", (pending) => {
    expect(studioExactResumeSourceReady({ ...ready, ...pending })).toBe(false);
    expect(studioExactResumeSourceReady(ready)).toBe(true);
  });
  it("allows a hydrated read-only server document without granting edits or consuming a pending source", () => {
    expect(studioExactResumeSourceReady({ ...ready, remoteSource: true, localDocumentLocked: true,
      autosaveChecked: false })).toBe(true);
    expect(studioExactResumeSourceReady({ ...ready, remoteSource: true, sourceHydrationPending: true })).toBe(false);
  });
});

class MemoryStorage implements StudioExactResumeStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const BASE = {
  projectId: "project-1",
  documentId: "episode-12",
  workspace: "comic" as const,
  pageId: "page-7",
  selectedElementIds: ["bubble-1", "bubble-1", "panel-4"],
  zoom: 1.75,
  scrollLeft: 320,
  scrollTop: 1_480,
  tool: "draw" as const,
  drawMode: "pen" as const,
  focus: "cut:37",
  language: "ko-KR",
  sourceVersion: "approved-18",
  updatedAt: "2026-09-17T09:00:00.000Z",
};

describe("studio exact resume context", () => {
  it("round-trips one bounded context per project document and de-duplicates selections", () => {
    const storage = new MemoryStorage();
    const written = writeStudioExactResumeContext(storage, BASE);
    const restored = readStudioExactResumeContext(storage, BASE.projectId, BASE.documentId);

    expect(written.selectedElementIds).toEqual(["bubble-1", "panel-4"]);
    expect(restored).toEqual(written);
    expect(restored).toMatchObject({
      workspace: "comic",
      pageId: "page-7",
      zoom: 1.75,
      scrollLeft: 320,
      scrollTop: 1_480,
      tool: "draw",
      drawMode: "pen",
    });
  });

  it("fails closed for corrupted or cross-document data without deleting the source", () => {
    const storage = new MemoryStorage();
    writeStudioExactResumeContext(storage, BASE);
    const [key] = storage.values.keys();
    if (!key) throw new Error("storage key missing");
    storage.values.set(key, JSON.stringify({ ...BASE, schemaVersion: 1, zoom: "huge" }));

    expect(readStudioExactResumeContext(storage, BASE.projectId, BASE.documentId)).toBeNull();
    expect(storage.values.has(key)).toBe(true);
    expect(readStudioExactResumeContext(storage, BASE.projectId, "another-document")).toBeNull();
  });

  it("builds a canonical document URL with an explicit latest-resume request", () => {
    const storage = new MemoryStorage();
    const context = writeStudioExactResumeContext(storage, BASE);
    const href = studioExactResumeHref({
      projectId: BASE.projectId,
      documentId: BASE.documentId,
      workspace: "draw",
      context,
    });

    expect(href).toBe(
      "/studio/p/project-1/d/episode-12?focus=cut%3A37&language=ko-KR&resume=latest&version=approved-18&workspace=comic",
    );
    expect(studioExactResumeRequested(new URL(href, "https://example.test").search)).toBe(true);
    expect(studioExactResumeRequested("?resume=latest&resume=latest")).toBe(false);
  });

  it("summarizes the trusted position and removes only the requested document context", () => {
    const storage = new MemoryStorage();
    const context = writeStudioExactResumeContext(storage, BASE);
    writeStudioExactResumeContext(storage, { ...BASE, documentId: "episode-13", pageId: "page-1" });

    expect(studioExactResumeSummary(context, "ko")).toBe("page-7 · 확대 175% · 선택 2개");
    removeStudioExactResumeContext(storage, BASE.projectId, BASE.documentId);
    expect(readStudioExactResumeContext(storage, BASE.projectId, BASE.documentId)).toBeNull();
    expect(readStudioExactResumeContext(storage, BASE.projectId, "episode-13")).not.toBeNull();
  });
});
