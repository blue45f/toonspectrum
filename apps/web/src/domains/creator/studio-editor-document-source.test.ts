import { describe, expect, it } from "vitest";

import { resolveStudioEditorDocumentRoute, studioEditorPersistenceWorkId } from "./studio-editor-document-source";
import { createStudioProjectDocument } from "./studio-project-document-store";
import { parseStudioWorkspaceRoute, studioWorkspaceDocumentIdentity } from "./studio-workspace-route";

import type { StudioProjectDocumentStorage } from "./studio-project-document-store";

function storage(): StudioProjectDocumentStorage {
  const entries = new Map<string, string>();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } };
}

function route(href: string) {
  const { pathname, search } = new URL(href, "https://www.toonstudio.cloud");
  const parsed = parseStudioWorkspaceRoute({ pathname, search });
  if (!parsed.valid) throw new Error(`Invalid test route: ${pathname}`);
  return parsed;
}

function localDocument(store: StudioProjectDocumentStorage, projectId = "project-qa") {
  return createStudioProjectDocument(store, projectId, {
    id: "document-qa",
    title: "QA document",
    kind: "webtoon",
    createdAt: "2026-09-13T00:00:00Z",
  });
}

function projectRoute(projectId = "project-qa", workspace = "draw") {
  return route(`/studio/p/${projectId}/d/document-qa?workspace=${workspace}`);
}

describe("local project document source isolation", () => {
  it("does not hydrate a registered local document through the creator work API", () => {
    const store = storage();
    localDocument(store);
    const original = projectRoute();
    const resolved = resolveStudioEditorDocumentRoute(original, store);
    expect(resolved.workId).toBeNull();
    expect(resolved.projectId).toBe(original.projectId);
    expect(resolved.documentId).toBe(original.documentId);
    expect(original.workId).toBe("document-qa");
    expect(studioWorkspaceDocumentIdentity(resolved)).toBe(studioWorkspaceDocumentIdentity(original));
  });

  it("preserves canonical identity when changing workspace", () => {
    const store = storage();
    localDocument(store);
    const draw = resolveStudioEditorDocumentRoute(projectRoute("project-qa", "draw"), store);
    const comic = resolveStudioEditorDocumentRoute(projectRoute("project-qa", "comic"), store);
    expect(draw.workId).toBeNull();
    expect(comic.workId).toBeNull();
    expect(studioWorkspaceDocumentIdentity(draw)).toBe(studioWorkspaceDocumentIdentity(comic));
  });

  it("does not infer locality from a generated-looking id", () => {
    const original = projectRoute();
    expect(resolveStudioEditorDocumentRoute(original, storage())).toBe(original);
  });

  it("does not use a matching document from a different project", () => {
    const store = storage();
    localDocument(store, "different-project");
    const original = projectRoute();
    expect(resolveStudioEditorDocumentRoute(original, store)).toBe(original);
  });

  it("keeps explicit server-work routes remote even when ids overlap", () => {
    const store = storage();
    localDocument(store);
    const original = route("/studio/work/document-qa/canvas");
    expect(resolveStudioEditorDocumentRoute(original, store)).toBe(original);
  });

  it("keeps new drafts and remixes unchanged", () => {
    for (const pathname of ["/studio/canvas", "/studio/remix/work-qa/canvas"]) {
      const original = route(pathname);
      expect(resolveStudioEditorDocumentRoute(original, storage())).toBe(original);
    }
  });

  it("keeps unavailable storage fail-closed", () => {
    const original = projectRoute();
    expect(resolveStudioEditorDocumentRoute(original, null)).toBe(original);
    expect(resolveStudioEditorDocumentRoute(original, {
      getItem: () => { throw new Error("Storage denied"); },
      setItem: () => undefined,
    })).toBe(original);
  });

  it("keeps corrupt metadata fail-closed", () => {
    const original = projectRoute();
    expect(resolveStudioEditorDocumentRoute(original, {
      getItem: () => "{bad json",
      setItem: () => undefined,
    })).toBe(original);
  });
});

describe("existing document recovery key compatibility", () => {
  it("retains a local document's previous work-based recovery identity", () => {
    expect(studioEditorPersistenceWorkId(null, "project-qa", "document-qa")).toBe("document-qa");
  });

  it("does not redirect a real server work's recovery identity", () => {
    expect(studioEditorPersistenceWorkId("server-work", "project-qa", "document-qa")).toBe("server-work");
  });

  it("keeps drafts and incomplete project identities on their existing keys", () => {
    expect(studioEditorPersistenceWorkId(null, null, null)).toBeNull();
    expect(studioEditorPersistenceWorkId(null, undefined, undefined)).toBeNull();
    expect(studioEditorPersistenceWorkId(null, null, "document-qa")).toBeNull();
  });
});


describe("separate fresh drawing recovery", () => {
  it("isolates explicit drafts from each other and preserves the legacy draft slot", () => {
    const first = studioEditorPersistenceWorkId(null, null, null, "draft-a");
    const second = studioEditorPersistenceWorkId(null, null, null, "draft-b");
    expect(first).toBe("draft:draft-a");
    expect(second).not.toBe(first);
    expect(studioEditorPersistenceWorkId(null, null, null)).toBeNull();
  });
  it("never lets a draft identity replace an existing work or project identity", () => {
    expect(studioEditorPersistenceWorkId("server", null, null, "draft")).toBe("server");
    expect(studioEditorPersistenceWorkId(null, "project", "document", "draft")).toBe("document");
  });
});
