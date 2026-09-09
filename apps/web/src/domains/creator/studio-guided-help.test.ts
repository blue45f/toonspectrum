import { describe, expect, it } from "vitest";

import { STUDIO_FEATURE_TUTORIAL_BY_ID } from "./studio-feature-tutorials";

import {
  resolveStudioActiveToolCommandId,
} from "./studio-current-tool-help";
import {
  searchStudioGuidedHelp,
  STUDIO_GUIDED_HELP_ARTICLES,
  STUDIO_GUIDED_HELP_ARTICLE_BY_ID,
  studioGuidedHelpArticleForCommand,
} from "./studio-guided-help";
import { resolveStudioHelpSurface } from "./studio-help-surface-routing";

const BASE_DRAW = { tool: "draw", drawMode: "pen" } as const;

const ACTIVE_TOOL_SIGNALS = [
  { ...BASE_DRAW, commentPlacementActive: true },
  { ...BASE_DRAW, cropActive: true },
  { ...BASE_DRAW, transformActive: true },
  { ...BASE_DRAW, liquifyArmed: true },
  { ...BASE_DRAW, dodgeBurnArmed: true },
  { ...BASE_DRAW, wetMixArmed: true },
  { ...BASE_DRAW, smudgeArmed: true },
  { ...BASE_DRAW, quickMaskArmed: true },
  { ...BASE_DRAW, eyedropperArmed: true },
  { ...BASE_DRAW, pixelSelectionTool: "rect" },
  { ...BASE_DRAW, pixelSelectionTool: "ellipse" },
  { ...BASE_DRAW, pixelSelectionTool: "lasso" },
  { tool: "hand", drawMode: "pen" },
  { tool: "select", drawMode: "pen" },
  { ...BASE_DRAW, quickShapeActive: true },
  BASE_DRAW,
  { tool: "draw", drawMode: "eraser" },
  { tool: "draw", drawMode: "pixel" },
  { tool: "draw", drawMode: "lasso-fill" },
] as const;

describe("authored Studio Guided Help graph", () => {
  it("covers every command the active-tool resolver can advertise", () => {
    const commandIds = ACTIVE_TOOL_SIGNALS.map((signal) =>
      resolveStudioActiveToolCommandId(signal),
    );
    expect(commandIds.every((commandId) => commandId !== null)).toBe(true);
    for (const commandId of commandIds) {
      expect(
        studioGuidedHelpArticleForCommand(commandId),
        `missing authored guide for ${String(commandId)}`,
      ).not.toBeNull();
    }
  });

  it("ships actionable, recoverable articles instead of title-only placeholders", () => {
    expect(STUDIO_GUIDED_HELP_ARTICLES.length).toBeGreaterThanOrEqual(20);
    for (const article of STUDIO_GUIDED_HELP_ARTICLES) {
      expect(article.summary.trim().length, article.id).toBeGreaterThan(20);
      expect(article.outcome.trim().length, article.id).toBeGreaterThan(10);
      expect(article.steps.length, article.id).toBeGreaterThanOrEqual(3);
      expect(article.problems.length, article.id).toBeGreaterThanOrEqual(1);
      expect(article.aliases.length, article.id).toBeGreaterThanOrEqual(1);
      expect(article.primaryAction.label.trim().length, article.id).toBeGreaterThan(0);
    }
  });

  it("references only tutorials that actually ship in the tutorial catalog", () => {
    for (const article of STUDIO_GUIDED_HELP_ARTICLES) {
      for (const tutorialId of article.tutorialIds ?? []) {
        expect(
          STUDIO_FEATURE_TUTORIAL_BY_ID.has(tutorialId),
          `${article.id} -> missing tutorial ${tutorialId}`,
        ).toBe(true);
      }
    }
  });

  it("keeps article ids, command ids and related edges valid", () => {
    const ids = STUDIO_GUIDED_HELP_ARTICLES.map((article) => article.id);
    const commandIds = STUDIO_GUIDED_HELP_ARTICLES.flatMap((article) =>
      article.commandId ? [article.commandId] : [],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(commandIds).size).toBe(commandIds.length);
    expect(STUDIO_GUIDED_HELP_ARTICLE_BY_ID.size).toBe(ids.length);
    for (const article of STUDIO_GUIDED_HELP_ARTICLES) {
      for (const relatedId of article.relatedIds ?? []) {
        expect(STUDIO_GUIDED_HELP_ARTICLE_BY_ID.has(relatedId), `${article.id} -> ${relatedId}`).toBe(true);
        expect(relatedId).not.toBe(article.id);
      }
    }
  });

  it.each([
    ["Paint Bucket", "tool.fill"],
    ["스포이드", "tool.eyedropper"],
    ["QuickShape", "tool.smart-shape"],
    ["레이어", "workflow.layers"],
    ["저장 복구", "workflow.recovery"],
  ])("finds %s with Korean and competitor terminology", (query, expectedId) => {
    const results = searchStudioGuidedHelp(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(({ article }) => article.id === expectedId)).toBe(true);
  });

  it("returns a bounded featured set before the user types", () => {
    const results = searchStudioGuidedHelp("", 6);
    expect(results).toHaveLength(6);
    expect(results.every(({ article }) => article.featured)).toBe(true);
  });
});

describe("help surface routing", () => {
  it("promotes current-tool requests to Guided Help without changing the channel contract", () => {
    expect(
      resolveStudioHelpSurface({
        section: "current-tool",
        toolCommandId: "tool.wet-mix",
      }),
    ).toEqual({ surface: "guided", toolCommandId: "tool.wet-mix" });
  });

  it("keeps measured diagnostics and recovery in the existing support center", () => {
    expect(resolveStudioHelpSurface({ section: "diagnostics" })).toEqual({
      surface: "measured",
      section: "diagnostics",
      toolCommandId: null,
    });
    expect(resolveStudioHelpSurface({ section: "recovery" })).toEqual({
      surface: "measured",
      section: "recovery",
      toolCommandId: null,
    });
  });
});
