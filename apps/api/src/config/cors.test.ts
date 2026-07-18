import "reflect-metadata";

import { Controller, Module, Post, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { allowedCorsOrigins, configureCors, TOSS_CORS_ORIGINS } from "./cors";

import type { AddressInfo } from "node:net";

@Controller("auth/toss")
class CorsProbeController {
  @Post("exchange")
  exchange() {
    return { ok: true };
  }
}

@Module({ controllers: [CorsProbeController] })
class CorsProbeModule {}

describe("API CORS", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(CorsProbeModule, { logger: false });
    configureCors(app, { NODE_ENV: "production" });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(TOSS_CORS_ORIGINS)("%s의 로그인 POST preflight를 허용한다", async (origin) => {
    const response = await fetch(`${baseUrl}/api/auth/toss/exchange`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-user-id,idempotency-key",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-user-id");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
  });

  it("허용된 Origin의 실제 POST 응답에도 CORS 헤더를 넣는다", async () => {
    const origin = TOSS_CORS_ORIGINS[0];
    const response = await fetch(`${baseUrl}/api/auth/toss/exchange`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("운영에서는 임의 Origin과 localhost를 허용하지 않는다", () => {
    const origins = allowedCorsOrigins({
      NODE_ENV: "production",
      API_CORS_ALLOWED_ORIGINS: "https://preview.example.com/,not-a-url,ftp://invalid.example.com",
    });

    expect(origins).toContain("https://preview.example.com");
    expect(origins).not.toContain("http://localhost:5181");
    expect(origins).not.toContain("not-a-url");
  });
});
