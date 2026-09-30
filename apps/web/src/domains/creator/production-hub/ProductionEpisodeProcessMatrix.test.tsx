// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { StudioArtifactRecord, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { createProductionDemoProject } from "./production-demo";
import {
  ProductionEpisodeProcessMatrix,
  type ProductionProcessStageCustomization,
} from "./ProductionEpisodeProcessMatrix";
import {
  buildProductionCompareColumns,
  buildProductionProcessColumns,
  DEFAULT_PRODUCTION_PROCESS_STAGES,
  deriveProductionProcessRounds,
  filterProductionMatrixCellsByStageRules,
  isProductionStageSkippedForEpisode,
  productionStageDefaultAssignmentId,
  resolveProductionProcessStages,
  resolveProductionStageDueDate,
} from "./production-episode-process-matrix-model";
import { type ProductionMatrixCell } from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fakeRevision(id: string, kind: StudioRevisionRecord["kind"], createdAt: string): StudioRevisionRecord {
  return {
    id,
    artifactId: "artifact-1",
    kind,
    parentIds: [],
    rootGraphHash: "0".repeat(64),
    operationFirst: 1,
    operationLast: 1,
    createdBy: null,
    deviceId: "device-1",
    createdAt,
    message: null,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  } as StudioRevisionRecord;
}

