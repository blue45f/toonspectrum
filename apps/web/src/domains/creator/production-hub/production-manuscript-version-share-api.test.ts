// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";

import { resolveVersionShare } from "./production-manuscript-version-share-api";

vi.mock("@/platform/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  isAppApiError: (error: unknown): boolean =>
    typeof error === "object" && error !== null && "__appApiError" in error,
}));

const get = vi.mocked(api.get);

function apiError(status: number, code: string | null): Error {
  return Object.assign(new Error("api error"), { __appApiError: true, status, code });
}

const OK_BODY = {
  kind: "ok",
  permission: "view",
  watermark: false,
  workId: "work-1",
  projectId: "project-1",
  artifactId: "artifact-1",
  artifactTitle: "1화 원고",
  workTitle: "달빛 기사",
  snapshot: {
    id: "snap-1",
    artifactId: "artifact-1",
    name: "v3",
    memo: "",
    revisionId: "rev-1",
    rootGraphHash: "a".repeat(64),
    revisionKind: "checkpoint",
    revisionMessage: null,
    createdBy: "user-1",
    createdAt: "2026-10-03T00:00:00.000Z",
  },
  revision: {
    id: "rev-1",
    artifactId: "artifact-1",
    kind: "checkpoint",
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: 1,
    operationLast: 4,
    createdBy: "user-1",
    deviceId: "device-1",
    createdAt: "2026-10-03T00:00:00.000Z",
    message: null,
  },
};

describe("resolveVersionShare", () => {
  it("정상 응답은 ok 판정과 함께 돌려준다", async () => {
    get.mockResolvedValue(OK_BODY);
    const resolution = await resolveVersionShare("token-value-123456");
    expect(resolution.status).toBe("ok");
    if (resolution.status === "ok") {
      expect(resolution.share.workTitle).toBe("달빛 기사");
      expect(resolution.share.snapshot.name).toBe("v3");
    }
  });

  it("비밀번호는 헤더로만 보낸다", async () => {
    get.mockResolvedValue(OK_BODY);
    await resolveVersionShare("token-value-123456", "moon-1234");
    const options = get.mock.calls.at(-1)?.[1] as { headers?: Record<string, string> };
    expect(options.headers).toEqual({ "x-version-share-password": "moon-1234" });
    expect(get.mock.calls.at(-1)?.[0]).not.toContain("moon-1234");
  });

  it.each([
    [404, "version_share_not_found", "not_found"],
    [410, "version_share_revoked", "revoked"],
    [410, "version_share_expired", "expired"],
    [401, "version_share_password_required", "password_required"],
    [401, "version_share_password_invalid", "password_invalid"],
  ] as const)("서버 코드 %s를 %s 판정으로 바꾼다", async (status, code, expected) => {
    get.mockRejectedValue(apiError(status, code));
    await expect(resolveVersionShare("token-value-123456")).resolves.toEqual({ status: expected });
  });

  it("403은 로그인 필요로 바꾼다", async () => {
    get.mockRejectedValue(apiError(403, null));
    await expect(resolveVersionShare("token-value-123456")).resolves.toEqual({
      status: "login_required",
    });
  });

  it("모르는 오류는 그대로 던져 페이지가 재시도를 안내하게 한다", async () => {
    get.mockRejectedValue(new Error("network down"));
    await expect(resolveVersionShare("token-value-123456")).rejects.toThrow("network down");
  });
});
