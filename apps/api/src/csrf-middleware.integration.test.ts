import "reflect-metadata";

import {
  Controller,
  Get,
  Headers,
  Module,
  Post,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  TOONSPECTRUM_CSRF_HEADER,
  TOONSPECTRUM_CSRF_HEADER_VALUE,
} from "../../../lib/csrf";
import { signSession } from "../../../lib/server/session";

import { configureCors } from "./config/cors";
import { createCsrfProtectionMiddleware } from "./csrf-middleware";
import { AUTH_SESSION_COOKIE_NAME } from "./session-cookie";
import { sessionAuth } from "./session-middleware";

import type { AddressInfo } from "node:net";

const ALLOWED_ORIGIN = "https://app.toonspectrum.example";
const CSRF_TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  API_CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
};

@Controller("csrf-probe")
class CsrfProbeController {
  @Post("mutation")
  mutate(@Headers("x-user-id") userId: string | undefined) {
    return { ok: true, userId: userId ?? null };
  }

  @Post("exception")
  explode() {
    throw new Error("csrf integration exception");
  }

  @Get("oauth/callback")
  callback() {
    return { ok: true };
  }

  @Get("download")
  download() {
    return "download";
  }
}

@Controller("auth")
class AuthCsrfProbeController {
  @Post("login")
  login() {
    return { ok: true };
  }

  @Post("oauth/:provider/demo")
  demo() {
    return { ok: true };
  }
}

@Controller("studio-realtime")
class StudioRealtimeTicketCsrfProbeController {
  @Post("tickets")
  issue() {
    return { ok: true };
  }
}

@Module({
  controllers: [
    CsrfProbeController,
    AuthCsrfProbeController,
    StudioRealtimeTicketCsrfProbeController,
  ],
})
class CsrfProbeModule {}

