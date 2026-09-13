import { describe, expect, it } from "vitest";

import { studioDocumentHref } from "./studio-document-workspace";
import { isStudioSourceHydrationPending } from "./studio-editor-scope";
import { resolveStudioLocalDocumentSource } from "./studio-local-document-source";
import { createStudioProjectWithInitialDocument } from "./studio-project-creation";
import {
  createStudioProjectDocument,
  studioProjectDocumentStorageKey,
  trashStudioProjectDocument,
} from "./studio-project-document-store";
import {
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
  createStudioProject,
  trashStudioProject,
} from "./studio-project-library-store";
import { parseStudioWorkspaceRoute, type StudioWorkspaceRoute } from "./studio-workspace-route";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const CREATED_AT = "2026-09-13T05:00:00.000Z";
function fixture(storage = new MemoryStorage()) {
  return { storage, ...createStudioProjectWithInitialDocument(storage, {
    title: "새 웹툰", kind: "webtoon", createdAt: CREATED_AT,
  }) };
}
function route(href: string): StudioWorkspaceRoute {
  const url = new URL(href, "https://studio.invalid");
  const result = parseStudioWorkspaceRoute({ pathname: url.pathname, search: url.search });
  if (!result.valid) throw new Error(result.errorCode);
  return result;
}

describe("local manuscript source identity", () => {
  it("opens a real newly created local project without a nonexistent server source", () => {
    const { storage, document, project, href } = fixture();
    const before = [...storage.values];
    const parsed = route(href);
    expect(parsed.workId).toBe(document.id); // Reproduces the former incorrect network id.
    const result = resolveStudioLocalDocumentSource(parsed, storage);
    expect(result.redirectHref).toBeNull();
    expect(result.route).toMatchObject({ workId: null, projectId: project.id, documentId: document.id });
    expect(isStudioSourceHydrationPending(result.route.workId, null, false)).toBe(false);
    expect([...storage.values]).toEqual(before);
  });

  it("reopens the same stored document without mutating its saved metadata or recovery bytes", () => {
    const { storage, document, href } = fixture();
    storage.setItem(`toonspectrum-studio-autosave:v12:owner:work:${document.id}`, "original ink");
    const before = [...storage.values];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(resolveStudioLocalDocumentSource(route(href), storage).route.workId).toBeNull();
    }
    expect([...storage.values]).toEqual(before);
  });

  it.each(["canvas", "comic", "animation", "bg3d"])(
    "repairs the registered legacy project /%s link before mounting a remote editor", (surface) => {
      const { storage, project, document } = fixture();
      const search = "?room=team-a&focus=page-2&language=ko-KR";
      const result = resolveStudioLocalDocumentSource(
        route(`/studio/work/${project.id}/${surface}`), storage, search,
      );
      const target = new URL(result.redirectHref ?? "", "https://studio.invalid");
      expect(target.pathname).toBe(`/studio/p/${project.id}/d/${document.id}`);
      expect(target.searchParams.get("workspace")).toBe(
        surface === "canvas" ? "draw" : surface === "bg3d" ? "3d" : surface,
      );
      expect(target.searchParams.get("room")).toBe("team-a");
      expect(target.searchParams.get("focus")).toBe("page-2");
      expect(target.searchParams.get("language")).toBe("ko-KR");
      expect(resolveStudioLocalDocumentSource(route(result.redirectHref!), storage).route.workId).toBeNull();
    },
  );

  it("resolves a registered legacy document id, not just a project id", () => {
    const { storage, project, document } = fixture();
    const result = resolveStudioLocalDocumentSource(route(`/studio/work/${document.id}/canvas`), storage);
    expect(result.redirectHref).toBe(studioDocumentHref({
      projectId: project.id, documentId: document.id, workspace: "draw",
    }));
  });

  it.each(["project-v9ppyd", "ep01-106v6sn", "document-by5o4d", "real-server-work"])(
    "never guesses source authority from the id prefix: %s", (id) => {
      const parsed = route(`/studio/work/${id}/canvas`);
      expect(resolveStudioLocalDocumentSource(parsed, new MemoryStorage()).route).toBe(parsed);
      expect(isStudioSourceHydrationPending(parsed.workId, null, false)).toBe(true);
    },
  );

  it("preserves normal remote canonical documents, remixes and version reads", () => {
    const { storage, project, document, href } = fixture();
    for (const [url, search] of [
      [`/studio/p/${project.id}/d/remote-work?workspace=draw`, ""],
      [`/studio/remix/${document.id}/canvas`, ""],
      [href, "?version=revision-2"],
    ]) {
      const parsed = route(url!);
      expect(resolveStudioLocalDocumentSource(parsed, storage, search).route).toBe(parsed);
    }
  });

  it("does not unlock trashed documents or projects", () => {
    const a = fixture();
    trashStudioProjectDocument(a.storage, a.project.id, a.document.id);
    const parsed = route(a.href);
    expect(resolveStudioLocalDocumentSource(parsed, a.storage).route).toBe(parsed);
    const b = fixture();
    trashStudioProject(b.storage, b.project.id);
    expect(resolveStudioLocalDocumentSource(route(b.href), b.storage).route.workId).toBe(b.document.id);
  });

  it("does not substitute another document for a missing last-opened target", () => {
    const { storage, project, document } = fixture();
    createStudioProjectDocument(storage, project.id, { title: "다른 원고", kind: "webtoon" });
    trashStudioProjectDocument(storage, project.id, document.id);
    const parsed = route(`/studio/work/${project.id}/canvas`);
    expect(resolveStudioLocalDocumentSource(parsed, storage)).toEqual({ route: parsed, redirectHref: null });
  });

  it("refuses ambiguous document aliases across projects", () => {
    const { storage, document } = fixture();
    const other = createStudioProject(storage, { title: "다른 프로젝트", kind: "webtoon" });
    createStudioProjectDocument(storage, other.id, { id: document.id, title: "다른 문서", kind: "webtoon" });
    const parsed = route(`/studio/work/${document.id}/canvas`);
    expect(resolveStudioLocalDocumentSource(parsed, storage).redirectHref).toBeNull();
    expect(resolveStudioLocalDocumentSource(parsed, storage, `?project=${other.id}`).redirectHref)
      .toContain(`/studio/p/${other.id}/d/${document.id}`);
  });

  it.each(["library", "documents", "denied", "unavailable"])(
    "keeps the source locked when local authority cannot be established: %s", (failure) => {
      const { storage, project, href } = fixture();
      if (failure === "library") storage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, "broken");
      if (failure === "documents") storage.setItem(studioProjectDocumentStorageKey(project.id), "{}");
      const sourceStorage = failure === "denied"
        ? { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} }
        : failure === "unavailable" ? null : storage;
      const parsed = route(href);
      const result = resolveStudioLocalDocumentSource(parsed, sourceStorage);
      expect(result.route).toBe(parsed);
      expect(result.redirectHref).toBeNull();
    },
  );
});
