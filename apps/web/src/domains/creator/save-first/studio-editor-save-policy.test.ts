import { describe, expect, it } from "vitest";

import {
  createDefaultStudioSaveProfile,
  createStudioStorageBinding,
  type StudioSaveProfile,
} from "./studio-save-profile";
import { resolveStudioEditorExplicitSaveAction } from "./studio-editor-save-policy";

function input(profile: StudioSaveProfile | null) {
  return {
    status: "draft" as const,
    projectId: "project-1",
    documentId: "episode-1",
    workId: null,
    remixId: null,
    profile,
  };
}

describe("studio editor explicit save policy", () => {
  it("asks for a destination on the first explicit save of a local project document", () => {
    expect(resolveStudioEditorExplicitSaveAction(input(
      createDefaultStudioSaveProfile("project-1", {
        now: "2026-09-16T00:00:00.000Z",
      }),
    ))).toBe("choose-destination");
  });

  it("writes the project file directly after a local file destination has synced", () => {
    const base = createDefaultStudioSaveProfile("project-1", {
      now: "2026-09-16T00:00:00.000Z",
    });
    const profile: StudioSaveProfile = Object.freeze({
      ...base,
      lastManualSaveAt: "2026-09-16T00:01:00.000Z",
      bindings: Object.freeze([
        ...base.bindings,
        createStudioStorageBinding({
          id: "local-file:canonical",
          provider: "local-file",
          role: "canonical",
          syncState: "synced",
          connectionRequired: false,
          lastSyncedAt: "2026-09-16T00:01:00.000Z",
        }),
      ]),
    });
    expect(resolveStudioEditorExplicitSaveAction(input(profile))).toBe("save-local-file");
  });

  it("keeps publishing, shared works and remixes on the existing server pipeline", () => {
    const profile = createDefaultStudioSaveProfile("project-1");
    expect(resolveStudioEditorExplicitSaveAction({ ...input(profile), status: "published" }))
      .toBe("server-pipeline");
    expect(resolveStudioEditorExplicitSaveAction({ ...input(profile), workId: "server-work" }))
      .toBe("server-pipeline");
    expect(resolveStudioEditorExplicitSaveAction({ ...input(profile), remixId: "source-work" }))
      .toBe("server-pipeline");
  });
});
