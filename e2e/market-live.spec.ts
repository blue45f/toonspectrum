import { expect, test } from "@playwright/test";

const LIVE_ENABLED = process.env.TOONSPECTRUM_MARKET_LIVE_E2E === "1";
const SESSION_COOKIE_NAME = "toonspectrum-auth-session";
const CSRF_HEADERS = { "x-toonspectrum-csrf": "1" } as const;

test.describe("creator marketplace opt-in live API", () => {
  test.skip(
    !LIVE_ENABLED,
    "Run through pnpm test:market:live with the explicit isolated DB/API opt-in variables.",
  );

  test("real signup/login issues an HttpOnly cookie and the public list endpoint responds", async ({
    request,
  }) => {
    const apiOrigin = process.env.TOONSPECTRUM_MARKET_LIVE_API_URL!
      .trim()
      .replace(/\/+$/u, "");
    const email = process.env.TOONSPECTRUM_MARKET_LIVE_EMAIL!.trim().toLowerCase();
    const password = process.env.TOONSPECTRUM_MARKET_LIVE_PASSWORD!;
    const name = process.env.TOONSPECTRUM_MARKET_LIVE_NAME?.trim() || "마켓 라이브 검증";
    const mutationHeaders = {
      Origin: apiOrigin,
      ...CSRF_HEADERS,
    };

    const signup = await request.post(`${apiOrigin}/api/auth/signup`, {
      data: { email, password, name },
      headers: mutationHeaders,
    });
    expect([200, 201, 409], await signup.text()).toContain(signup.status());

    const login = await request.post(`${apiOrigin}/api/auth/login`, {
      data: { email, password },
      headers: mutationHeaders,
    });
    expect(login.ok(), await login.text()).toBe(true);
    expect(login.headers()["set-cookie"]).toContain(`${SESSION_COOKIE_NAME}=`);

    const state = await request.storageState();
    const sessionCookie = state.cookies.find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(sessionCookie).toMatchObject({
      httpOnly: true,
      name: SESSION_COOKIE_NAME,
      sameSite: "Lax",
      secure: false,
    });
    expect(sessionCookie?.value).toBeTruthy();

    const sessionResponse = await request.get(`${apiOrigin}/api/auth/session`);
    expect(sessionResponse.ok()).toBe(true);
    expect(await sessionResponse.json()).toMatchObject({
      authenticated: true,
      user: { email },
    });

    const listResponse = await request.get(
      `${apiOrigin}/api/creator/marketplace/resources?limit=12`,
    );
    expect(listResponse.ok()).toBe(true);
    const page = await listResponse.json();
    expect(page).toMatchObject({
      hasMore: expect.any(Boolean),
      items: expect.any(Array),
      limit: 12,
    });
    expect(page.nextCursor === null || typeof page.nextCursor === "string").toBe(true);
  });
});
