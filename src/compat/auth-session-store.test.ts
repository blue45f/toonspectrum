import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthSession, persistSession, tossLoginFlow } from "./auth-session-store";

const apiRaw = vi.hoisted(() => vi.fn());

vi.mock("@/src/infrastructure/api", () => ({
  api: { raw: apiRaw },
  apiPath: (path: string) => `/api${path}`,
}));

const grant = { authorizationCode: "one-time-code", referrer: "SANDBOX" } as const;

describe("tossLoginFlow", () => {
  beforeEach(() => {
    apiRaw.mockReset();
    persistSession(null);
    globalThis.__toonspectrumTossLogin = vi.fn().mockResolvedValue(grant);
  });

  afterEach(() => {
    globalThis.__toonspectrumTossLogin = undefined;
    persistSession(null);
  });

  it("인가코드와 referrer를 서버에 교환하고 서명 세션을 저장한다", async () => {
    apiRaw.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "toss-user", name: "토스 사용자", email: "toss_1@toss.local" },
          token: "signed-session-token",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(tossLoginFlow()).resolves.toEqual({ ok: true, error: null, message: null });
    expect(apiRaw).toHaveBeenCalledWith(
      "/api/auth/toss/exchange",
      expect.objectContaining({
        method: "POST",
        json: grant,
      }),
    );
    expect(getAuthSession()).toEqual({
      user: { id: "toss-user", name: "토스 사용자", email: "toss_1@toss.local" },
      token: "signed-session-token",
    });
  });

  it("SDK 호출 실패를 사용자 취소로 숨기지 않는다", async () => {
    globalThis.__toonspectrumTossLogin = vi.fn().mockRejectedValue(new Error("native bridge unavailable"));

    const result = await tossLoginFlow();

    expect(result).toMatchObject({ ok: false, error: "toss-sdk-failed" });
    expect(result.message).toContain("토스 로그인 창을 열지 못했어요");
    expect(apiRaw).not.toHaveBeenCalled();
  });

  it("사용자가 로그인 창을 닫으면 오류 문구 없이 취소로 반환한다", async () => {
    globalThis.__toonspectrumTossLogin = vi.fn().mockResolvedValue(null);

    await expect(tossLoginFlow()).resolves.toEqual({ ok: false, error: "toss-cancelled", message: null });
    expect(apiRaw).not.toHaveBeenCalled();
  });

  it("서버에 도달하지 못한 요청을 네트워크 오류로 반환한다", async () => {
    apiRaw.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await tossLoginFlow();

    expect(result).toMatchObject({ ok: false, error: "toss-network-failed" });
    expect(result.message).toContain("로그인 서버에 연결하지 못했어요");
  });

  it.each([
    [401, "토스 인증이 만료되었어요.", "toss-authorization-failed"],
    [403, "이 계정은 정지되었어요.", "toss-access-blocked"],
    [502, "토스 로그인 서버와 통신하지 못했어요.", "toss-upstream-failed"],
    [503, "토스 로그인이 아직 설정되지 않았어요.", "toss-not-configured"],
  ] as const)("서버 HTTP %i 오류를 %s 안내로 보존한다", async (status, message, code) => {
    apiRaw.mockResolvedValue(
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(tossLoginFlow()).resolves.toEqual({ ok: false, error: code, message });
    expect(getAuthSession()).toBeNull();
  });

  it("성공 응답에 세션 토큰이 없으면 로그인으로 확정하지 않는다", async () => {
    apiRaw.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "toss-user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await tossLoginFlow();

    expect(result).toMatchObject({ ok: false, error: "toss-server-failed" });
    expect(getAuthSession()).toBeNull();
  });
});