function fakeProcess(
  id: string,
  kind: StudioArtifactRecord["kind"],
  episodeId: string | null,
  label: string,
  revisions: readonly StudioRevisionRecord[] = [],
): ProductionManuscriptProcess {
  const artifact = {
    id,
    projectId: "project-1",
    kind,
    title: `${label} 원고`,
    scope: {
      kind: (episodeId ? "episode" : "project") as "episode" | "project",
      id: episodeId ?? "project-1",
      episodeId,
    } as StudioArtifactRecord["scope"],
    headRevisionId: `${id}-head`,
    approvedRevisionId: null,
    ownerWorkspaceId: "workspace-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as StudioArtifactRecord;
  return {
    artifact,
    processType: "image",
    label,
    revisions,
    reviews: [],
    headRevision: null,
    submissionRevision: null,
    reviewSnapshotRevision: null,
    approvedRevision: null,
    releaseRevision: null,
    latestReview: null,
    lifecyclePhase: "editing",
    hasUnapprovedChanges: false,
    readyToDeliver: false,
    openReviewCount: 0,
    openRequiredFeedbackCount: 0,
    latestActivityAt: "2026-09-01T00:00:00.000Z",
  };
}

function fakeCell(process: ProductionManuscriptProcess): ProductionMatrixCell {
  return {
    key: `${process.artifact.scope.episodeId ?? "project"}:${process.artifact.id}`,
    episodeId: process.artifact.scope.episodeId ?? null,
    process,
    task: null,
    assigneeNames: [],
  };
}

describe("resolveProductionProcessStages", () => {
  it("기본 공정은 콘티→선화→채색→식자 순서다", () => {
    const stages = resolveProductionProcessStages();
    expect(stages.map((stage) => stage.key)).toEqual(["storyboard", "drawing", "color", "lettering"]);
    expect(stages.map((stage) => stage.label)).toEqual(["콘티", "선화", "채색", "식자"]);
    expect(stages.every((stage) => stage.visible)).toBe(true);
  });

  it("팀 커스텀으로 라벨·순서·표시 여부를 바꿀 수 있다", () => {
    const stages = resolveProductionProcessStages([
      { key: "lettering", label: "식자·교정", order: -1 },
      { key: "drawing", visible: false },
    ]);
    expect(stages.map((stage) => stage.key)).toEqual(["lettering", "storyboard", "drawing", "color"]);
    expect(stages[0]?.label).toBe("식자·교정");
    expect(stages.find((stage) => stage.key === "drawing")?.visible).toBe(false);
  });

  it("기본에 없는 키는 커스텀 단계로 뒤에 추가된다", () => {
    const stages = resolveProductionProcessStages([{ key: "proofread", label: "교정", order: 10 }]);
    expect(stages.map((stage) => stage.key)).toEqual(
      ["storyboard", "drawing", "color", "lettering", "proofread"],
    );
  });

  it("잘못된 건너뛰기 규칙과 마감일 오프셋을 정규화한다", () => {
    const stages = resolveProductionProcessStages([
      { key: "storyboard", skipRule: { mode: "episode-numbers", episodeNumbers: [0, -2, 3, 3] } },
      { key: "drawing", defaultDueOffsetDays: -5 },
    ]);
    expect(stages.find((stage) => stage.key === "storyboard")?.skipRule)
      .toEqual({ mode: "episode-numbers", episodeNumbers: [3] });
    expect(stages.find((stage) => stage.key === "drawing")?.defaultDueOffsetDays).toBeNull();
  });

  it("빈 키 입력은 무시한다", () => {
    expect(resolveProductionProcessStages([{ key: "   " }])).toHaveLength(
      DEFAULT_PRODUCTION_PROCESS_STAGES.length,
    );
  });
});

describe("isProductionStageSkippedForEpisode", () => {
  it("never 규칙은 항상 false다", () => {
    expect(isProductionStageSkippedForEpisode({ mode: "never" }, { episodeNumber: 3, dialogueDensity: "low" })).toBe(false);
  });

  it("회차 번호 규칙을 평가한다", () => {
    const rule = { mode: "episode-numbers" as const, episodeNumbers: [12] };
    expect(isProductionStageSkippedForEpisode(rule, { episodeNumber: 12, dialogueDensity: "high" })).toBe(true);
    expect(isProductionStageSkippedForEpisode(rule, { episodeNumber: 13, dialogueDensity: "high" })).toBe(false);
  });

  it("대사 밀도 규칙을 평가한다", () => {
    const rule = { mode: "dialogue-density" as const, densities: ["low" as const] };
    expect(isProductionStageSkippedForEpisode(rule, { episodeNumber: 12, dialogueDensity: "low" })).toBe(true);
    expect(isProductionStageSkippedForEpisode(rule, { episodeNumber: 12, dialogueDensity: "medium" })).toBe(false);
  });

  it("프로젝트 공통 셀은 건너뛰지 않는다", () => {
    const rule = { mode: "episode-numbers" as const, episodeNumbers: [12] };
    expect(isProductionStageSkippedForEpisode(rule, null)).toBe(false);
  });
});

describe("filterProductionMatrixCellsByStageRules", () => {
  it("건너뛰기 규칙에 걸린 회차의 셀을 제외한다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const episodeNumber = demo.episodePlans[0]?.episodeNumber ?? 12;
    const cells = [
      fakeCell(fakeProcess("a", "storyboard", episodeId, "콘티")),
      fakeCell(fakeProcess("b", "localization", episodeId, "식자")),
    ];
    const stages = resolveProductionProcessStages([
      { key: "lettering", skipRule: { mode: "episode-numbers", episodeNumbers: [episodeNumber] } },
    ]);
    const filtered = filterProductionMatrixCellsByStageRules({ aggregate: demo, cells, stages });
    expect(filtered.map((cell) => cell.process.artifact.id)).toEqual(["a"]);
  });

  it("숨김 처리된 단계의 셀은 매트릭스에서 제외한다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const cells = [
      fakeCell(fakeProcess("a", "storyboard", episodeId, "콘티")),
      fakeCell(fakeProcess("b", "localization", episodeId, "식자")),
    ];
    const stages = resolveProductionProcessStages([{ key: "lettering", visible: false }]);
    const filtered = filterProductionMatrixCellsByStageRules({ aggregate: demo, cells, stages });
    expect(filtered.map((cell) => cell.process.artifact.id)).toEqual(["a"]);
  });
});

