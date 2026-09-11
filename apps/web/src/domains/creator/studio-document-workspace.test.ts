import { describe, expect, it } from "vitest";

import {
  STUDIO_DOCUMENT_WORKSPACES,
  isStudioDocumentWorkspace,
  parseStudioDocumentLocation,
  studioDocumentHref,
  studioDocumentWorkspaceToLegacySurface,
  studioDraftDocumentPathname,
  studioLegacyEditorHref,
  studioProjectDocumentPathname,
} from "./studio-document-workspace";

describe("Studio canonical document workspaces", () => {
  it("keeps the complete professional workspace set behind one document identity", () => {
    expect(STUDIO_DOCUMENT_WORKSPACES.map((workspace) => workspace.id)).toEqual([
      "draw",
      "comic",
      "image",
      "design",
      "slides",
      "storyboard",
      "whiteboard",
      "3d",
      "animation",
      "motion",
      "audio",
      "localization",
      "review",
    ]);
    expect(new Set(STUDIO_DOCUMENT_WORKSPACES.map((workspace) => workspace.id)).size).toBe(
      STUDIO_DOCUMENT_WORKSPACES.length,
    );
  });

  it("builds encoded project and draft document paths", () => {
    expect(studioProjectDocumentPathname("series/한글", "episode 01")).toBe(
      "/studio/p/series%2F%ED%95%9C%EA%B8%80/d/episode%2001",
    );
    expect(studioDraftDocumentPathname("draft/한글")).toBe(
      "/studio/draft/draft%2F%ED%95%9C%EA%B8%80",
    );
    expect(studioDocumentHref({
      projectId: "project-1",
      documentId: "episode-2",
      workspace: "comic",
      focus: "cut:34",
      language: "ko-KR",
      version: "approved-4",
      search: "?room=team-a&mode=upload&id=legacy&remix=old",
    })).toBe(
      "/studio/p/project-1/d/episode-2?focus=cut%3A34&language=ko-KR&room=team-a&version=approved-4&workspace=comic",
    );
  });

  it("parses, canonicalizes and bridges every workspace to the existing editor engine", () => {
    for (const workspace of STUDIO_DOCUMENT_WORKSPACES) {
      const result = parseStudioDocumentLocation({
        pathname: "/studio/p/project-1/d/document-2",
        search: `?workspace=${workspace.id}&focus=cut%3A2`,
      });
      expect(result.kind, workspace.id).toBe("document");
      if (result.kind !== "document") throw new Error("document fixture failed");
      expect(result.workspace).toBe(workspace.id);
      expect(result.documentKey).toBe("project:project-1:document:document-2");
      expect(result.legacyEditorHref).toContain(
        `/studio/work/document-2/${studioDocumentWorkspaceToLegacySurface(workspace.id)}`,
      );
      expect(result.legacyEditorHref).toContain(`workspace=${encodeURIComponent(workspace.id)}`);
    }
  });

  it("keeps draft documents separate while retaining collaboration query state", () => {
    const result = parseStudioDocumentLocation({
      pathname: "/studio/draft/draft-7",
      search: "?workspace=design&room=team-2&mode=upload&draft=legacy",
    });
    expect(result).toMatchObject({
      kind: "document",
      scope: "draft",
      draftId: "draft-7",
      workspace: "design",
      documentKey: "draft:draft-7",
    });
    if (result.kind !== "document") throw new Error("draft fixture failed");
    expect(result.canonicalHref).toBe(
      "/studio/draft/draft-7?room=team-2&workspace=design",
    );
    expect(result.legacyEditorHref).toBe(
      "/studio/canvas?draft=draft-7&room=team-2&workspace=design",
    );
  });

  it("maps broad creation modes onto the nearest established editor surface", () => {
    expect(studioDocumentWorkspaceToLegacySurface("draw")).toBe("canvas");
    expect(studioDocumentWorkspaceToLegacySurface("comic")).toBe("comic");
    expect(studioDocumentWorkspaceToLegacySurface("storyboard")).toBe("comic");
    expect(studioDocumentWorkspaceToLegacySurface("3d")).toBe("bg3d");
    expect(studioDocumentWorkspaceToLegacySurface("motion")).toBe("animation");
    expect(studioDocumentWorkspaceToLegacySurface("localization")).toBe("comic");
    expect(studioLegacyEditorHref({
      projectId: "project-1",
      documentId: "document-2",
      workspace: "slides",
    })).toBe(
      "/studio/work/document-2/canvas?project=project-1&workspace=slides",
    );
  });

  it("fails closed for malformed identities, duplicate state and unknown workspaces", () => {
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/../d/document-1",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-project-id" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/draft/%5C",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-draft-id" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=draw&workspace=comic",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-workspace" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=unknown",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-workspace" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?focus=cut%3A1&focus=cut%3A2",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-focus" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?language=ko&language=en",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-language" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?version=v1&version=v2",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-version" });
    expect(parseStudioDocumentLocation({
      pathname: "/studio/p/project-1/d/document-1",
      search: "?workspace=draw&language=not_a_locale",
    })).toEqual({ kind: "invalid-document", errorCode: "invalid-language" });
    expect(parseStudioDocumentLocation({ pathname: "/studio/p/project-1/overview" })).toEqual({
      kind: "not-document",
    });
    expect(isStudioDocumentWorkspace("review")).toBe(true);
    expect(isStudioDocumentWorkspace("server-lock")).toBe(false);
  });

  it("requires exactly one valid project-document or draft identity when building hrefs", () => {
    expect(() => studioDocumentHref({ workspace: "draw" })).toThrow();
    expect(() => studioDocumentHref({
      projectId: "project-1",
      documentId: "document-1",
      draftId: "draft-1",
      workspace: "draw",
    })).toThrow();
    expect(() => studioDocumentHref({
      draftId: "draft-1",
      workspace: "draw",
      focus: "",
    })).toThrow();
    expect(() => studioDocumentHref({
      draftId: "draft-1",
      workspace: "draw",
      language: "bad_tag",
    })).toThrow();
  });
});
