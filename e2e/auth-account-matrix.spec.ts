import { expect, request as apiRequest, test } from "@playwright/test";

const LIVE_ENABLED = process.env.TOONSPECTRUM_MARKET_LIVE_E2E === "1";
const SESSION_COOKIE_NAME = "toonspectrum-auth-session";
const CSRF_HEADERS = { "x-toonspectrum-csrf": "1" } as const;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the auth account matrix.`);
  return value;
}

function taggedEmail(email: string, tag: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) throw new Error("The base QA email is malformed.");
  return `${email.slice(0, at)}+${tag}@${email.slice(at + 1)}`.toLowerCase();
}

test.describe("isolated auth account lifecycle matrix", () => {
  test.skip(
    !LIVE_ENABLED,
    "Run through pnpm test:market:live against the isolated QA PostgreSQL/API target.",
  );

  test("validates rejected signup inputs, normalization, login, logout, and stale-session revocation", async () => {
    const apiOrigin = requiredEnvironment("TOONSPECTRUM_MARKET_LIVE_API_URL")
      .replace(/\/+$/u, "");
    const baseEmail = requiredEnvironment("TOONSPECTRUM_MARKET_LIVE_EMAIL").toLowerCase();
    const password = requiredEnvironment("TOONSPECTRUM_MARKET_LIVE_PASSWORD");
    const email = taggedEmail(baseEmail, "lifecycle");
    const mixedCaseEmail = email.replace(/^[^@]+/u, (local) => local.toUpperCase());
    const name = "격리 QA 사용자 🌈 ' OR 1=1 --";
    const mutationHeaders = {
      Origin: apiOrigin,
      ...CSRF_HEADERS,
    };

    const client = await apiRequest.newContext({
      baseURL: apiOrigin,
      extraHTTPHeaders: mutationHeaders,
    });

    try {
      const invalidEmail = await client.post("/api/auth/signup", {
        data: { email: "not-an-email", password, name },
      });
      expect(invalidEmail.status(), await invalidEmail.text()).toBe(400);

      const weakPassword = await client.post("/api/auth/signup", {
        data: { email: taggedEmail(baseEmail, "weak"), password: "12345", name },
      });
      expect(weakPassword.status(), await weakPassword.text()).toBe(400);

      const signup = await client.post("/api/auth/signup", {
        data: { email: mixedCaseEmail, password, name },
      });
      expect([200, 201], await signup.text()).toContain(signup.status());

      const duplicate = await client.post("/api/auth/signup", {
        data: { email, password, name: "중복 계정" },
      });
      expect(duplicate.status(), await duplicate.text()).toBe(409);

      const wrongPassword = await client.post("/api/auth/login", {
        data: { email, password: `${password}-wrong` },
      });
      expect(wrongPassword.status(), await wrongPassword.text()).toBe(401);

      const login = await client.post("/api/auth/login", {
        data: { email: mixedCaseEmail, password },
      });
      expect(login.ok(), await login.text()).toBe(true);
      expect(await login.json()).toMatchObject({
        ok: true,
        user: { email, name },
      });

      const state = await client.storageState();
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
      const staleCookieHeader = `${SESSION_COOKIE_NAME}=${sessionCookie?.value ?? ""}`;

      const session = await client.get("/api/auth/session");
      expect(session.ok(), await session.text()).toBe(true);
      expect(await session.json()).toMatchObject({
        authenticated: true,
        user: { email, name },
      });

      const logout = await client.post("/api/auth/logout");
      expect(logout.ok(), await logout.text()).toBe(true);
      expect(await logout.json()).toEqual({ ok: true });

      const afterLogout = await client.get("/api/auth/session");
      expect(afterLogout.ok(), await afterLogout.text()).toBe(true);
      expect(await afterLogout.json()).toEqual({ authenticated: false, user: null });

      const staleClient = await apiRequest.newContext({
        baseURL: apiOrigin,
        extraHTTPHeaders: { Cookie: staleCookieHeader },
      });
      try {
        const staleSession = await staleClient.get("/api/auth/session");
        expect(staleSession.ok(), await staleSession.text()).toBe(true);
        expect(await staleSession.json()).toEqual({ authenticated: false, user: null });
      } finally {
        await staleClient.dispose();
      }

      const badOriginClient = await apiRequest.newContext({ baseURL: apiOrigin });
      try {
        const badOrigin = await badOriginClient.post("/api/auth/oauth/google/id-token", {
          data: { idToken: "not-a-real-token" },
          headers: { Origin: "https://attacker.invalid" },
        });
        expect(badOrigin.status(), await badOrigin.text()).toBe(403);

        const unsupportedProvider = await badOriginClient.post(
          "/api/auth/oauth/not-a-provider/demo",
          { headers: mutationHeaders },
        );
        expect(unsupportedProvider.status(), await unsupportedProvider.text()).toBe(400);
      } finally {
        await badOriginClient.dispose();
      }
    } finally {
      await client.dispose();
    }
  });
});
