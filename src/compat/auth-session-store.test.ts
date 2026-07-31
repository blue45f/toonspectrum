import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAuthSession,
  getAuthToken,
  persistSession,
  signInWithGoogleIdToken,
  signOut,
} from "./auth-session-store";

const apiRaw = vi.hoisted(() => vi.fn());

vi.mock("@/src/infrastructure/api", () => ({
  api: { raw: apiRaw },
  apiPath: (path: string) => `/api${path}`,
}));

describe("auth session store", () => {
  beforeEach(() => {
    apiRaw.mockReset();
    persistSession(null);
  });

  afterEach(() => {
    persistSession(null);
  });

  it("로그아웃은 현재 서명 토큰을 전송한 뒤 API 실패에도 로컬 세션을 정리한다", async () => {
    persistSession({ user: { id: "web-user" }, token: "signed-session-token" });
    apiRaw.mockRejectedValue(new TypeError("network unavailable"));

    await expect(signOut()).resolves.toBeUndefined();

    expect(apiRaw).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: { "x-user-id": "signed-session-token" },
      }),
    );
    expect(getAuthToken()).toBeNull();
    expect(getAuthSession()).toBeNull();
  });

  it("검증 전부터 형식이 잘못된 Google credential은 네트워크로 보내지 않는다", async () => {
    await expect(signInWithGoogleIdToken("not-a-jwt")).resolves.toEqual({
      ok: false,
      error: "Google 로그인 응답 형식이 올바르지 않아요.",
      status: 400,
    });
    expect(apiRaw).not.toHaveBeenCalled();
  });

  it("Google ID 토큰 로그인 성공 시 서명 세션을 저장한다", async () => {
    apiRaw.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "google-user", email: "artist@example.com" },
          token: "signed-google-session",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await signInWithGoogleIdToken("header.payload.signature");

    expect(result).toEqual({ ok: true, error: null, status: 200 });
    expect(apiRaw).toHaveBeenCalledWith(
      "/api/auth/oauth/google/id-token",
      expect.objectContaining({
        method: "POST",
        json: { idToken: "header.payload.signature" },
        throwHttpErrors: false,
      }),
    );
    expect(getAuthToken()).toBe("signed-google-session");
    expect(getAuthSession()?.user.id).toBe("google-user");
  });

  it("서버의 안전한 Google 로그인 오류를 표시하고 기존 세션은 만들지 않는다", async () => {
    apiRaw.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Google 로그인 정보가 만료되었어요." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      signInWithGoogleIdToken("header.payload.signature"),
    ).resolves.toEqual({
      ok: false,
      error: "Google 로그인 정보가 만료되었어요.",
      status: 401,
    });
    expect(getAuthSession()).toBeNull();
  });

  it("네트워크 실패를 예외로 전파하지 않고 재시도 가능한 결과로 반환한다", async () => {
    apiRaw.mockRejectedValue(new TypeError("network unavailable"));

    await expect(
      signInWithGoogleIdToken("header.payload.signature"),
    ).resolves.toEqual({
      ok: false,
      error: "로그인 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.",
      status: 0,
    });
    expect(getAuthSession()).toBeNull();
  });
});
