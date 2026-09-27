import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { episodeScope, projectScope } from "./scope";
import {
  buildProductionWorkflowTasks,
  createProductionWorkflowProfile,
  transitionProductionTaskBatch,
  validateProductionWorkflowMutation,
  validateProductionWorkflowProfile,
} from "./workflow-profile";

import type { ProductionProjectAggregate, ProductionTask } from "./types";

const at = "2026-09-27T09:00:00.000Z";
function base(): ProductionProjectAggregate {
  return createProductionProjectAggregate({
    projectId: "p",
    workId: "w",
    title: "제작",
    collaborationModel: "solo",
    ownerPartyId: "owner",
    ownerUserId: "user",
    ownerDisplayName: "작가",
    at,
  });
}
function task(id: string, overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    id,
    projectId: "p",
    scope: projectScope("p"),
    processKey: "story-lock",
    title: id,
    status: "ready",
    assignmentIds: ["assignment:owner:producer"],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [
      { id: "r1", revision: 1, lineage: "narrative", digest: `sha256:${"a".repeat(64)}`, createdAt: at },
    ],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: null,
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...overrides,
  };
}
function configured(tasks: readonly ProductionTask[] = []): ProductionProjectAggregate {
  return { ...base(), tasks, workflowProfile: createProductionWorkflowProfile("p", "solo", at) };
}
describe("제작 공정 프로필", () => {
  it.each([
    ["solo", 4],
    ["team", 6],
    ["studio", 8],
  ] as const)("%s 프리셋의 공정 수와 정합성을 보장한다", (scale, count) => {
    const profile = createProductionWorkflowProfile("p", scale, at);
    expect(profile.steps).toHaveLength(count);
    expect(validateProductionWorkflowProfile(base(), profile)).toEqual([]);
  });
  it("스튜디오의 선화와 배경을 병렬 공정으로 구성한다", () => {
    const profile = createProductionWorkflowProfile("p", "studio", at);
    expect(profile.steps.find((s) => s.key === "background")?.dependsOn).toEqual(["storyboard"]);
    expect(profile.steps.find((s) => s.key === "color")?.dependsOn).toEqual(["line-art", "background"]);
  });
  it("중복 키, 순환 의존성, 잘못된 동시 작업 수를 거절한다", () => {
    const profile = createProductionWorkflowProfile("p", "solo", at);
    const first = profile.steps[0];
    if (!first) throw new Error("fixture");
    expect(validateProductionWorkflowProfile(base(), { ...profile, steps: [first, first] }).join()).toContain(
      "중복",
    );
    expect(
      validateProductionWorkflowProfile(base(), {
        ...profile,
        steps: [{ ...first, dependsOn: ["storyboard"] }, ...profile.steps.slice(1)],
      }).join(),
    ).toContain("순환");
    expect(
      validateProductionWorkflowProfile(base(), { ...profile, steps: [{ ...first, wipLimit: 0 }] }).join(),
    ).toContain("동시 작업 수");
  });
  it("낡은 설정과 진행 작업이 있는 공정 삭제를 거절한다", () => {
    const aggregate = configured([task("t")]);
    const profile = aggregate.workflowProfile;
    if (!profile) throw new Error("fixture");
    expect(validateProductionWorkflowProfile(aggregate, profile).join()).toContain("최신 설정");
    const steps = profile.steps
      .slice(1)
      .map((step) => ({ ...step, dependsOn: step.dependsOn.filter((key) => key !== "story-lock") }));
    expect(validateProductionWorkflowProfile(aggregate, { ...profile, revision: 2, steps }).join()).toContain(
      "진행할 작업",
    );
  });
  it("기존 자료와 무관한 새 공정 설정 때문에 레거시 작업을 숨기거나 삭제하지 않는다", () => {
    const aggregate = configured([task("legacy", { processKey: "legacy-process" })]);
    expect(validateProductionWorkflowMutation(aggregate, { ...aggregate })).toEqual([]);
    expect(aggregate.tasks).toHaveLength(1);
  });
});
describe("작업 보드의 원자적 상태 전환", () => {
  it("선행 조건을 충족한 작업을 이동하고 원본을 보존한다", () => {
    const aggregate = configured([task("t")]);
    const result = transitionProductionTaskBatch(
      aggregate,
      [{ taskId: "t", fromStatus: "ready", toStatus: "in-progress" }],
      at,
    );
    expect(result[0]).toMatchObject({ status: "in-progress", statusChangedAt: at, startedAt: at });
    expect(aggregate.tasks[0]?.status).toBe("ready");
  });
  it("묶음 전체의 동시 작업 수를 검사하고 일부만 이동하지 않는다", () => {
    const aggregate = configured([task("a"), task("b")]);
    expect(() =>
      transitionProductionTaskBatch(
        aggregate,
        [
          { taskId: "a", fromStatus: "ready", toStatus: "in-progress" },
          { taskId: "b", fromStatus: "ready", toStatus: "in-progress" },
        ],
        at,
      ),
    ).toThrow("동시 작업 제한");
    expect(aggregate.tasks.every((t) => t.status === "ready")).toBe(true);
  });
  it("낡은 상태, 중복 선택, 승인 우회를 거절한다", () => {
    const aggregate = configured([task("t")]);
    expect(() =>
      transitionProductionTaskBatch(aggregate, [{ taskId: "t", fromStatus: "draft", toStatus: "ready" }], at),
    ).toThrow("workflow-task-conflict");
    expect(() =>
      transitionProductionTaskBatch(
        aggregate,
        [{ taskId: "t", fromStatus: "ready", toStatus: "approved" }],
        at,
      ),
    ).toThrow("고정 검수");
    const entry = { taskId: "t", fromStatus: "ready", toStatus: "in-progress" } as const;
    expect(() => transitionProductionTaskBatch(aggregate, [entry, entry], at)).toThrow("중복");
  });
  it("고정 입력과 담당자 없이 작업을 시작하지 않는다", () => {
    const move = [{ taskId: "t", fromStatus: "ready", toStatus: "in-progress" }] as const;
    expect(() =>
      transitionProductionTaskBatch(configured([task("t", { inputRevisionRefs: [] })]), move, at),
    ).toThrow();
    expect(() =>
      transitionProductionTaskBatch(configured([task("t", { assignmentIds: [] })]), move, at),
    ).toThrow("활성 담당자");
  });
  it("필수 검수자 없이 검수 공정에 진입하지 않는다", () => {
    const aggregate = { ...configured([task("t", { processKey: "joint-proof", status: "in-progress" })]) };
    expect(() =>
      transitionProductionTaskBatch(
        aggregate,
        [{ taskId: "t", fromStatus: "in-progress", toStatus: "internal-review" }],
        at,
      ),
    ).toThrow("검수자 배정");
  });
  it("승인된 산출물 증거 없이 완료하지 않는다", () => {
    const aggregate = configured([task("t", { status: "approved", outputDeliverableIds: ["missing"] })]);
    expect(() =>
      transitionProductionTaskBatch(
        aggregate,
        [{ taskId: "t", fromStatus: "approved", toStatus: "done" }],
        at,
      ),
    ).toThrow("승인된 제출본");
  });
  it("일반 수정 명령으로도 활성 공정의 동시 작업 제한을 우회하지 못한다", () => {
    const aggregate = configured([task("a", { status: "in-progress" }), task("b")]);
    const tasks = aggregate.tasks.map((entry) => ({ ...entry, status: "in-progress" as const }));
    expect(validateProductionWorkflowMutation(aggregate, { ...aggregate, tasks }).join()).toContain(
      "동시 작업 제한",
    );
  });
  it("기존 과부하 상태에서 작업을 줄이는 복구 작업은 허용한다", () => {
    const aggregate = configured([
      task("a", { status: "in-progress" }),
      task("b", { status: "in-progress" }),
    ]);
    expect(
      transitionProductionTaskBatch(
        aggregate,
        [{ taskId: "a", fromStatus: "in-progress", toStatus: "paused" }],
        at,
      )[0]?.status,
    ).toBe("paused");
  });
});

