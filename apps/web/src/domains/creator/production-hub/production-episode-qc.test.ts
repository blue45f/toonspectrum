import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate, RevisionRef } from "@toonstudio/core/production";

import { createProductionDemoProject } from "./production-demo";
import { buildEpisodePipelinePlan } from "./production-episode-operations";
import { deriveEpisodeQcChecklist, type EpisodeQcItemId } from "./production-episode-qc";

const NOW = new Date("2026-09-17T00:00:00.000Z");

const visualRef: RevisionRef = {
  id: "visual-episode-13-final",
  lineage: "visual",
  revision: 5,
  digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  createdAt: "2026-09-16T00:00:00.000Z",
};
const integratedRef: RevisionRef = {
  id: "integrated-episode-13-final",
  lineage: "integrated",
  revision: 2,
  digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  createdAt: "2026-09-16T01:00:00.000Z",
};

function itemStatus(aggregate: ProductionProjectAggregate, episodeId: string, itemId: EpisodeQcItemId) {
  return deriveEpisodeQcChecklist(aggregate, episodeId, NOW)?.items.find((item) => item.id === itemId)?.status;
}

/** 데모 13화를 공정 작업까지 전부 끝난 상태로 만든다. 검수 정책은 13화에 없어 게이트는 skipped가 된다. */
function readyAggregate(): ProductionProjectAggregate {
  const base = createProductionDemoProject();
  const episode = base.episodes.find((entry) => entry.episodeId === "episode-13");
  if (!episode) throw new Error("데모 13화가 없습니다.");
  const plan = buildEpisodePipelinePlan({
    aggregate: base,
    episode,
    releaseAt: "2026-10-02T09:00:00.000Z",
    rebaselineExisting: true,
  });
  const approvedTasks = plan.tasks.map((task) => ({ ...task, status: "approved" as const }));
  const episodes = base.episodes.map((entry) => entry.episodeId === "episode-13"
    ? {
        ...entry,
        state: "publish-ready" as const,
        storyLockApproved: true,
        thumbnailLockApproved: true,
        jointProofApproved: true,
        creditPreflightPassed: true,
        publicationPreflightPassed: true,
        openBlockerCount: 0,
        visualRevisionRef: visualRef,
        integratedRevisionRef: integratedRef,
        plannedReleaseAt: "2026-10-02T09:00:00.000Z",
      }
    : entry);
  return { ...base, episodes, tasks: [...base.tasks.filter((task) => !(task.scope.kind === "episode" && task.scope.id === "episode-13")), ...approvedTasks] };
}

describe("episode QC checklist", () => {
  it("없는 회차는 null을 돌려준다", () => {
    expect(deriveEpisodeQcChecklist(createProductionDemoProject(), "episode-999", NOW)).toBeNull();
  });

  it("데모 12화는 막힌 질문 때문에 게시 준비가 아니다", () => {
    const checklist = deriveEpisodeQcChecklist(createProductionDemoProject(), "episode-12", NOW);
    expect(checklist?.ready).toBe(false);
    expect(checklist?.blockedCount).toBeGreaterThan(0);
    expect(itemStatus(createProductionDemoProject(), "episode-12", "blockers")).toBe("blocked");
  });

  it("데모 13화는 게시 마감 미설정이 막힌 항목에 들어간다", () => {
    const aggregate = createProductionDemoProject();
    expect(itemStatus(aggregate, "episode-13", "release-schedule")).toBe("blocked");
    expect(deriveEpisodeQcChecklist(aggregate, "episode-13", NOW)?.releaseAt).toBeNull();
  });

  it("검수 정책이 없는 회차는 게이트 항목이 skipped이고 나머지로 판정한다", () => {
    const aggregate = readyAggregate();
    expect(itemStatus(aggregate, "episode-13", "review-gate")).toBe("skipped");
    const checklist = deriveEpisodeQcChecklist(aggregate, "episode-13", NOW);
    expect(checklist?.blockedCount).toBe(0);
    expect(checklist?.ready).toBe(true);
    expect(checklist?.passedCount).toBe(checklist?.applicableCount);
  });

  it("공정 작업이 하나라도 승인 전이면 전 공정 완료가 막힌다", () => {
    const ready = readyAggregate();
    const tasks = ready.tasks.map((task) => task.processKey === "color" && task.scope.kind === "episode" && task.scope.id === "episode-13"
      ? { ...task, status: "in-progress" as const }
      : task);
    const aggregate = { ...ready, tasks };
    expect(itemStatus(aggregate, "episode-13", "processes")).toBe("blocked");
    expect(deriveEpisodeQcChecklist(aggregate, "episode-13", NOW)?.ready).toBe(false);
  });

  it("검수 정책이 있는데 필수 레인이 미승인이면 게이트가 게시를 막는다", () => {
    const base = createProductionDemoProject();
    const episodes = base.episodes.map((entry) => entry.episodeId === "episode-12"
      ? {
          ...entry,
          storyLockApproved: true,
          thumbnailLockApproved: true,
          jointProofApproved: true,
          creditPreflightPassed: true,
          publicationPreflightPassed: true,
          openBlockerCount: 0,
          visualRevisionRef: visualRef,
          integratedRevisionRef: integratedRef,
        }
      : entry);
    const tasks = base.tasks.map((task) => task.scope.kind === "episode" && task.scope.id === "episode-12"
      ? { ...task, status: "approved" as const }
      : task);
    const aggregate = { ...base, episodes, tasks };
    // 데모 12화 정책은 필수 레인 3개인데 결정은 narrative 조건부 승인 1건뿐이다.
    expect(itemStatus(aggregate, "episode-12", "review-gate")).toBe("blocked");
  });

  it("이미 게시된 회차는 ready로 판정한다", () => {
    const base = createProductionDemoProject();
    const episodes = base.episodes.map((entry) => entry.episodeId === "episode-13"
      ? { ...entry, state: "published" as const }
      : entry);
    const checklist = deriveEpisodeQcChecklist({ ...base, episodes }, "episode-13", NOW);
    expect(checklist?.published).toBe(true);
    expect(checklist?.ready).toBe(true);
  });

  it("막힌 항목에는 풀러 갈 화면이 붙는다", () => {
    const checklist = deriveEpisodeQcChecklist(createProductionDemoProject(), "episode-13", NOW);
    const blocked = checklist?.items.filter((item) => item.status === "blocked") ?? [];
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((item) => item.target !== null)).toBe(true);
    expect(checklist?.items.find((item) => item.id === "release-schedule")?.target).toEqual({
      kind: "surface",
      surface: "schedule",
    });
  });
});
