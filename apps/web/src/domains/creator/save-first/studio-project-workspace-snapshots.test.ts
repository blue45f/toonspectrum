import { describe, expect, it, vi } from "vitest";

import { serializeStudioAutosave, type StudioAutosavePayload } from "../studio-autosave";
import type { StudioProjectDocumentEntry } from "../studio-project-document-store";
import {
  buildStudioProjectWorkspacePackageEntries,
  collectStudioProjectWorkspaceSnapshots,
  STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY,
  type StudioProjectWorkspaceSnapshotReader,
} from "./studio-project-workspace-snapshots";

const document: StudioProjectDocumentEntry = Object.freeze({
  id: "episode-1",
  projectId: "project-1",
  title: "EP01 원고",
  kind: "webtoon",
  status: "active",
  statusBeforeTrash: null,
  defaultWorkspace: "comic",
  allowedWorkspaces: ["comic", "draw"] as const,
  width: 800,
  height: 1200,
  pageCount: 1,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  lastOpenedAt: "2026-09-16T00:00:00.000Z",
});

function payload(savedAt: string, pageId: string): StudioAutosavePayload {
  return {
    version: 2,
    savedAt,
    currentPageId: pageId,
    pagesList: [{ id: pageId, canvasH: 1200, elements: [{ id: "stroke-1", type: "draw" }] }],
  } as StudioAutosavePayload;
}

function storage(values: Readonly<Record<string, string>> = {}): Storage {
  const map = new Map(Object.entries(values));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe("studio project workspace snapshots", () => {
  it("prefers the in-memory current document and does not read an older durable copy", async () => {
    const reader: StudioProjectWorkspaceSnapshotReader = {
      read: vi.fn(async () => null),
      dispose: vi.fn(async () => undefined),
    };
    const current = payload("2026-09-16T02:00:00.000Z", "current-page");
    const snapshots = await collectStudioProjectWorkspaceSnapshots({
      storage: storage(),
      projectId: "project-1",
      documents: [document],
      lastOpenedDocumentId: document.id,
      currentSnapshots: { [document.id]: current },
    }, reader);

    expect(reader.read).not.toHaveBeenCalled();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      documentId: document.id,
      authority: "memory-current",
      payload: current,
    });
  });

  it("keeps a newer tombstone authoritative over an older snapshot", async () => {
    const older = payload("2026-09-16T01:00:00.000Z", "old-page");
    const reader: StudioProjectWorkspaceSnapshotReader = {
      read: vi.fn(async (key) => key.includes("project-1")
        ? {
            key,
            authority: "opfs-journal" as const,
            state: "cleared" as const,
            savedAt: "2026-09-16T03:00:00.000Z",
            payload: null,
          }
        : {
            key,
            authority: "sqlite-fallback" as const,
            state: "snapshot" as const,
            savedAt: older.savedAt,
            payload: older,
          }),
      dispose: vi.fn(async () => undefined),
    };
    const snapshots = await collectStudioProjectWorkspaceSnapshots({
      storage: storage(),
      projectId: "project-1",
      documents: [document],
      lastOpenedDocumentId: document.id,
    }, reader);

    expect(snapshots).toEqual([]);
  });

  it("writes the real autosave payload and an index into package workspace entries", () => {
    const current = payload("2026-09-16T02:00:00.000Z", "page-1");
    const entries = buildStudioProjectWorkspacePackageEntries([document], [{
      documentId: document.id,
      key: "autosave-key",
      authority: "memory-current",
      savedAt: current.savedAt,
      payload: current,
    }]);

    expect(entries[STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY]).toContain(document.id);
    expect(entries[STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY]).toContain("document-0001.autosave.json");
    expect(entries["documents/document-0001.autosave.json"]).toContain("page-1");
    expect(entries["documents/document-0001.autosave.json"]).toContain("stroke-1");
  });

  it("can still consume the browser compatibility snapshot through an injected reader", async () => {
    const recovered = payload("2026-09-16T04:00:00.000Z", "browser-page");
    const raw = serializeStudioAutosave(recovered);
    const reader: StudioProjectWorkspaceSnapshotReader = {
      read: vi.fn(async (key) => ({
        key,
        authority: "browser-storage-compatibility" as const,
        state: "snapshot" as const,
        savedAt: recovered.savedAt,
        payload: recovered,
      })),
      dispose: vi.fn(async () => undefined),
    };
    const snapshots = await collectStudioProjectWorkspaceSnapshots({
      storage: storage({ fallback: raw }),
      projectId: "project-1",
      documents: [document],
    }, reader);

    expect(snapshots[0]?.payload.currentPageId).toBe("browser-page");
  });
});
