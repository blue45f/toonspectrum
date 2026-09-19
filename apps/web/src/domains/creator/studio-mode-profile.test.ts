import { describe, expect, it } from "vitest";

import { studioDocumentWorkspaces } from "./studio-project-document-store";
import { STUDIO_PROJECT_KINDS } from "./studio-project-library-reader";
import {
  STUDIO_MODE_PROFILES,
  resolveStudioRuntimeMode,
  studioModeProfile,
} from "./studio-mode-profile";

describe("studio mode profiles", () => {
  it("covers every project kind with a valid document workspace", () => {
    expect(Object.keys(STUDIO_MODE_PROFILES).sort()).toEqual([...STUDIO_PROJECT_KINDS].sort());
    for (const kind of STUDIO_PROJECT_KINDS) {
      const profile = studioModeProfile(kind);
      expect(profile.id).toBe(kind);
      expect(studioDocumentWorkspaces(profile.document.kind)).toContain(profile.document.workspace);
      expect(profile.workflow.length).toBeGreaterThan(0);
      expect(profile.keyTools.length).toBeGreaterThan(0);
      expect(profile.aiActions.length).toBeGreaterThan(0);
      expect(profile.exports.length).toBeGreaterThan(0);
    }
  });

  it("keeps specialist modes on their specialist task workspaces", () => {
    expect(studioModeProfile("webtoon").document.taskWorkspace).toBe("pro-comic");
    expect(studioModeProfile("three-d").document.taskWorkspace).toBe("pose-3d");
    expect(studioModeProfile("animation").document.taskWorkspace).toBe("animation");
    expect(studioModeProfile("design").document.taskWorkspace).toBe("vector-design");
    expect(studioModeProfile("slides").document.taskWorkspace).toBe("slides-deck");
  });

  it("retains Slides document, tools, notes, AI, export and workflow semantics", () => {
    expect(studioModeProfile("slides")).toMatchObject({
      id: "slides",
      shell: "slides",
      document: { kind: "slides", workspace: "slides", taskWorkspace: "slides-deck" },
      launch: { density: "simple", primaryTool: "select" },
      panels: { left: ["slides"], right: ["properties", "layers", "colors"], bottom: ["speaker-notes"] },
      aiActions: ["pitch-outline", "slide-layout", "speaker-notes", "copy-suggest"],
      preview: "presentation",
      exports: ["pitch-pdf", "presentation"],
    });
    expect(studioModeProfile("slides").workflow.map(({ id }) => id))
      .toEqual(["outline", "slides", "notes", "present"]);
    expect(resolveStudioRuntimeMode({ kind: "webtoon" }, { kind: "slides" })).toBe("slides");
  });

  it("derives runtime mode from the active document before falling back to project kind", () => {
    expect(resolveStudioRuntimeMode({ kind: "webtoon" }, { kind: "design" })).toBe("design");
    expect(resolveStudioRuntimeMode({ kind: "webtoon" }, { kind: "motion" })).toBe("animation");
    expect(resolveStudioRuntimeMode({ kind: "design" }, { kind: "localization" })).toBe("webtoon");
  });
});
