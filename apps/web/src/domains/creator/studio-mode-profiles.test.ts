import { describe, expect, it } from "vitest";

import { studioDocumentWorkspaces } from "./studio-project-document-store";
import { STUDIO_PROJECT_KINDS } from "./studio-project-library-store";
import { STUDIO_MODE_PROFILES, resolveStudioRuntimeMode } from "./studio-mode-profiles";

describe("Studio mode profiles", () => {
  it("defines one complete product profile for every project kind", () => {
    expect(Object.keys(STUDIO_MODE_PROFILES).sort()).toEqual([...STUDIO_PROJECT_KINDS].sort());

    for (const kind of STUDIO_PROJECT_KINDS) {
      const profile = STUDIO_MODE_PROFILES[kind];
      expect(profile.id).toBe(kind);
      expect(studioDocumentWorkspaces(profile.document.kind)).toContain(profile.document.workspace);
      expect(profile.workflow.length).toBeGreaterThan(0);
      expect(profile.ai.actions.length).toBeGreaterThan(0);
      expect(profile.export.presets.length).toBeGreaterThan(0);
      expect(profile.creationPreview.outputKo).not.toBe("");
      expect(profile.creationPreview.outputEn).not.toBe("");
    }
  });

  it("gives slides and 3D their own specialist workspace layouts", () => {
    expect(STUDIO_MODE_PROFILES.slides.document.taskWorkspace).toBe("slides-deck");
    expect(STUDIO_MODE_PROFILES["three-d"].document.taskWorkspace).toBe("pose-3d");
  });
  it("resolves mixed-document projects to the document production mode", () => {
    expect(resolveStudioRuntimeMode("webtoon", "design")).toBe("design");
    expect(resolveStudioRuntimeMode("webtoon", "localization")).toBe("webtoon");
    expect(resolveStudioRuntimeMode("storyboard", "motion")).toBe("animation");
    expect(resolveStudioRuntimeMode("three-d", "three-d")).toBe("three-d");
  });
});
