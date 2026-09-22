// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioSkiaDocumentFontSource } from "./studio-skia-document-font-contract";
import { loadStudioSkiaDocumentFontData } from "./studio-skia-document-font-source";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Skia document font sources", () => {
  it("routes Pretendard, Google and custom families to stable source keys", () => {
    expect(resolveStudioSkiaDocumentFontSource(undefined, 400)).toMatchObject({
      key: expect.stringContaining("PretendardVariable.woff2"),
      family: "Pretendard",
    });
    expect(resolveStudioSkiaDocumentFontSource("'Noto Sans KR', sans-serif", 700)).toMatchObject({
      key: expect.stringContaining("fonts.googleapis.com/css2"),
      family: "Noto Sans KR",
    });
    expect(resolveStudioSkiaDocumentFontSource("'내 글꼴', sans-serif", 400)).toEqual({
      key: "custom:내 글꼴",
      family: "내 글꼴",
    });
  });

  it("loads only declared font sources from approved hosts", async () => {
    const css = "@font-face{font-family:'T';src:url(https://fonts.gstatic.com/s/t/v1/a.woff2) format('woff2')}";
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("fonts.googleapis.com")
        ? new Response(css, { status: 200 })
        : new Response(bytes.slice().buffer, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T",
      family: "T",
    }, new AbortController().signal);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects font URLs outside the allowlisted delivery hosts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "@font-face{src:url(https://evil.example/font.woff2) format('woff2')}",
      { status: 200 },
    )));
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T",
      family: "T",
    }, new AbortController().signal)).rejects.toThrow(/untrusted GPU font host/u);
  });

  it("rejects untrusted stylesheet hosts before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://evil.example/font.css",
      family: "T",
    }, new AbortController().signal)).rejects.toThrow(
      /untrusted GPU font stylesheet host/u,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors an already aborted font request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    vi.stubGlobal("fetch", vi.fn());
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T",
      family: "T",
    }, controller.signal)).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
});