function episodeProject(tasks: readonly ProductionTask[] = []): ProductionProjectAggregate {
  const aggregate = configured(tasks);
  return {
    ...aggregate,
    episodes: ["episode-a", "episode-b"].map((episodeId) => ({
      id: episodeId,
      projectId: "p",
      episodeId,
      revision: 1,
      state: "episode-planning",
      narrativeRevisionRef: null,
      visualRevisionRef: null,
      integratedRevisionRef: null,
      activeHandoffId: null,
      openBlockerCount: 0,
      storyLockApproved: false,
      thumbnailLockApproved: false,
      jointProofApproved: false,
      creditPreflightPassed: false,
      publicationPreflightPassed: false,
      updatedAt: at,
    })),
  };
}
describe("회차 공정 생성", () => {
  const instance = "00000000-0000-4000-8000-000000000001";
  it("기존 작업은 유지하고 빠진 공정만 만들며 반복 생성은 중복되지 않는다", () => {
    const aggregate = episodeProject();
    const tasks = buildProductionWorkflowTasks(aggregate, "episode-a", instance, at);
    expect(tasks).toHaveLength(4);
    expect(tasks.every((task) => task.status === "draft")).toBe(true);
    expect(tasks[1]?.dependencyTaskIds).toEqual([tasks[0]?.id]);
    expect(buildProductionWorkflowTasks({ ...aggregate, tasks }, "episode-a", instance, at)).toEqual([]);
    expect(aggregate.tasks).toEqual([]);
  });
  it("다른 회차에서 이미 사용한 생성 ID로 원래 작업을 덮어쓰지 않는다", () => {
    const aggregate = episodeProject();
    const tasks = buildProductionWorkflowTasks(aggregate, "episode-a", instance, at);
    expect(() => buildProductionWorkflowTasks({ ...aggregate, tasks }, "episode-b", instance, at)).toThrow(
      "다른 회차",
    );
  });
  it("선행 공정에 작업이 여러 개이면 모두 의존성으로 연결한다", () => {
    const scope = episodeScope("p", "episode-a");
    const aggregate = episodeProject([task("story-1", { scope }), task("story-2", { scope })]);
    const tasks = buildProductionWorkflowTasks(aggregate, "episode-a", instance, at);
    expect(tasks.find((entry) => entry.processKey === "storyboard")?.dependencyTaskIds).toEqual([
      "story-1",
      "story-2",
    ]);
  });
  it("유효하지 않은 생성 ID와 존재하지 않는 회차를 거절한다", () => {
    expect(() => buildProductionWorkflowTasks(episodeProject(), "episode-a", "-".repeat(36), at)).toThrow(
      "식별자",
    );
    expect(() => buildProductionWorkflowTasks(episodeProject(), "missing", instance, at)).toThrow("회차");
  });
  it("담당 후보가 둘이면 자동 배정하지 않는다", () => {
    const aggregate = episodeProject();
    const owner = aggregate.assignments[0];
    if (!owner) throw new Error("fixture");
    const assignments = [
      { ...owner, id: "writer-a", roleType: "writer" as const },
      { ...owner, id: "writer-b", roleType: "writer" as const },
    ];
    const tasks = buildProductionWorkflowTasks({ ...aggregate, assignments }, "episode-a", instance, at);
    expect(tasks.find((entry) => entry.processKey === "story-lock")?.assignmentIds).toEqual([]);
  });
});
describe("설명과 참조 무결성", () => {
  it("존재하지 않는 선행 작업과 중복 블록을 거절한다", () => {
    const aggregate = configured([task("t")]);
    const tasks = [
      task("t", {
        dependencyTaskIds: ["missing"],
        briefBlocks: [
          { id: "b", kind: "paragraph", text: "a" },
          { id: "b", kind: "paragraph", text: "b" },
        ],
      }),
    ];
    const issues = validateProductionWorkflowMutation(aggregate, { ...aggregate, tasks }).join(" ");
    expect(issues).toContain("선행 작업");
    expect(issues).toContain("블록 식별자");
  });
});

