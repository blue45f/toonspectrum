import { describe, expect, it } from "vitest";
import { canonicalProductionProcessKey, createProductionWorkflowProfile } from "@toonstudio/core/production";
import { createProductionDemoProject } from "./production-demo";
import { buildEpisodePipelinePlan, deriveEpisodeOperationsRow } from "./production-episode-operations";
import { workflowEpisodePipeline } from "./production-workflow-episode-plan";

const at = "2026-09-27T09:00:00.000Z";
const releaseAt = "2026-10-20T09:00:00.000Z";
function fixture() {
  const aggregate = createProductionDemoProject();
  const episode = aggregate.episodes.find((candidate) =>
    aggregate.tasks.some((task) => task.scope.kind === "episode" && task.scope.id === candidate.episodeId),
  );
  if (!episode) throw new Error("fixture");
  return {
    aggregate: {
      ...aggregate,
      workflowProfile: createProductionWorkflowProfile(aggregate.projectId, "solo", at),
    },
    episode,
  };
}
describe("팀 공정과 회차 운영의 연결", () => {
  it("표준 아홉 공정을 강제로 추가하지 않고 저장된 공정만 생성한다", () => {
    const { aggregate, episode } = fixture();
    const result = buildEpisodePipelinePlan({
      aggregate: { ...aggregate, tasks: [] },
      episode,
      releaseAt,
      rebaselineExisting: true,
    });
    expect(result.tasks).toHaveLength(4);
    expect(result.tasks.every((task) => task.status === "draft")).toBe(true);
    expect(result.plannedReleaseAt).toBe(releaseAt);
    expect(result.workflowRevision).toBe(1);
    expect(result.tasks.map((task) => task.processKey)).toEqual(
      aggregate.workflowProfile.steps.map((step) => step.key),
    );
  });
  it("레거시 대본·콘티 공정을 중복 생성하지 않고 작업 메모를 보존한다", () => {
    const { aggregate, episode } = fixture();
    const first = aggregate.tasks.find(
      (task) => task.scope.kind === "episode" && task.scope.id === episode.episodeId,
    );
    if (!first) throw new Error("fixture");
    const legacy = {
      ...first,
      id: "legacy-story",
      processKey: "story",
      status: "draft" as const,
      priority: "urgent" as const,
      briefBlocks: [{ id: "memo", kind: "paragraph" as const, text: "보존할 작업 메모" }],
    };
    const result = buildEpisodePipelinePlan({
      aggregate: { ...aggregate, tasks: [legacy] },
      episode,
      releaseAt,
      rebaselineExisting: true,
    });
    expect(
      result.tasks.filter((task) => canonicalProductionProcessKey(task.processKey) === "story-lock"),
    ).toHaveLength(1);
    expect(result.tasks.find((task) => task.id === legacy.id)).toMatchObject({
      priority: "urgent",
      briefBlocks: legacy.briefBlocks,
    });
    expect(result.tasks.find((task) => task.processKey === "storyboard")?.dependencyTaskIds).toEqual([
      legacy.id,
    ]);
  });
  it("단계 표시 순서를 바꿔도 의존 경로 기반 마감 간격이 유지된다", () => {
    const { aggregate } = fixture();
    const before = workflowEpisodePipeline(aggregate);
    const after = workflowEpisodePipeline({
      ...aggregate,
      workflowProfile: {
        ...aggregate.workflowProfile,
        steps: [...aggregate.workflowProfile.steps].reverse(),
      },
    });
    const offsets = (steps: typeof before) =>
      Object.fromEntries((steps ?? []).map((step) => [step.processKey, step.daysBeforeRelease]));
    expect(offsets(after)).toEqual(offsets(before));
  });
  it("게시 작업이 없어도 별도 제작 목표 마감으로 회차 일정을 표시한다", () => {
    const { aggregate, episode } = fixture();
    const row = deriveEpisodeOperationsRow(
      { ...aggregate, tasks: [] },
      { ...episode, plannedReleaseAt: releaseAt },
      new Date(at),
    );
    expect(row.releaseAt).toBe(releaseAt);
    expect(row.publicationTask).toBeNull();
    expect(row.missingProcessKeys).toEqual(aggregate.workflowProfile.steps.map((step) => step.key));
  });
  it("완료된 작업의 마감과 내용을 재배치로 바꾸지 않는다", () => {
    const { aggregate, episode } = fixture();
    const first = aggregate.tasks.find(
      (task) => task.scope.kind === "episode" && task.scope.id === episode.episodeId,
    );
    if (!first) throw new Error("fixture");
    const completed = { ...first, processKey: "story-lock", status: "done" as const, dueAt: at };
    const result = buildEpisodePipelinePlan({
      aggregate: { ...aggregate, tasks: [completed] },
      episode,
      releaseAt,
      rebaselineExisting: true,
    });
    expect(result.tasks.find((task) => task.id === completed.id)).toBe(completed);
    expect(result.preservedCompletedCount).toBe(1);
  });
  it("잘못된 마감일은 작업을 생성하기 전에 거절한다", () => {
    const { aggregate, episode } = fixture();
    expect(() =>
      buildEpisodePipelinePlan({ aggregate, episode, releaseAt: "invalid", rebaselineExisting: true }),
    ).toThrow("마감");
  });
});
