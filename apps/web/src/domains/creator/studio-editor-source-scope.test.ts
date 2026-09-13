import { describe, expect, it } from "vitest";

import { studioAutosaveKey } from "./studio-autosave";
import { studioCheckpointKey } from "./studio-checkpoint-loader";
import { STUDIO_DOCUMENT_WORKSPACES } from "./studio-document-workspace";
import { isStudioSourceHydrationPending } from "./studio-editor-scope";
import { studioEditorPersistenceWorkId, studioEditorSourceRoute } from "./studio-editor-source-scope";
import { parseStudioWorkspaceRoute, studioWorkspaceDocumentIdentity } from "./studio-workspace-route";

function routeFor(pathname: string, search = "") {
  const route = parseStudioWorkspaceRoute({ pathname, search });
  if (!route.valid) throw new Error(`Invalid fixture route: ${pathname}`);
  return route;
}

describe("local manuscript source identity", () => {
  it.each(["ep01-new", "document-existing", "83000000-0000-4000-8000-000000000001"])(
    "does not require a server record for canonical document %s in any workspace",
    (documentId) => {
      for (const workspace of STUDIO_DOCUMENT_WORKSPACES) {
        const route = routeFor(`/studio/p/project-1/d/${documentId}`, `?workspace=${workspace.id}`);
        const source = studioEditorSourceRoute(route);
        expect(source.workId).toBeNull();
        expect(source.documentId).toBe(documentId);
        expect(source.documentWorkspace).toBe(workspace.id);
        expect(source.canonicalPathname).toBe(route.canonicalPathname);
        expect(studioWorkspaceDocumentIdentity(source)).toBe(studioWorkspaceDocumentIdentity(route));
        expect(isStudioSourceHydrationPending(source.workId, source.remixSourceWorkId, false)).toBe(false);
        expect(route.workId).toBe(documentId);
      }
    },
  );

  it.each([
    ["/studio/work/server-work/canvas", "", "server-work", null],
    ["/studio/canvas", "?id=legacy-work", "legacy-work", null],
    ["/studio/remix/source-work/canvas", "", null, "source-work"],
  ])("retains the fail-closed source gate for %s", (pathname, search, workId, remixId) => {
    const route = routeFor(pathname!, search!);
    const source = studioEditorSourceRoute(route);
    expect(source).toBe(route);
    expect(source.workId).toBe(workId);
    expect(source.remixSourceWorkId).toBe(remixId);
    expect(isStudioSourceHydrationPending(source.workId, source.remixSourceWorkId, false)).toBe(true);
  });

  it("leaves unsaved drafts local", () => {
    for (const pathname of ["/studio/canvas", "/studio/draft/draft-1"]) {
      const route = routeFor(pathname);
      expect(studioEditorSourceRoute(route)).toBe(route);
      expect(isStudioSourceHydrationPending(route.workId, route.remixSourceWorkId, false)).toBe(false);
    }
  });
});

describe("local recovery compatibility", () => {
  it.each(["ep01-existing", "document/한글"])("keeps autosave and checkpoints reachable for %s", (documentId) => {
    const source = studioEditorSourceRoute(routeFor(`/studio/p/project-1/d/${encodeURIComponent(documentId)}`));
    const workId = studioEditorPersistenceWorkId(source.documentId, source.workId);
    const legacyScope = { userId: "owner-1", workId: documentId, remixId: null };
    const sourceScope = { userId: "owner-1", workId, remixId: source.remixSourceWorkId };
    expect(studioAutosaveKey(sourceScope)).toBe(studioAutosaveKey(legacyScope));
    expect(studioCheckpointKey(sourceScope)).toBe(studioCheckpointKey(legacyScope));
    expect(studioAutosaveKey(sourceScope)).not.toBe(studioAutosaveKey({ userId: "owner-1" }));
  });

  it("does not collapse different documents or accounts into a shared slot", () => {
    const key = (userId: string, documentId: string) => studioAutosaveKey({
      userId, workId: studioEditorPersistenceWorkId(documentId, null),
    });
    expect(key("owner-1", "document-a")).not.toBe(key("owner-1", "document-b"));
    expect(key("owner-1", "document-a")).not.toBe(key("owner-2", "document-a"));
  });

  it("keeps server-work, remix and new-draft storage behavior unchanged", () => {
    expect(studioEditorPersistenceWorkId(null, "server-work")).toBe("server-work");
    expect(studioEditorPersistenceWorkId(null, null)).toBeNull();
  });
});