describe("buildProductionProcessColumns", () => {
  it("단계 설정 순서대로 컬럼을 구성하고 숨긴 단계는 제외한다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const cells = [
      fakeCell(fakeProcess("a", "storyboard", episodeId, "콘티")),
      fakeCell(fakeProcess("b", "localization", episodeId, "식자")),
    ];
    const stages = resolveProductionProcessStages([{ key: "lettering", visible: false }]);
    const columns = buildProductionProcessColumns({ cells, stages });
    // lettering 단계는 숨겼으므로 기본 4단계 중 3개만 남는다.
    expect(columns.map((column) => column.key)).toEqual(["storyboard", "drawing", "color"]);
  });

  it("설정에 없는 관측 공정은 기존 라벨로 뒤에 붙인다", () => {
    const cells = [fakeCell(fakeProcess("a", "story", null, "대본"))];
    // "story"는 기본 4단계가 아니고 커스텀 설정도 없으므로 관측 공정으로 뒤에 붙는다.
    const columns = buildProductionProcessColumns({
      cells,
      stages: resolveProductionProcessStages(),
    });
    const story = columns.find((column) => column.key === "story");
    expect(story?.label).toBe("대본");
  });

  it("커스텀 라벨이 컬럼에 반영된다", () => {
    const columns = buildProductionProcessColumns({
      cells: [],
      stages: resolveProductionProcessStages([{ key: "drawing", label: "펜선" }]),
    });
    expect(columns.find((column) => column.key === "drawing")?.label).toBe("펜선");
  });
});

describe("deriveProductionProcessRounds (C-4 차수 도출)", () => {
  it("리비전이 없으면 빈 배열이다", () => {
    expect(deriveProductionProcessRounds(fakeProcess("a", "canvas-2d", "ep-1", "선화"))).toEqual([]);
  });

  it("제출 리비전 기준으로 1차·2차·수정본을 나눈다", () => {
    const process = fakeProcess("a", "canvas-2d", "ep-1", "선화", [
      fakeRevision("r1", "autosave", "2026-09-01T00:00:00.000Z"),
      fakeRevision("r2", "submission", "2026-09-02T00:00:00.000Z"),
      fakeRevision("r3", "autosave", "2026-09-03T00:00:00.000Z"),
      fakeRevision("r4", "submission", "2026-09-04T00:00:00.000Z"),
      fakeRevision("r5", "autosave", "2026-09-05T00:00:00.000Z"),
    ]);
    const rounds = deriveProductionProcessRounds(process);
    expect(rounds.map((round) => round.label)).toEqual(["1차", "2차", "수정본"]);
    expect(rounds[0]).toMatchObject({ kind: "submitted", index: 0, revisionCount: 2, submittedAt: "2026-09-02T00:00:00.000Z" });
    expect(rounds[0]?.submission?.id).toBe("r2");
    expect(rounds[0]?.head?.id).toBe("r2");
    expect(rounds[1]).toMatchObject({ kind: "submitted", index: 1, revisionCount: 2 });
    expect(rounds[2]).toMatchObject({ kind: "working", index: -1, revisionCount: 1, submission: null });
    expect(rounds[2]?.head?.id).toBe("r5");
  });

  it("제출이 없으면 작업 중 차수 하나만 만든다", () => {
    const process = fakeProcess("a", "canvas-2d", "ep-1", "선화", [
      fakeRevision("r1", "autosave", "2026-09-01T00:00:00.000Z"),
      fakeRevision("r2", "checkpoint", "2026-09-02T00:00:00.000Z"),
    ]);
    const rounds = deriveProductionProcessRounds(process);
    expect(rounds.map((round) => round.label)).toEqual(["작업 중"]);
    expect(rounds[0]).toMatchObject({ kind: "working", revisionCount: 2, approved: false });
  });

  it("마지막 제출 뒤에 리비전이 없으면 수정본 차수를 만들지 않는다", () => {
    const process = fakeProcess("a", "canvas-2d", "ep-1", "선화", [
      fakeRevision("r1", "submission", "2026-09-02T00:00:00.000Z"),
    ]);
    expect(deriveProductionProcessRounds(process).map((round) => round.label)).toEqual(["1차"]);
  });

  it("차수 안의 승인 리비전을 감지한다", () => {
    const process = fakeProcess("a", "canvas-2d", "ep-1", "선화", [
      fakeRevision("r1", "submission", "2026-09-02T00:00:00.000Z"),
      fakeRevision("r2", "approved", "2026-09-03T00:00:00.000Z"),
    ]);
    const rounds = deriveProductionProcessRounds(process);
    expect(rounds[0]?.approved).toBe(false);
    expect(rounds[1]?.approved).toBe(true);
  });

  it("생성일 순서가 뒤섞여도 정렬해서 나눈다", () => {
    const process = fakeProcess("a", "canvas-2d", "ep-1", "선화", [
      fakeRevision("r2", "submission", "2026-09-02T00:00:00.000Z"),
      fakeRevision("r1", "autosave", "2026-09-01T00:00:00.000Z"),
    ]);
    const rounds = deriveProductionProcessRounds(process);
    expect(rounds.map((round) => round.label)).toEqual(["1차"]);
    expect(rounds[0]?.revisionCount).toBe(2);
  });
});

