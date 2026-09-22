import { describe, expect, it } from "vitest";

import {
  STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
  createStudioToonAutomationCharacter,
  createStudioToonAutomationDocument,
  hydrateStudioToonAutomationDocument,
  studioToonAutomationManifest,
  studioToonAutomationPromptBundle,
  studioToonAutomationReadiness,
  updateStudioToonAutomationDocument,
} from "./studio-toon-automation";

describe("Studio toon automation", () => {
  it("creates a gapless six-shot 30 second animation plan", () => {
    const document = createStudioToonAutomationDocument();

    expect(document.animation.targetDurationMs).toBe(
      STUDIO_TOON_AUTOMATION_TARGET_DURATION_MS,
    );
    expect(document.animation.segments).toHaveLength(6);
    expect(document.animation.segments[0]).toMatchObject({ startMs: 0, endMs: 5_000 });
    expect(document.animation.segments.at(-1)).toMatchObject({
      startMs: 25_000,
      endMs: 30_000,
    });
  });

  it("hydrates untrusted payloads with bounded references and safe defaults", () => {
    const document = hydrateStudioToonAutomationDocument({
      version: 99,
      revision: -1,
      mode: "unknown",
      scenarioReferenceAssetIds: ["a", "b", "c", "d", "e", "f", "a", 7],
      animation: {
        aspectRatio: "unsafe",
        segments: [{ id: "one", startMs: -4, endMs: 80_000, prompt: "첫 장면" }],
      },
    });

    expect(document.version).toBe(1);
    expect(document.revision).toBe(1);
    expect(document.mode).toBe("webtoon");
    expect(document.scenarioReferenceAssetIds).toEqual(["a", "b", "c", "d", "e"]);
    expect(document.animation.aspectRatio).toBe("9:16");
    expect(document.animation.segments[0]).toMatchObject({
      id: "one",
      startMs: 0,
      endMs: 30_000,
      prompt: "첫 장면",
    });
  });

  it("reports readiness only after story, references, characters and timeline are prepared", () => {
    const base = createStudioToonAutomationDocument();
    const character = {
      ...createStudioToonAutomationCharacter("하나"),
      canonicalReferences: {
        characterAssetId: "asset-character",
        styleAssetId: "asset-style-1",
        alternateStyleAssetId: "asset-style-2",
      },
    };
    const document = updateStudioToonAutomationDocument(base, {
      scenarioReferenceAssetIds: ["asset-scenario"],
      characters: [character],
      animation: {
        ...base.animation,
        segments: base.animation.segments.map((segment, index) => ({
          ...segment,
          prompt: `장면 ${index + 1} 움직임`,
        })),
      },
    });

    const readiness = studioToonAutomationReadiness({
      document,
      storyTextLength: 120,
      sceneCount: 6,
      visualBibleEntryCount: 1,
    });

    expect(readiness.ready).toBe(readiness.total);
    expect(readiness.percentage).toBe(100);
  });

  it("exports a provider-neutral manifest and readable prompt bundle", () => {
    const document = createStudioToonAutomationDocument();
    const promptBundle = studioToonAutomationPromptBundle(document);
    const manifest = studioToonAutomationManifest({
      sessionId: "session-1",
      title: "테스트 회차",
      document,
    });

    expect(promptBundle).toContain("# ToonStudio 제작 자동화 프롬프트 번들");
    expect(promptBundle).toContain("## 30초 구간 프롬프트");
    expect(manifest).toMatchObject({
      schema: "toonstudio.toon-automation",
      version: 1,
      sessionId: "session-1",
      title: "테스트 회차",
    });
  });
});
