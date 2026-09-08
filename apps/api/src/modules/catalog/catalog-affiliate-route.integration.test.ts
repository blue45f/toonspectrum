import "reflect-metadata";

import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

import type { AddressInfo } from "node:net";

@Module({
  controllers: [CatalogController],
  providers: [{ provide: CatalogService, useValue: {} }],
})
class AffiliateRouteTestModule {}

describe("the public affiliate route with the production API prefix", () => {
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    app = await NestFactory.create(AffiliateRouteTestModule, { logger: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ["naver", "https://series.naver.com/comic/123", "https://series.naver.com/comic/123"],
    ["ridi", "https://ridibooks.com/books/123", "https://ridibooks.com/books/123?ridi_affiliate=toonspectrum"],
  ])("redirects the shipped /api/go/%s link without a second API prefix", async (platform, to, expected) => {
    const response = await fetch(`${origin}/api/go/${platform}?${new URLSearchParams({ to })}`, {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(expected);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it.each([undefined, "https://untrusted.example/book", "javascript:alert(1)"])(
    "rejects a missing or unsupported destination at the public route (%s)",
    async (to) => {
      const query = to === undefined ? "" : `?${new URLSearchParams({ to })}`;
      const response = await fetch(`${origin}/api/go/naver${query}`, { redirect: "manual" });
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    },
  );
});
