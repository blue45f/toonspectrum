// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioProject, markStudioProjectOpened } from "../studio-project-library-store";
import { createStudioProjectDocument, archiveStudioProjectDocument, trashStudioProjectDocument, restoreStudioProjectDocument } from "../studio-project-document-store";
import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, studioProjectDocumentStorageKey } from "../studio-project-document-reader";
import { writeStudioExactResumeContext, studioExactResumeStorageKey, STUDIO_EXACT_RESUME_UPDATED_EVENT } from "../studio-exact-resume-context";
import { createWorkspaceResumeStore } from "./studio-workspace-resume-store";
import { readWorkspaceResume, EMPTY_WORKSPACE_RESUME } from "./studio-workspace-resume";

const disposers: (() => void)[] = [];
const storage = () => window.localStorage;
function fixture(id = "work") {
  createStudioProject(storage(), { id, title: `작품 ${id}`, kind: "webtoon" });
  const doc = createStudioProjectDocument(storage(), id, { id: "first", title: "원고 첫째", kind: "webtoon" });
  return { project: markStudioProjectOpened(storage(), id, doc.id), doc };
}
function watch(project = fixture().project) {
  const store = createWorkspaceResumeStore({ project, locale: "ko", readStorage: storage, host: window });
  const notify = vi.fn(); disposers.push(store.subscribe(notify));
  return { store, notify, project };
}
const exact = (projectId = "work", zoom = 2) => writeStudioExactResumeContext(storage(), {
  projectId, documentId: "first", workspace: "draw", pageId: "page-2", zoom,
}, window);
const signal = (key: string | null, storageArea = storage()) => window.dispatchEvent(new StorageEvent("storage", { key, storageArea }));
beforeEach(() => storage().clear());
afterEach(() => { disposers.splice(0).forEach((dispose) => dispose()); vi.restoreAllMocks(); });

