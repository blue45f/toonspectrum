import { describe, expect, it } from "vitest";

import {
  canApplyStudioAiJob,
  createStudioAiJob,
  isStudioAiSkill,
  studioAiJobUserState,
  transitionStudioAiJob,
  type StudioAiJob,
} from "./studio-ai-job";

const T0 = "2026-09-11T00:00:00.000Z";

function createJob(): StudioAiJob {
  return createStudioAiJob({
    id: "job-1",
    skill: "image-fill",
    providerId: "provider-a",
    privacy: "cloud-private",
    cost: "metered",
    estimatedCredits: 4,
    request: {
      prompt: "선택 영역의 배경을 자연스럽게 복원",
      inputSnapshotId: "snapshot-1",
      selectionId: "selection-1",
      references: ["asset:background-1"],
      seed: 42,
    },
    at: T0,
  });
}

function advanceToPreview(job = createJob()): StudioAiJob {
  let next = transitionStudioAiJob(job, {
    type: "request-confirmation",
    at: "2026-09-11T00:00:01.000Z",
  });
  next = transitionStudioAiJob(next, {
    type: "confirm",
    accepted: true,
    at: "2026-09-11T00:00:02.000Z",
  });
  next = transitionStudioAiJob(next, {
    type: "start",
    at: "2026-09-11T00:00:03.000Z",
  });
  next = transitionStudioAiJob(next, {
    type: "progress",
    value: 0.5,
    at: "2026-09-11T00:00:04.000Z",
  });
  return transitionStudioAiJob(next, {
    type: "preview",
    at: "2026-09-11T00:00:05.000Z",
    preview: {
      previewId: "preview-1",
      outputRefs: ["result:image-1"],
      estimatedCreditsUsed: 3,
      warnings: [],
    },
  });
}

describe("Studio non-destructive AI job lifecycle", () => {
  it("requires confirmation, preview and approval before applying a result", () => {
    const draft = createJob();
    expect(draft).toMatchObject({
      status: "draft",
      requiresExternalTransfer: true,
      estimatedCredits: 4,
    });
    expect(canApplyStudioAiJob(draft)).toBe(false);

    const preview = advanceToPreview(draft);
    expect(preview).toMatchObject({ status: "preview-ready", progress: 1 });
    expect(studioAiJobUserState(preview)).toMatchObject({
      labelKo: "결과 확인",
      requiresAttention: true,
    });

    const approved = transitionStudioAiJob(preview, {
      type: "approve",
      at: "2026-09-11T00:00:06.000Z",
    });
    expect(canApplyStudioAiJob(approved)).toBe(true);

    const applied = transitionStudioAiJob(approved, {
      type: "apply",
      at: "2026-09-11T00:00:07.000Z",
      application: {
        mode: "selection",
        targetDocumentId: "document-1",
        targetSelectionId: "selection-1",
        createdObjectIds: ["layer-ai-copy-1"],
      },
    });
    expect(applied).toMatchObject({
      status: "applied",
      application: {
        mode: "selection",
        createdObjectIds: ["layer-ai-copy-1"],
      },
    });
    expect(studioAiJobUserState(applied).labelKo).toBe("사본으로 적용됨");
    expect(applied.audit.map((entry) => entry.action)).toEqual([
      "created",
      "request-confirmation",
      "confirm",
      "start",
      "progress",
      "preview",
      "approve",
      "apply",
    ]);
  });

  it("never permits direct or destructive application", () => {
    const draft = createJob();
    expect(() => transitionStudioAiJob(draft, {
      type: "apply",
      at: "2026-09-11T00:00:01.000Z",
      application: {
        mode: "copy",
        targetDocumentId: "document-1",
        createdObjectIds: ["layer-1"],
      },
    })).toThrow(/not allowed/u);

    const preview = advanceToPreview();
    const approved = transitionStudioAiJob(preview, {
      type: "approve",
      at: "2026-09-11T00:00:06.000Z",
    });
    expect(() => transitionStudioAiJob(approved, {
      type: "apply",
      at: "2026-09-11T00:00:07.000Z",
      application: {
        mode: "selection",
        targetDocumentId: "document-1",
        createdObjectIds: ["layer-1"],
      },
    })).toThrow(/target selection/u);
  });

  it("keeps progress monotonic and bounded", () => {
    let job = transitionStudioAiJob(createJob(), {
      type: "request-confirmation",
      at: "2026-09-11T00:00:01.000Z",
    });
    job = transitionStudioAiJob(job, {
      type: "confirm",
      accepted: true,
      at: "2026-09-11T00:00:02.000Z",
    });
    job = transitionStudioAiJob(job, {
      type: "start",
      at: "2026-09-11T00:00:03.000Z",
    });
    job = transitionStudioAiJob(job, {
      type: "progress",
      value: 0.7,
      at: "2026-09-11T00:00:04.000Z",
    });
    expect(() => transitionStudioAiJob(job, {
      type: "progress",
      value: 0.4,
      at: "2026-09-11T00:00:05.000Z",
    })).toThrow(/monotonically/u);
    expect(() => transitionStudioAiJob(job, {
      type: "progress",
      value: 1.2,
      at: "2026-09-11T00:00:05.000Z",
    })).toThrow(/between zero and one/u);
  });

  it("supports rejection, failure, retry and cancellation without losing audit history", () => {
    const awaiting = transitionStudioAiJob(createJob(), {
      type: "request-confirmation",
      at: "2026-09-11T00:00:01.000Z",
    });
    const declined = transitionStudioAiJob(awaiting, {
      type: "confirm",
      accepted: false,
      at: "2026-09-11T00:00:02.000Z",
    });
    expect(declined.status).toBe("cancelled");

    let running = transitionStudioAiJob(awaiting, {
      type: "confirm",
      accepted: true,
      at: "2026-09-11T00:00:02.000Z",
    });
    running = transitionStudioAiJob(running, {
      type: "start",
      at: "2026-09-11T00:00:03.000Z",
    });
    const failed = transitionStudioAiJob(running, {
      type: "fail",
      code: "provider-timeout",
      message: "공급자 응답 시간이 초과되었습니다.",
      at: "2026-09-11T00:00:04.000Z",
    });
    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "provider-timeout" },
    });
    const retried = transitionStudioAiJob(failed, {
      type: "retry",
      at: "2026-09-11T00:00:05.000Z",
    });
    expect(retried).toMatchObject({
      status: "queued",
      progress: 0,
      error: undefined,
    });
    const cancelled = transitionStudioAiJob(retried, {
      type: "cancel",
      reason: "user-left-workspace",
      at: "2026-09-11T00:00:06.000Z",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.audit.at(-1)).toMatchObject({
      action: "cancel",
      detail: "user-left-workspace",
    });
  });

  it("distinguishes local and external processing", () => {
    const local = createStudioAiJob({
      id: "local-job",
      skill: "line-cleanup",
      providerId: "on-device",
      privacy: "local",
      cost: "free",
      request: {
        prompt: "선화 정리",
        inputSnapshotId: "snapshot-local",
        references: [],
      },
      at: T0,
    });
    expect(local.requiresExternalTransfer).toBe(false);
    expect(isStudioAiSkill("localization")).toBe(true);
    expect(isStudioAiSkill("overwrite-original")).toBe(false);
  });
});