describe("이전 회차 공정 키의 호환성", () => {
  it("기존 story 작업을 story-lock과 같은 공정으로 세고 중복 생성하지 않는다", () => {
    const aggregate = episodeProject([
      task("legacy", { processKey: "story", scope: episodeScope("p", "episode-a"), status: "in-progress" }),
    ]);
    const created = buildProductionWorkflowTasks(
      aggregate,
      "episode-a",
      "00000000-0000-4000-8000-000000000010",
      at,
    );
    expect(created.some((entry) => entry.processKey === "story-lock")).toBe(false);
    expect(created.find((entry) => entry.processKey === "storyboard")?.dependencyTaskIds).toEqual(["legacy"]);
    const next = { ...aggregate, tasks: [...aggregate.tasks, task("another", { status: "in-progress" })] };
    expect(validateProductionWorkflowMutation(aggregate, next).join()).toContain("동시 작업 제한");
  });
  it("같은 의미의 공정을 다른 키로 두 번 등록하지 못한다", () => {
    const profile = createProductionWorkflowProfile("p", "solo", at);
    const first = profile.steps[0];
    if (!first) throw new Error("fixture");
    expect(
      validateProductionWorkflowProfile(base(), {
        ...profile,
        steps: [...profile.steps, { ...first, key: "story" }],
      }).join(),
    ).toContain("같은 의미");
  });
});
