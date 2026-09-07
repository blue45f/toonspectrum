import { describe, expect, it } from "vitest";

import { createEmptyStudioIdentityIndex } from "../studio-foundation/studio-semantic-identity";

import {
  analyzeStudioPanelRemovalImpact,
  createStudioPanelMaterializationPlan,
  materializeStudioPanelIdentity,
  resolveStudioDialogueBindingSyncState,
  resolveStudioPanelBindingSyncState,
  validateStudioPanelBinding,
  type StudioDialogueBindingV1,
  type StudioPanelBindingV1,
} from "./studio-story-visual-binding";

const NOW = "2026-09-07T00:00:00.000Z";

function binding(): StudioPanelBindingV1 {
  return {
    version: 1,
    semanticPanelId: "panel-1",
    writerPanelId: "writer-panel-1",
    comicPageId: "comic-page-1",
    comicPanelId: "comic-panel-1",
    drawPageId: "draw-page-1",
    frameElementId: "frame-1",
    baselineStoryDigest: "story-digest-1",
    baselineVisualDigest: "visual-digest-1",
    createdAt: NOW,
  };
}

describe("Studio story visual binding", () => {
  it("plans panel materialization as one cross-domain transaction", () => {
    const plan = createStudioPanelMaterializationPlan({
      semanticPanelId: "panel-1",
      writerPanelId: "writer-panel-1",
      comicPageId: "comic-page-1",
      comicPanelId: "comic-panel-1",
      drawPageId: "draw-page-1",
      frameElementId: "frame-1",
    });

    expect(plan.semanticPanelId).toBe("panel-1");
    expect(plan.commands.map((command) => command.type)).toEqual([
      "comic/add-panel",
      "page-state/add-frame-folder",
      "identity/link-panel",
      "workflow/mark-board-dirty",
      "thumbnail/mark-dirty",
    ]);
  });

  it("materializes one semantic panel across Writer Room, ComicGraph, and PageState", () => {
    const index = materializeStudioPanelIdentity(
      createEmptyStudioIdentityIndex("work:episode-1"),
      {
        semanticPanelId: "panel-1",
        writerPanelId: "writer-panel-1",
        comicPageId: "comic-page-1",
        comicPanelId: "comic-panel-1",
        drawPageId: "draw-page-1",
        frameElementId: "frame-1",
        createdAt: NOW,
      },
    );

    expect(index.links).toHaveLength(1);
    expect(index.links[0].references.map((reference) => reference.domain)).toEqual([
      "writer-room",
      "comic-graph",
      "page-state",
    ]);
    expect(validateStudioPanelBinding(binding(), index)).toEqual([]);
  });

  it("distinguishes story, visual, concurrent, detached, and orphaned states", () => {
    const source = binding();
    expect(resolveStudioPanelBindingSyncState({
      binding: source,
      currentStoryDigest: "story-digest-1",
      currentVisualDigest: "visual-digest-1",
      writerPanelExists: true,
      visualPanelExists: true,
    })).toBe("synced");
    expect(resolveStudioPanelBindingSyncState({
      binding: source,
      currentStoryDigest: "story-digest-2",
      currentVisualDigest: "visual-digest-1",
      writerPanelExists: true,
      visualPanelExists: true,
    })).toBe("story-changed");
    expect(resolveStudioPanelBindingSyncState({
      binding: source,
      currentStoryDigest: "story-digest-1",
      currentVisualDigest: "visual-digest-2",
      writerPanelExists: true,
      visualPanelExists: true,
    })).toBe("visual-changed");
    expect(resolveStudioPanelBindingSyncState({
      binding: source,
      currentStoryDigest: "story-digest-2",
      currentVisualDigest: "visual-digest-2",
      writerPanelExists: true,
      visualPanelExists: true,
    })).toBe("both-changed");
    expect(resolveStudioPanelBindingSyncState({
      binding: source,
      currentStoryDigest: null,
      currentVisualDigest: "visual-digest-1",
      writerPanelExists: false,
      visualPanelExists: true,
    })).toBe("detached");
    expect(resolveStudioPanelBindingSyncState({
      binding: source,
      currentStoryDigest: null,
      currentVisualDigest: null,
      writerPanelExists: false,
      visualPanelExists: false,
    })).toBe("orphaned");
  });

  it("tracks dialogue content separately from manual balloon layout", () => {
    const dialogue: StudioDialogueBindingV1 = {
      version: 1,
      semanticDialogueId: "dialogue-1",
      writerDialogueId: "writer-dialogue-1",
      comicBalloonId: "balloon-1",
      textElementId: "text-1",
      baselineContentDigest: "content-1",
      baselineVisualDigest: "layout-1",
      manualLineBreaks: true,
      textFitMode: "manual",
    };

    expect(resolveStudioDialogueBindingSyncState({
      binding: dialogue,
      currentContentDigest: "content-2",
      currentVisualDigest: "layout-1",
      writerDialogueExists: true,
      visualTextExists: true,
    })).toBe("story-changed");
    expect(dialogue.manualLineBreaks).toBe(true);
    expect(dialogue.textFitMode).toBe("manual");
  });

  it("defaults destructive panel removal to archive when dependencies exist", () => {
    const impact = analyzeStudioPanelRemovalImpact({
      semanticPanelId: "panel-1",
      dialogueIds: ["dialogue-1"],
      elementIds: ["element-1"],
      commentThreadIds: ["thread-1"],
      motionClipIds: ["clip-1"],
    });

    expect(impact.recommendedAction).toBe("archive");
    expect(impact.requiresConfirmation).toBe(true);
    expect(impact.affectedCommentThreadIds).toEqual(["thread-1"]);
  });

  it("reports partial visual bindings instead of silently inventing missing IDs", () => {
    const index = materializeStudioPanelIdentity(
      createEmptyStudioIdentityIndex("work:episode-1"),
      {
        semanticPanelId: "panel-1",
        writerPanelId: "writer-panel-1",
        comicPageId: "comic-page-1",
        comicPanelId: "comic-panel-1",
        drawPageId: "draw-page-1",
        frameElementId: "frame-1",
        createdAt: NOW,
      },
    );
    const invalid: StudioPanelBindingV1 = {
      ...binding(),
      comicPanelId: null,
      frameElementId: null,
    };

    expect(validateStudioPanelBinding(invalid, index).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["partial-comic-binding", "partial-draw-binding"]),
    );
  });
});
