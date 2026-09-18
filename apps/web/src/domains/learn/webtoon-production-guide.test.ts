import { describe, expect, it } from "vitest";

import { isStudioProjectView } from "../creator/studio-project-views";

import {
  WEBTOON_PRODUCTION_STAGE_SUPPORT,
  webtoonProductionActionHref,
  webtoonProductionStagesForProjectView,
} from "@/shared/lib/webtoon-production-support";

import {
  WEBTOON_APPROVAL_GATES,
  WEBTOON_EPISODE_PIPELINE,
  WEBTOON_LIFECYCLE_PHASES,
  WEBTOON_PRODUCTION_MODELS,
  WEBTOON_ROLLING_PIPELINE,
} from "./webtoon-production-guide";

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

describe("webtoon production guide data", () => {
  it("keeps the industry production models and lifecycle complete and ordered", () => {
    expect(WEBTOON_PRODUCTION_MODELS).toHaveLength(4);
    expect(unique(WEBTOON_PRODUCTION_MODELS.map((model) => model.id))).toBe(true);
    expect(WEBTOON_LIFECYCLE_PHASES).toHaveLength(12);
    expect(WEBTOON_LIFECYCLE_PHASES.map((phase) => phase.order)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(unique(WEBTOON_LIFECYCLE_PHASES.map((phase) => phase.id))).toBe(true);
    expect(WEBTOON_LIFECYCLE_PHASES.every((phase) => (
      phase.tasks.length > 0
      && phase.outputs.length > 0
      && phase.roles.length > 0
      && phase.gate.length > 0
      && phase.studioHref.startsWith("/")
    ))).toBe(true);
  });

  it("models one episode as an ordered, reviewable production pipeline", () => {
    expect(WEBTOON_EPISODE_PIPELINE).toHaveLength(14);
    expect(WEBTOON_EPISODE_PIPELINE.map((stage) => stage.order)).toEqual(
      Array.from({ length: 14 }, (_, index) => index + 1),
    );
    expect(unique(WEBTOON_EPISODE_PIPELINE.map((stage) => stage.id))).toBe(true);
    expect(WEBTOON_EPISODE_PIPELINE.some((stage) => stage.id === "script-lock" && stage.lock)).toBe(true);
    expect(WEBTOON_EPISODE_PIPELINE.some((stage) => stage.id === "storyboard-lock" && stage.lock)).toBe(true);
    expect(WEBTOON_EPISODE_PIPELINE.some((stage) => stage.id === "qa" && stage.lock)).toBe(true);
  });

  it("keeps approval gates and rolling episodes uniquely identifiable", () => {
    expect(WEBTOON_APPROVAL_GATES).toHaveLength(12);
    expect(unique(WEBTOON_APPROVAL_GATES.map((gate) => gate.id))).toBe(true);
    expect(unique(WEBTOON_ROLLING_PIPELINE.map((item) => item.episode))).toBe(true);
    expect(WEBTOON_ROLLING_PIPELINE.some((item) => item.risk === "risk")).toBe(true);
  });

  it("maps every episode stage to concrete project conveniences", () => {
    expect(WEBTOON_PRODUCTION_STAGE_SUPPORT.map((stage) => stage.stageId)).toEqual(
      WEBTOON_EPISODE_PIPELINE.map((stage) => stage.id),
    );
    expect(WEBTOON_PRODUCTION_STAGE_SUPPORT.every((stage) => (
      stage.actions.length >= 2
      && stage.readinessChecksKo.length >= 3
      && stage.conveniencesKo.length >= 3
    ))).toBe(true);

    const projectDestinations = WEBTOON_PRODUCTION_STAGE_SUPPORT.flatMap((stage) =>
      stage.actions.map((action) => action.destination).filter((destination) => destination.kind === "project"),
    );
    expect(projectDestinations.every((destination) => isStudioProjectView(destination.section, destination.view))).toBe(true);

    expect(webtoonProductionStagesForProjectView("review", "approvals").map((stage) => stage.stageId)).toEqual([
      "script-lock",
      "storyboard-lock",
      "qa",
    ]);

    const layoutAction = WEBTOON_PRODUCTION_STAGE_SUPPORT.find((stage) => stage.stageId === "layout")?.actions[0];
    expect(layoutAction).toBeTruthy();
    expect(webtoonProductionActionHref("series/한글", layoutAction!)).toContain("/studio/work/series%2F");
  });

});