describe("cookie-authenticated Nest CSRF boundary", () => {
  let app: INestApplication;
  let baseUrl: string;
  let sessionToken: string;

  beforeAll(async () => {
    sessionToken = signSession("demo-csrf", 1);
    app = await NestFactory.create(CsrfProbeModule, {
      logger: false,
      bodyParser: false,
    });
    configureCors(app, CSRF_TEST_ENV);
    app.use(sessionAuth);
    app.use(createCsrfProtectionMiddleware(CSRF_TEST_ENV));
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  function cookieHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Cookie: `${AUTH_SESSION_COOKIE_NAME}=${sessionToken}`,
      ...extra,
    };
  }

  function validBrowserHeaders(): Record<string, string> {
    return cookieHeaders({
      Origin: ALLOWED_ORIGIN,
      [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
    });
  }

  it("accepts an exact allowed Origin and fixed proof for cookie auth", async () => {
    const response = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: validBrowserHeaders(),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      userId: "demo-csrf",
    });
  });

  it("rejects a missing proof or an untrusted Origin", async () => {
    const missingProof = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: cookieHeaders({ Origin: ALLOWED_ORIGIN }),
    });
    const wrongOrigin = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: cookieHeaders({
        Origin: "https://evil.example",
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
      }),
    });

    expect(missingProof.status).toBe(403);
    expect(wrongOrigin.status).toBe(403);
    expect(missingProof.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed without Origin unless strict same-origin Fetch Metadata is present", async () => {
    const noMetadata = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: cookieHeaders({
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
      }),
    });
    const crossSiteNavigation = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: cookieHeaders({
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "navigate",
      }),
    });
    const sameOriginFetch = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: cookieHeaders({
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
      }),
    });

    expect(noMetadata.status).toBe(403);
    expect(crossSiteNavigation.status).toBe(403);
    expect(sameOriginFetch.status).toBe(201);
  });

  it("does not break signed header-only CLI requests", async () => {
    const response = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: { "x-user-id": sessionToken },
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      userId: "demo-csrf",
    });
  });

  it("blocks cross-site form POSTs and exposes no evil preflight grant", async () => {
    const formPost = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "POST",
      headers: cookieHeaders({
        Origin: "https://evil.example",
        "Content-Type": "application/x-www-form-urlencoded",
      }),
      body: "action=mutate",
    });
    const preflight = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": TOONSPECTRUM_CSRF_HEADER,
      },
    });

    expect(formPost.status).toBe(403);
    expect(preflight.status).toBe(404);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("protects session-issuing auth POSTs before an authentication cookie exists", async () => {
    const crossSiteLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "email=attacker%40example.com&password=attacker-password",
    });
    const missingOriginDemo = await fetch(`${baseUrl}/api/auth/oauth/kakao/demo`, {
      method: "POST",
      headers: {
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
      },
    });
    const allowedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: ALLOWED_ORIGIN,
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
      },
    });

    expect(crossSiteLogin.status).toBe(403);
    expect(missingOriginDemo.status).toBe(403);
    expect(allowedLogin.status).toBe(201);
  });

  it("protects anonymous jam ticket POSTs with the same Origin proof as login", async () => {
    const crossSite = await fetch(`${baseUrl}/api/studio-realtime/tickets`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const missingOrigin = await fetch(`${baseUrl}/api/studio-realtime/tickets`, {
      method: "POST",
      headers: {
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
      },
    });
    const allowed = await fetch(`${baseUrl}/api/studio-realtime/tickets`, {
      method: "POST",
      headers: {
        Origin: ALLOWED_ORIGIN,
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
      },
    });

    expect(crossSite.status).toBe(403);
    expect(missingOrigin.status).toBe(403);
    expect(allowed.status).toBe(201);
  });

  it("protects the Vercel query-path auth adapter before its URL rewrite", async () => {
    const blocked = await fetch(`${baseUrl}/api/index?path=auth/login`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    const allowed = await fetch(`${baseUrl}/api/index?path=auth/login`, {
      method: "POST",
      headers: {
        Origin: ALLOWED_ORIGIN,
        [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE,
      },
    });

    expect(blocked.status).toBe(403);
    expect(allowed.status).toBe(404);
  });

  it("grants the CSRF header only to a configured preflight Origin", async () => {
    const response = await fetch(`${baseUrl}/api/csrf-probe/mutation`, {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": TOONSPECTRUM_CSRF_HEADER,
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      TOONSPECTRUM_CSRF_HEADER,
    );
  });

  it("protects requests before 404 route matching and exception execution", async () => {
    const blockedNotFound = await fetch(`${baseUrl}/api/not-found`, {
      method: "POST",
      headers: cookieHeaders({ Origin: ALLOWED_ORIGIN }),
    });
    const allowedNotFound = await fetch(`${baseUrl}/api/not-found`, {
      method: "POST",
      headers: validBrowserHeaders(),
    });
    const blockedException = await fetch(`${baseUrl}/api/csrf-probe/exception`, {
      method: "POST",
      headers: cookieHeaders({ Origin: ALLOWED_ORIGIN }),
    });
    const allowedException = await fetch(`${baseUrl}/api/csrf-probe/exception`, {
      method: "POST",
      headers: validBrowserHeaders(),
    });

    expect(blockedNotFound.status).toBe(403);
    expect(allowedNotFound.status).toBe(404);
    expect(blockedException.status).toBe(403);
    expect(allowedException.status).toBe(500);
  });

  it("keeps OAuth callback, download GET, and HEAD requests outside the mutation boundary", async () => {
    const callback = await fetch(`${baseUrl}/api/csrf-probe/oauth/callback`, {
      headers: cookieHeaders(),
    });
    const download = await fetch(`${baseUrl}/api/csrf-probe/download`, {
      headers: cookieHeaders(),
    });
    const head = await fetch(`${baseUrl}/api/csrf-probe/download`, {
      method: "HEAD",
      headers: cookieHeaders(),
    });

    expect(callback.status).toBe(200);
    expect(download.status).toBe(200);
    expect(head.status).toBe(200);
  });
});