describe("buildProductionCompareColumns (C-4 공정×차수 컬럼)", () => {
  it("공정 아래에 제출 차수→수정본 순으로 독립 컬럼을 만든다", () => {
    const firstSubmission = fakeRevision("r1", "submission", "2026-09-02T00:00:00.000Z");
    const cells = [
      fakeCell(fakeProcess("a", "canvas-2d", "ep-1", "선화", [
        firstSubmission,
        fakeRevision("r2", "autosave", "2026-09-03T00:00:00.000Z"),
      ])),
      fakeCell(fakeProcess("b", "canvas-2d", "ep-2", "선화", [firstSubmission])),
    ];
    const columns = buildProductionCompareColumns({ cells, stages: resolveProductionProcessStages() });
    const drawing = columns.filter((column) => column.processKey === "drawing");
    expect(drawing.map((column) => column.roundLabel)).toEqual(["1차", "수정본"]);
    expect(drawing[0]?.processLabel).toBe("선화");
    // 컬럼은 단계 순서(콘티→선화→채색→식자)를 따르므로 drawing 그룹이 첫 번째다.
    expect(columns[0]?.processKey).toBe("drawing");
  });

  it("숨긴 단계는 비교 컬럼에서도 제외한다", () => {
    const cells = [fakeCell(fakeProcess("a", "localization", "ep-1", "식자", [
      fakeRevision("r1", "submission", "2026-09-02T00:00:00.000Z"),
    ]))];
    const columns = buildProductionCompareColumns({
      cells,
      stages: resolveProductionProcessStages([{ key: "lettering", visible: false }]),
    });
    expect(columns.some((column) => column.processKey === "lettering")).toBe(false);
  });

  it("차수 기록이 없으면 빈 컬럼이다", () => {
    const cells = [fakeCell(fakeProcess("a", "canvas-2d", "ep-1", "선화"))];
    expect(buildProductionCompareColumns({ cells, stages: resolveProductionProcessStages() })).toEqual([]);
  });
});

describe("resolveProductionStageDueDate", () => {
  it("기준일로부터 오프셋일 전을 반환한다", () => {
    expect(resolveProductionStageDueDate({ defaultDueOffsetDays: 3 }, "2026-10-10T00:00:00.000Z"))
      .toBe("2026-10-07T00:00:00.000Z");
  });

  it("규칙이 없거나 기준일이 깨지면 null이다", () => {
    expect(resolveProductionStageDueDate({ defaultDueOffsetDays: null }, "2026-10-10T00:00:00.000Z")).toBeNull();
    expect(resolveProductionStageDueDate({ defaultDueOffsetDays: 3 }, "not-a-date")).toBeNull();
  });
});

describe("productionStageDefaultAssignmentId", () => {
  it("공정 키로 기본 담당자를 찾는다", () => {
    const stages: readonly ProductionProcessStageCustomization[] = resolveProductionProcessStages([
      { key: "storyboard", defaultAssignmentId: "assign-1" },
    ]);
    expect(productionStageDefaultAssignmentId(stages, "storyboard")).toBe("assign-1");
    expect(productionStageDefaultAssignmentId(stages, "drawing")).toBeNull();
  });
});

