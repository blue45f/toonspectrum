import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkRevisionConflictError,
  WorkRevisionResponseContractError,
  createWork,
  getWorkRevisionComparison,
  getWorkRevision,
  listWorkRevisions,
  publishAsset,
  restoreWorkRevision,
  updateWork,
} from "./creator-client";

const { apiGet, apiPatch, apiPost, toApiError } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  toApiError: vi.fn(async () => new Error("안전한 API 오류")),
}));

vi.mock("@/src/infrastructure/api", () => ({
  api: {
    delete: vi.fn(),
    get: apiGet,
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
    apiGet.mockReset();
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

  it("공유 에셋 업로드에도 AbortSignal을 전달해 멈춘 요청을 취소할 수 있다", async () => {
    const controller = new AbortController();
    const input = {
      name: "[3D_POSE] 테스트",
      dataUrl: "data:image/png;base64,pose",
      width: 360,
      height: 520,
      kind: "vrm_pose",
    };
    apiPost.mockResolvedValue({ id: "shared-pose" });

    await publishAsset(input, controller.signal);

    expect(apiPost).toHaveBeenCalledWith("/creator/assets", input, {
      signal: controller.signal,
    });
  });
});

describe("creator client revision response contracts", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPatch.mockReset();
    apiPost.mockReset();
    toApiError.mockClear();
  });

  it("목록의 revision·복원 출처·날짜를 검증하고 ISO 시각으로 정규화한다", async () => {
    apiGet.mockResolvedValue([
      {
        revision: 12,
        restoredFromRevision: null,
        createdAt: "2026-07-13T09:30:00+09:00",
        ignoredServerField: "forward-compatible",
      },
      {
        revision: 11,
        restoredFromRevision: 3,
        createdAt: "2026-07-12T00:00:00.123Z",
      },
    ]);

    await expect(listWorkRevisions("work/1", 20)).resolves.toEqual([
      {
        revision: 12,
        restoredFromRevision: null,
        createdAt: "2026-07-13T00:30:00.000Z",
      },
      {
        revision: 11,
        restoredFromRevision: 3,
        createdAt: "2026-07-12T00:00:00.123Z",
      },
    ]);
    expect(apiGet).toHaveBeenCalledWith("/creator/works/work%2F1/revisions", {
      params: { limit: 20 },
      signal: undefined,
    });
  });

  it.each([
    ["배열 아님", { revisions: [] }],
    ["항목 객체 아님", [null]],
    ["revision 0", [{ revision: 0, restoredFromRevision: null, createdAt: "2026-07-13T00:00:00.000Z" }]],
    ["revision 문자열", [{ revision: "1", restoredFromRevision: null, createdAt: "2026-07-13T00:00:00.000Z" }]],
    ["revision 상한 초과", [{ revision: 2_147_483_648, restoredFromRevision: null, createdAt: "2026-07-13T00:00:00.000Z" }]],
    ["복원 출처 누락", [{ revision: 1, createdAt: "2026-07-13T00:00:00.000Z" }]],
    ["복원 출처 문자열", [{ revision: 2, restoredFromRevision: "1", createdAt: "2026-07-13T00:00:00.000Z" }]],
    ["잘못된 날짜", [{ revision: 1, restoredFromRevision: null, createdAt: "not-an-iso-date" }]],
  ])("손상된 목록 응답(%s)은 부분 적용하지 않고 안전한 계약 오류로 닫는다", async (_label, payload) => {
    apiGet.mockResolvedValue(payload);

    const error = await listWorkRevisions("private-work").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WorkRevisionResponseContractError);
    expect(String(error)).toBe("WorkRevisionResponseContractError: 작품 버전 응답 형식이 올바르지 않습니다.");
    expect(error).not.toHaveProperty("cause");
    expect(toApiError).not.toHaveBeenCalled();
  });

  it("상세 snapshot은 plain object만 허용하고 새 일반 객체로 반환한다", async () => {
    const snapshot = Object.assign(Object.create(null) as Record<string, unknown>, {
      title: "비공개 원고",
      doc: { pagesList: [{ id: "page-1" }] },
    });
    apiGet.mockResolvedValue({
      revision: 7,
      restoredFromRevision: 2,
      createdAt: "2026-07-13T00:00:00Z",
      snapshot,
      ignoredServerField: "not-projected",
    });

    const detail = await getWorkRevision("work/1", 7);

    expect(detail).toEqual({
      revision: 7,
      restoredFromRevision: 2,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot: {
        title: "비공개 원고",
        doc: { pagesList: [{ id: "page-1" }] },
      },
    });
    expect(Object.getPrototypeOf(detail.snapshot)).toBe(Object.prototype);
    expect(detail).not.toHaveProperty("ignoredServerField");
  });

  it("비교 getter는 allowlist snapshot만 반환하고 전용 경로·AbortSignal을 사용한다", async () => {
    const controller = new AbortController();
    const resourceToken = `toonspectrum:resource-sha256:v1:25:${"a".repeat(64)}`;
    apiGet.mockResolvedValue({
      revision: 7,
      restoredFromRevision: 2,
      createdAt: "2026-07-13T09:00:00+09:00",
      snapshot: {
        titleId: "title-1",
        title: "비공개 원고",
        description: "설명",
        tags: ["판타지"],
        format: "cuttoon",
        doc: { pagesList: [{ id: "page-1", src: resourceToken }] },
        status: "draft",
        seriesId: "series-1",
        episodeNo: 3,
        challengeId: null,
        remixFromId: null,
      },
    });

    await expect(
      getWorkRevisionComparison("work/1", 7, controller.signal)
    ).resolves.toEqual({
      revision: 7,
      restoredFromRevision: 2,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot: {
        titleId: "title-1",
        title: "비공개 원고",
        description: "설명",
        tags: ["판타지"],
        format: "cuttoon",
        doc: { pagesList: [{ id: "page-1", src: resourceToken }] },
        status: "draft",
        seriesId: "series-1",
        episodeNo: 3,
        challengeId: null,
        remixFromId: null,
      },
    });
    expect(apiGet).toHaveBeenCalledWith(
      "/creator/works/work%2F1/revisions/7/comparison",
      { signal: controller.signal }
    );
  });

  it.each([
    ["cover", { cover: "data:image/png;base64,private-cover" }],
    ["pages", { pages: ["data:image/png;base64,private-page"] }],
    ["서버 내부 필드", { ownerId: "private-owner" }],
  ])("비교 응답의 비허용 %s 필드는 안전 계약 오류로 거부한다", async (_label, extra) => {
    apiGet.mockResolvedValue({
      revision: 4,
      restoredFromRevision: null,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot: {
        titleId: null,
        title: "1화",
        description: "",
        tags: [],
        format: "cuttoon",
        doc: {},
        status: "draft",
        seriesId: null,
        episodeNo: null,
        challengeId: null,
        remixFromId: null,
        ...extra,
      },
    });

    const error = await getWorkRevisionComparison("private-work", 4).catch(
      (cause: unknown) => cause
    );

    expect(error).toBeInstanceOf(WorkRevisionResponseContractError);
    expect(String(error)).not.toContain("private-cover");
    expect(String(error)).not.toContain("private-page");
    expect(String(error)).not.toContain("private-owner");
    expect(error).not.toHaveProperty("cause");
  });

  it("비교 응답은 sparse tags와 snapshot accessor를 실행하지 않고 거부한다", async () => {
    const sparseTags = Array(1) as string[];
    const snapshot = {
      titleId: null,
      title: "1화",
      description: "",
      tags: sparseTags,
      format: "cuttoon",
      doc: {},
      status: "draft",
      seriesId: null,
      episodeNo: null,
      challengeId: null,
      remixFromId: null,
    };
    apiGet.mockResolvedValue({
      revision: 4,
      restoredFromRevision: null,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot,
    });
    await expect(getWorkRevisionComparison("private-work", 4)).rejects.toBeInstanceOf(
      WorkRevisionResponseContractError
    );

    const titleGetter = vi.fn(() => "비밀 제목");
    Object.defineProperty(snapshot, "title", { enumerable: true, get: titleGetter });
    apiGet.mockResolvedValue({
      revision: 4,
      restoredFromRevision: null,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot,
    });
    await expect(getWorkRevisionComparison("private-work", 4)).rejects.toBeInstanceOf(
      WorkRevisionResponseContractError
    );
    expect(titleGetter).not.toHaveBeenCalled();
  });

  it("비교 getter는 구버전 doc의 리소스·AI 비밀 원문을 downstream에 전달하지 않는다", async () => {
    const rawDataUrl = "data:image/png;base64,private-doc-image";
    const privatePrompt = "private-opt-in-prompt";
    const privateRequestId = "private-provider-request-id";
    apiGet.mockResolvedValue({
      revision: 4,
      restoredFromRevision: null,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot: {
        titleId: null,
        title: "1화",
        description: "",
        tags: [],
        format: "cuttoon",
        doc: {
          pagesList: [{ src: rawDataUrl, text: "작품 대사" }],
          aiProvenance: {
            operations: [
              {
                prompt: { sha256: "d".repeat(64), raw: privatePrompt },
                requestId: privateRequestId,
              },
            ],
          },
        },
        status: "draft",
        seriesId: null,
        episodeNo: null,
        challengeId: null,
        remixFromId: null,
      },
    });

    const response = await getWorkRevisionComparison("private-work", 4);

    expect(JSON.stringify(response)).not.toContain(rawDataUrl);
    expect(JSON.stringify(response)).not.toContain(privatePrompt);
    expect(JSON.stringify(response)).not.toContain(privateRequestId);
    expect(JSON.stringify(response)).not.toContain("d".repeat(64));
    expect(JSON.stringify(response)).toContain("0".repeat(64));
    expect(JSON.stringify(response)).toContain("작품 대사");
    expect(JSON.stringify(response)).toMatch(
      /toonspectrum:resource-sha256:v1:\d+:[0-9a-f]{64}/u
    );
  });

  it.each([
    ["누락", undefined],
    ["null", null],
    ["배열", [{ privateNote: "목록에 노출되면 안 되는 비밀" }]],
    ["class instance", new (class PrivateSnapshot { privateNote = "오류에 노출되면 안 되는 비밀"; })()],
  ])("상세의 손상된 snapshot(%s)은 payload를 보존하지 않는 안전한 오류를 낸다", async (_label, snapshot) => {
    apiGet.mockResolvedValue({
      revision: 4,
      restoredFromRevision: null,
      createdAt: "2026-07-13T00:00:00.000Z",
      snapshot,
      providerSecret: "server-private-value",
    });

    const error = await getWorkRevision("private-work", 4).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WorkRevisionResponseContractError);
    expect(String(error)).not.toContain("server-private-value");
    expect(String(error)).not.toContain("비밀");
    expect(error).not.toHaveProperty("cause");
    expect(error).not.toHaveProperty("snapshot");
    expect(toApiError).not.toHaveBeenCalled();
  });

  it("목록과 상세 조회에 전달된 AbortSignal을 HTTP 요청까지 보존한다", async () => {
    const controller = new AbortController();
    apiGet
      .mockResolvedValueOnce([
        { revision: 2, restoredFromRevision: null, createdAt: "2026-07-13T00:00:00.000Z" },
      ])
      .mockResolvedValueOnce({
        revision: 2,
        restoredFromRevision: null,
        createdAt: "2026-07-13T00:00:00.000Z",
        snapshot: {},
      });

    await listWorkRevisions("work/1", 10, controller.signal);
    await getWorkRevision("work/1", 2, controller.signal);

    expect(apiGet).toHaveBeenNthCalledWith(1, "/creator/works/work%2F1/revisions", {
      params: { limit: 10 },
      signal: controller.signal,
    });
    expect(apiGet).toHaveBeenNthCalledWith(2, "/creator/works/work%2F1/revisions/2", {
      signal: controller.signal,
    });
  });
});
