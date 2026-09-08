import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

import type { Request, Response } from "express";

const mockCatalogService = {} as unknown as CatalogService;

function createController(): CatalogController {
  return new CatalogController(mockCatalogService);
}

describe("CatalogController affiliate redirection", () => {
  it("rejects an external destination before logging or redirecting", async () => {
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), redirect: vi.fn() };
    await createController().redirectAffiliate(
      "ridi", "https://evil.test/login", { headers: {} } as Request, res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
  });
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

describe("CatalogController cover SSRF boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects a private address without making any upstream request", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await createController().proxyCover("https://127.0.0.1/private", res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates a trusted CDN redirect before following it", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const fetchMock = vi.fn().mockResolvedValue(new globalThis.Response(null, {
      status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await createController().proxyCover("https://image-comic.pstatic.net/cover.png", res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL("https://image-comic.pstatic.net/cover.png"),
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }),
    );
  });

  it("serves an allowed CDN image after a same-origin redirect", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new globalThis.Response(null, { status: 302, headers: { location: "/actual.png" } }))
      .mockResolvedValueOnce(new globalThis.Response(png, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover("https://image-comic.pstatic.net/cover.png", res as unknown as Response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(new URL("https://image-comic.pstatic.net/actual.png"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(Buffer.from(png));
  });
});

describe("CatalogService getHomeData & withKmasImages", () => {
  it.each(["getSearchData", "getTitles"] as const)(
    "%s rejects malformed or oversized search input before catalogue side effects",
    async (method) => {
      const service = new CatalogService();
      const merge = vi.spyOn(service, "mergeKmasOnSiteAccess");
      for (const q of ["x".repeat(513), ["one", "two"], { length: 1_000_000 }, null, 123]) {
        await expect(service[method]({ q } as never)).rejects.toMatchObject({ status: 400 });
      }
      expect(merge).not.toHaveBeenCalled();
    },
  );

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
