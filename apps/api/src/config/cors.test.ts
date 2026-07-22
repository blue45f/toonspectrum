import "reflect-metadata";

import { Controller, Module, Post, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { allowedCorsOrigins, configureCors } from "./cors";

import type { AddressInfo } from "node:net";

const CONFIGURED_ORIGIN = "https://app.toonspectrum.example";

@Controller("cors-probe")
class CorsProbeController {
  @Post()
  create() {
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
    configureCors(app, {
      NODE_ENV: "production",
      API_CORS_ALLOWED_ORIGINS: CONFIGURED_ORIGIN,
    });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("구성된 운영 Origin의 POST preflight를 허용한다", async () => {
    const response = await fetch(`${baseUrl}/api/cors-probe`, {
      method: "OPTIONS",
      headers: {
        Origin: CONFIGURED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-user-id,idempotency-key",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(CONFIGURED_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-user-id");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
  });

  it("허용된 Origin의 실제 POST 응답에도 CORS 헤더를 넣는다", async () => {
    const response = await fetch(`${baseUrl}/api/cors-probe`, {
      method: "POST",
      headers: { Origin: CONFIGURED_ORIGIN, "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(CONFIGURED_ORIGIN);
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
