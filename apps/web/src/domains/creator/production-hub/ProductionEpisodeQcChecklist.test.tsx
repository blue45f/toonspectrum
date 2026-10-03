// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductionProjectAggregate, RevisionRef } from "@toonstudio/core/production";

import { ProductionEpisodeQcChecklist } from "./ProductionEpisodeQcChecklist";
import { createProductionDemoProject } from "./production-demo";
import { buildEpisodePipelinePlan } from "./production-episode-operations";

afterEach(cleanup);

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

function mount(aggregate: ProductionProjectAggregate, episodeId: string) {
  return render(
    <MemoryRouter>
      <ProductionEpisodeQcChecklist aggregate={aggregate} episodeId={episodeId} />
    </MemoryRouter>,
  );
}

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

describe("게시 전 QC 체크리스트 컴포넌트", () => {
  it("막힌 회차는 막힌 항목 수와 풀러 가기 링크를 보여 준다", () => {
    mount(createProductionDemoProject(), "episode-13");
    expect(screen.getByText("게시 전 QC 체크리스트")).toBeTruthy();
    expect(screen.getByText(/막힌 항목 \d+개/)).toBeTruthy();
    const fixLinks = screen.getAllByRole("link", { name: /풀러 가기/ });
    expect(fixLinks.length).toBeGreaterThan(0);
    // 게시 마감 항목은 일정 화면으로 이어진다.
    expect(fixLinks.some((link) => link.getAttribute("href")?.endsWith("/schedule"))).toBe(true);
    // 준비가 안 됐으면 발행 동선 박스는 나오지 않는다.
    expect(screen.queryByText("제작·검수 기준은 모두 통과했어요.")).toBeNull();
  });

  it("전부 통과한 회차는 준비 완료와 납품·발행 동선을 보여 준다", () => {
    mount(readyAggregate(), "episode-13");
    expect(screen.getByText("게시 준비 완료")).toBeTruthy();
    expect(screen.getByText("제작·검수 기준은 모두 통과했어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /원고 납품 화면/ }).getAttribute("href"))
      .toContain("manuscripts?manuscriptView=delivery");
    // 발행 센터 링크는 프로젝트와 제목을 쿼리로 들고 간다.
    const publishParams = new URLSearchParams(
      (screen.getByRole("link", { name: /발행 센터/ }).getAttribute("href") ?? "").split("?")[1] ?? "",
    );
    expect(publishParams.get("projectId")).toBe("sample-project");
    expect(publishParams.get("title")).toBe("밤의 우편배달부");
    expect(screen.queryByRole("link", { name: /풀러 가기/ })).toBeNull();
  });

  it("없는 회차는 아무것도 그리지 않는다", () => {
    const { container } = mount(createProductionDemoProject(), "episode-999");
    expect(container.textContent).toBe("");
  });
});
