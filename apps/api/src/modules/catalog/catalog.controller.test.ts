import { describe, expect, it, vi } from "vitest";

import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

import type { Request, Response } from "express";

const mockCatalogService = {} as unknown as CatalogService;

function createController(): CatalogController {
  return new CatalogController(mockCatalogService);
}

describe("CatalogController affiliate redirection", () => {
  it("to 쿼리 파라미터가 없으면 400 에러를 반환한다", async () => {
    const controller = createController();
    const req = {
      headers: {},
    } as unknown as Request;

    const statusFn = vi.fn().mockReturnThis();
    const sendFn = vi.fn();
    const res = {
      status: statusFn,
      send: sendFn,
    } as unknown as Response;

    await controller.redirectAffiliate("ridi", undefined, req, res);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(sendFn).toHaveBeenCalledWith("missing destination url ('to')");
  });

  it("제휴가 지원되는 플랫폼(ridi)인 경우 제휴 파라미터를 추가하여 302 리다이렉트한다", async () => {
    const controller = createController();
    const req = {
      headers: {
        referer: "https://toonspectrum.com/detail",
        "user-agent": "Mozilla/5.0",
      },
    } as unknown as Request;

    const redirectFn = vi.fn();
    const res = {
      redirect: redirectFn,
    } as unknown as Response;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await controller.redirectAffiliate(
      "ridi",
      "https://ridibooks.com/books/123",
      req,
      res
    );

    expect(redirectFn).toHaveBeenCalledWith(
      302,
      "https://ridibooks.com/books/123?ridi_affiliate=toonspectrum"
    );
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("제휴가 지원되지 않는 플랫폼(naver)인 경우 원본 URL 그대로 302 리다이렉트한다", async () => {
    const controller = createController();
    const req = {
      headers: {},
    } as unknown as Request;

    const redirectFn = vi.fn();
    const res = {
      redirect: redirectFn,
    } as unknown as Response;

    await controller.redirectAffiliate(
      "naver",
      "https://series.naver.com/comic/123",
      req,
      res
    );

    expect(redirectFn).toHaveBeenCalledWith(
      302,
      "https://series.naver.com/comic/123"
    );
  });
});

describe("CatalogService getHomeData & withKmasImages", () => {
  it("getHomeData returns valid response structure", async () => {
    const service = new CatalogService();
    const data = await service.getHomeData();

    expect(data).toBeDefined();
    expect(Array.isArray(data.featured)).toBe(true);
    expect(Array.isArray(data.topRated)).toBe(true);
    expect(Array.isArray(data.waitFree)).toBe(true);
    expect(Array.isArray(data.newest)).toBe(true);
    expect(Array.isArray(data.families)).toBe(true);
    expect(Array.isArray(data.tags)).toBe(true);
    expect(typeof data.todayDay).toBe("string");
    expect(Array.isArray(data.todayReleases)).toBe(true);
    expect(typeof data.stats).toBe("object");
    expect(typeof data.stats.titles).toBe("number");
    expect(typeof data.stats.platforms).toBe("number");
    expect(typeof data.stats.genres).toBe("number");
    expect(typeof data.stats.reviews).toBe("number");
  });
});