describe("read-only live workspace resume", () => {
  it("does not read storage for a personal studio", () => {
    const read = vi.fn(() => { throw new Error("unavailable"); });
    expect(readWorkspaceResume(read, null, "ko")).toBe(EMPTY_WORKSPACE_RESUME);
    expect(read).not.toHaveBeenCalled();
  });
  it("retains exact destination and never writes metadata while resolving", () => {
    const { project } = fixture(); exact();
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(readWorkspaceResume(storage, project, "ko")).toMatchObject({ status: "ready", target: {
      href: "/studio/p/work/d/first?resume=latest&workspace=draw", documentId: "first", exact: true,
    } });
    expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });
  it.each([archiveStudioProjectDocument, trashStudioProjectDocument])("does not substitute another manuscript after %s", (mutate) => {
    const { project } = fixture();
    createStudioProjectDocument(storage(), project.id, { id: "neighbour", title: "다른 원고", kind: "webtoon" });
    mutate(storage(), project.id, "first");
    expect(readWorkspaceResume(storage, project, "ko")).toMatchObject({ status: "unavailable", target: {
      href: "/studio/p/work/production?view=documents", documentId: "first", exact: false,
    } });
  });
  it("treats missing or corrupted document metadata as unavailable instead of opening another work", () => {
    const { project } = fixture(); storage().setItem(studioProjectDocumentStorageKey("work"), "{broken");
    expect(readWorkspaceResume(storage, project, "ko").status).toBe("unavailable");
    storage().removeItem(studioProjectDocumentStorageKey("work"));
    expect(readWorkspaceResume(storage, project, "ko").status).toBe("unavailable");
  });
  it("coalesces same-turn resume events and keeps unchanged snapshot identity", async () => {
    const { store, notify } = watch(); const before = store.getSnapshot();
    expect(store.refresh()).toBe(before);
    for (let i = 0; i < 20; i++) exact("work", 3);
    await Promise.resolve();
    expect(notify).toHaveBeenCalledOnce();
    expect(store.getSnapshot().target?.summary).toContain("300%");
    const after = store.getSnapshot(); store.refresh(); expect(store.getSnapshot()).toBe(after);
  });
  it("re-reads canonical state and ignores forged event destinations", async () => {
    const { store, notify } = watch(); const before = store.getSnapshot();
    window.dispatchEvent(new CustomEvent(STUDIO_EXACT_RESUME_UPDATED_EVENT, { detail: {
      projectId: "work", href: "https://untrusted.invalid", documentId: "injected",
    } }));
    await Promise.resolve(); expect(store.getSnapshot()).toBe(before); expect(notify).not.toHaveBeenCalled();
  });
  it("ignores unrelated project and session-storage invalidations", async () => {
    const { store, notify } = watch(); const before = store.getSnapshot();
    window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, { detail: { projectId: "other" } }));
    window.dispatchEvent(new CustomEvent(STUDIO_EXACT_RESUME_UPDATED_EVENT, { detail: { projectId: "other" } }));
    signal("unrelated"); signal(studioProjectDocumentStorageKey("work"), window.sessionStorage);
    await Promise.resolve(); expect(store.getSnapshot()).toBe(before); expect(notify).not.toHaveBeenCalled();
  });
  it("invalidates a removed last document immediately and restores only that document", () => {
    const { store } = watch();
    trashStudioProjectDocument(storage(), "work", "first", { target: window });
    expect(store.getSnapshot().status).toBe("unavailable");
    restoreStudioProjectDocument(storage(), "work", "first", { target: window });
    expect(store.getSnapshot()).toMatchObject({ status: "ready", target: { documentId: "first" } });
  });
  it.each([null, studioProjectDocumentStorageKey("work")])("handles cross-tab clear/removal (%s)", (key) => {
    const { store } = watch(); storage().removeItem(studioProjectDocumentStorageKey("work")); signal(key);
    expect(store.getSnapshot().status).toBe("unavailable");
  });
  it("refreshes exact resume metadata from another tab", () => {
    const { store } = watch();
    writeStudioExactResumeContext(storage(), { projectId: "work", documentId: "first", workspace: "draw", zoom: 4 });
    signal(studioExactResumeStorageKey("work", "first"));
    expect(store.getSnapshot().target?.summary).toContain("400%");
  });
  it.each(["focus", "pageshow"])("rechecks saved document metadata on %s", (event) => {
    const { store } = watch(); trashStudioProjectDocument(storage(), "work", "first");
    window.dispatchEvent(new Event(event)); expect(store.getSnapshot().status).toBe("unavailable");
  });
  it("exposes exact-metadata read failures swallowed by the legacy resolver", () => {
    const { project } = fixture(); const nativeRead = storage().getItem.bind(storage());
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === studioExactResumeStorageKey("work", "first")) throw new Error("storage blocked");
      return nativeRead(key);
    });
    expect(readWorkspaceResume(storage, project, "ko")).toMatchObject({ status: "storage-error", target: { href: "/studio?view=storage" } });
    spy.mockRestore(); expect(readWorkspaceResume(storage, project, "ko").status).toBe("ready");
  });
  it("handles revoked localStorage access without retaining the previous destination", () => {
    const { project } = fixture();
    expect(readWorkspaceResume(() => { throw new Error("denied"); }, project, "ko").status).toBe("storage-error");
  });
  it("cancels queued updates and removes listeners after the last unsubscribe", async () => {
    const { project } = fixture();
    const store = createWorkspaceResumeStore({ project, locale: "ko", readStorage: storage, host: window });
    const notify = vi.fn(); const stop = store.subscribe(notify);
    const before = store.getSnapshot(); exact(); stop();
    await Promise.resolve(); window.dispatchEvent(new Event("focus"));
    expect(store.getSnapshot()).toBe(before); expect(notify).not.toHaveBeenCalled();
    disposers.push(store.subscribe(notify));
    expect(store.getSnapshot().target?.exact).toBe(true);
  });
});
