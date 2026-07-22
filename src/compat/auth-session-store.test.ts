import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAuthSession,
  getAuthToken,
  persistSession,
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
});
