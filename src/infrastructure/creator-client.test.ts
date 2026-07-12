import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkRevisionConflictError,
  createWork,
  restoreWorkRevision,
  updateWork,
} from "./creator-client";

const { apiPatch, apiPost, toApiError } = vi.hoisted(() => ({
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  toApiError: vi.fn(async () => new Error("안전한 API 오류")),
}));

vi.mock("@/src/infrastructure/api", () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: apiPatch,
    post: apiPost,
  },
  isHttpError: (error: unknown) =>
    Boolean(error && typeof error === "object" && (error as { httpError?: boolean }).httpError),
  toApiError,
}));

function conflictError(currentRevision: unknown, extra: Record<string, unknown> = {}) {
  return {
    httpError: true,
    response: { status: 409 },
    data: {
      code: "creator_work_revision_conflict",
      currentRevision,
      ...extra,
    },
  };
}

describe("creator client revision conflicts", () => {
  beforeEach(() => {
    apiPatch.mockReset();
    apiPost.mockReset();
    toApiError.mockClear();
  });

  it("update 409를 현재 revision만 가진 전용 충돌 오류로 변환한다", async () => {
    apiPatch.mockRejectedValue(conflictError(8, { snapshot: { privateNote: "secret" } }));

    const error = await updateWork("work/1", { title: "수정", baseRevision: 7 })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WorkRevisionConflictError);
    expect((error as WorkRevisionConflictError).currentRevision).toBe(8);
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(apiPatch).toHaveBeenCalledWith("/creator/works/work%2F1", {
      title: "수정",
      baseRevision: 7,
    });
    expect(toApiError).not.toHaveBeenCalled();
  });

  it("restore 409도 update와 같은 충돌 오류로 변환한다", async () => {
    apiPost.mockRejectedValue(conflictError(11));

    const error = await restoreWorkRevision("work-1", 3, 10)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WorkRevisionConflictError);
    expect((error as WorkRevisionConflictError).currentRevision).toBe(11);
    expect(apiPost).toHaveBeenCalledWith(
      "/creator/works/work-1/revisions/3/restore",
      { baseRevision: 10 }
    );
    expect(toApiError).not.toHaveBeenCalled();
  });

  it("malformed 409 payload는 신뢰하지 않고 일반 안전 오류 경로로 보낸다", async () => {
    apiPatch.mockRejectedValue(conflictError("8", { providerSecret: "private" }));

    await expect(updateWork("work-1", { title: "수정", baseRevision: 7 }))
      .rejects.toThrow("안전한 API 오류");
    expect(toApiError).toHaveBeenCalledOnce();
  });

  it("create/update/restore mutation에 전달된 AbortSignal을 HTTP 요청까지 보존한다", async () => {
    const controller = new AbortController();
    const createInput = {
      title: "새 작품",
      description: "설명",
      tags: ["웹툰"],
      format: "cuttoon" as const,
      cover: "data:image/png;base64,cover",
      pages: ["data:image/png;base64,page"],
      doc: { pagesList: [] },
      status: "draft",
    };
    apiPost.mockResolvedValueOnce({ id: "created" });
    apiPatch.mockResolvedValueOnce({ id: "updated" });
    apiPost.mockResolvedValueOnce({ id: "restored" });

    await createWork(createInput, controller.signal);
    await updateWork("work/1", { title: "수정", baseRevision: 7 }, controller.signal);
    await restoreWorkRevision("work/1", 3, 7, controller.signal);

    expect(apiPost).toHaveBeenNthCalledWith(1, "/creator/works", createInput, {
      signal: controller.signal,
    });
    expect(apiPatch).toHaveBeenCalledWith(
      "/creator/works/work%2F1",
      { title: "수정", baseRevision: 7 },
      { signal: controller.signal }
    );
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      "/creator/works/work%2F1/revisions/3/restore",
      { baseRevision: 7 },
      { signal: controller.signal }
    );
  });
});