describe("ProductionEpisodeProcessMatrix (C-6 컬럼 동적 구성)", () => {
  it("팀 커스텀으로 숨긴 공정 컬럼이 렌더링되지 않는다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={[
          fakeProcess("art-a", "canvas-2d", episodeId, "선화"),
          fakeProcess("loc-a", "localization", episodeId, "식자"),
        ]}
        canEdit={false}
        isDemo
        onOpenProcess={vi.fn()}
        stageCustomizations={[{ key: "lettering", visible: false }]}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toContain("선화");
    expect(headers).not.toContain("식자");
    // 모바일 카드(sm:hidden)와 데스크톱 테이블이 함께 렌더되므로 AllBy* 로 확인한다.
    expect(screen.getAllByText("선화 원고").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("식자 원고")).toHaveLength(0);
  });

  it("건너뛰기 규칙에 걸린 회차의 셀은 매트릭스에 나오지 않는다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const episodeNumber = demo.episodePlans[0]?.episodeNumber ?? 12;
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={[
          fakeProcess("art-a", "canvas-2d", episodeId, "선화"),
          fakeProcess("loc-a", "localization", episodeId, "식자"),
        ]}
        canEdit={false}
        isDemo
        onOpenProcess={vi.fn()}
        stageCustomizations={[
          { key: "lettering", skipRule: { mode: "episode-numbers", episodeNumbers: [episodeNumber] } },
        ]}
      />,
    );
    expect(screen.queryAllByText("식자 원고")).toHaveLength(0);
    expect(screen.getAllByText("선화 원고").length).toBeGreaterThan(0);
  });

  it("신규 업무 일괄 저장에 공정의 기본 담당자를 시드한다", async () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    const execute = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={[fakeProcess("art-a", "canvas-2d", episodeId, "선화")]}
        canEdit
        isDemo={false}
        execute={execute}
        onOpenProcess={vi.fn()}
        stageCustomizations={[{ key: "drawing", defaultAssignmentId: "assign-storyboard-lead" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "일괄 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const command = execute.mock.calls[0]?.[0] as {
      readonly type: string;
      readonly tasks: readonly { readonly assignmentIds: readonly string[] }[];
    };
    expect(command.type).toBe("upsert-task-batch");
    expect(command.tasks[0]?.assignmentIds).toEqual(["assign-storyboard-lead"]);
  });
});

describe("ProductionEpisodeProcessMatrix (C-4 차수 비교 모드)", () => {
  it("차수 비교 토글로 공정×차수 독립 컬럼을 나란히 보여준다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={[
          fakeProcess("art-a", "canvas-2d", episodeId, "선화", [
            fakeRevision("r1", "submission", "2026-09-02T00:00:00.000Z"),
            fakeRevision("r2", "autosave", "2026-09-03T00:00:00.000Z"),
          ]),
        ]}
        canEdit={false}
        isDemo
        onOpenProcess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "차수 비교" }));
    // 공정 그룹 헤더와 차수 서브 헤더가 렌더된다.
    expect(screen.getByText("선화", { selector: "th" })).toBeTruthy();
    expect(screen.getAllByText("1차").length).toBeGreaterThan(0);
    expect(screen.getAllByText("수정본").length).toBeGreaterThan(0);
    // 요약 스트립과 스크롤 동기화 토글이 있다.
    expect(screen.getByRole("region", { name: "차수 요약" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "차수별 상세 비교" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "스크롤 동기화" })).toHaveProperty("checked", true);
  });

  it("차수 기록이 없으면 빈 상태를 안내한다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={[fakeProcess("art-a", "canvas-2d", episodeId, "선화")]}
        canEdit={false}
        isDemo
        onOpenProcess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "차수 비교" }));
    expect(screen.getByText("비교할 차수 기록이 없습니다. 리비전이 쌓이면 1차·2차·수정본으로 나뉘어 표시됩니다.")).toBeTruthy();
  });

  it("차수 셀 클릭으로 원고를 연다", () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? "episode-12";
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    const onOpenProcess = vi.fn();
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={[
          fakeProcess("art-a", "canvas-2d", episodeId, "선화", [
            fakeRevision("r1", "submission", "2026-09-02T00:00:00.000Z"),
          ]),
        ]}
        canEdit={false}
        isDemo
        onOpenProcess={onOpenProcess}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "차수 비교" }));
    const roundButtons = screen.getAllByRole("button", { name: /선화 원고/ });
    expect(roundButtons.length).toBeGreaterThan(0);
    const first = roundButtons[0];
    if (!first) throw new Error("차수 셀 버튼을 찾지 못했습니다.");
    fireEvent.click(first);
    expect(onOpenProcess).toHaveBeenCalledTimes(1);
  });
});
