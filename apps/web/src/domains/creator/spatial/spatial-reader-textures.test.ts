// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialReaderImagePool } from "./spatial-reader-textures";

let pool: SpatialReaderImagePool;
const images: HTMLImageElement[] = [];
beforeEach(() => {
  images.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("Image", class {
    constructor() {
      const image = document.createElement("img");
      Object.defineProperties(image, {
        naturalWidth: { value: 800 }, naturalHeight: { value: 1120 },
      });
      images.push(image);
      return image;
    }
  });
  pool = new SpatialReaderImagePool();
});
afterEach(() => {
  pool.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function finish(image: HTMLImageElement) { image.dispatchEvent(new Event("load")); }

describe("spatial reader image URL boundary", () => {
  it("assigns only the canonical URL and preserves signed query bytes", async () => {
    const pending = pool.load("/page one.png?sig=a%2Fb&part=1");
    const image = images[0]!;
    expect(image.getAttribute("src")).toBe(new URL("/page%20one.png?sig=a%2Fb&part=1", document.baseURI).href);
    expect(image.crossOrigin).toBe("anonymous");
    expect(image.referrerPolicy).toBe("no-referrer");
    finish(image);
    await expect(pending).resolves.toBe(image);
  });
  it("shares one pending image for equivalent canonical URLs", async () => {
    const first = pool.load("/page one.png?sig=a%2Fb");
    const second = pool.load(new URL("/page%20one.png?sig=a%2Fb", document.baseURI).href);
    expect(second).toBe(first);
    expect(images).toHaveLength(1);
    finish(images[0]!);
    await expect(first).resolves.toBe(images[0]);
  });
  it.each([
    "javascript:alert(1)", "java\tscript:alert(1)", "\nJaVaScRiPt:alert(1)",
    "data:text/html;base64,PHN2Zz4=", "data:image/svg+xml;base64,PHN2Zz4=",
    "file:///tmp/page.png", "https://user:pass@example.com/page.png",
    "blob:https://other.test/id", "http://other.test/page.png", "https://[invalid",
  ])("rejects %s before allocating an image", async (source) => {
    await expect(pool.load(source)).rejects.toThrow("이 이미지 주소");
    expect(images).toHaveLength(0);
  });
  it.each([
    "https://cdn.example.com/page.png?sig=a%2Fb&part=1",
    "data:image/png;base64,aGVsbG8=",
  ])("preserves an allowed raster source %s", async (source) => {
    const pending = pool.load(source);
    expect(images[0]!.getAttribute("src")).toBe(source);
    finish(images[0]!);
    await expect(pending).resolves.toBe(images[0]);
  });
  it("preserves same-origin object URLs for local manuscripts", async () => {
    const source = `blob:${window.location.origin}/local-page-id`;
    const pending = pool.load(source);
    expect(images[0]!.getAttribute("src")).toBe(source);
    finish(images[0]!);
    await expect(pending).resolves.toBe(images[0]);
  });
  it("does not reuse a relative URL cached under a different document base", async () => {
    const first = pool.load("page.png");
    const base = document.createElement("base");
    base.href = new URL("/another-chapter/", document.baseURI).href;
    document.head.append(base);
    try {
      const second = pool.load("page.png");
      expect(second).not.toBe(first);
      expect(images).toHaveLength(2);
      expect(images[1]!.getAttribute("src")).toBe(new URL("page.png", base.href).href);
      images.forEach(finish);
      await Promise.all([first, second]);
    } finally { base.remove(); }
  });
  it("evicts the least-recently-used image without exceeding three entries", async () => {
    const first = pool.load("/one.png");
    const released = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = pool.load("/two.png");
    const third = pool.load("/three.png");
    expect(pool.load(new URL("/two.png", document.baseURI).href)).toBe(second);
    const fourth = pool.load("/four.png");
    await released;
    expect(images).toHaveLength(4);
    expect(images[0]!.hasAttribute("src")).toBe(false);
    images.slice(1).forEach(finish);
    await Promise.all([second, third, fourth]);
  });
  it("removes a failed canonical cache entry so an alias can retry", async () => {
    const first = pool.load("/retry page.png");
    const failed = expect(first).rejects.toThrow("CORS");
    images[0]!.dispatchEvent(new Event("error"));
    await failed;
    expect(images[0]!.hasAttribute("src")).toBe(false);
    const second = pool.load(new URL("/retry%20page.png", document.baseURI).href);
    expect(images).toHaveLength(2);
    finish(images[1]!);
    await expect(second).resolves.toBe(images[1]);
  });
  it("clears timed-out requests and permits a fresh retry", async () => {
    const first = pool.load("/slow.png");
    const failed = expect(first).rejects.toThrow("시간이 초과");
    await vi.advanceTimersByTimeAsync(12000);
    await failed;
    expect(images[0]!.hasAttribute("src")).toBe(false);
    const retry = pool.load("/slow.png");
    expect(images).toHaveLength(2);
    finish(images[1]!);
    await expect(retry).resolves.toBe(images[1]);
  });
  it("releases pending images on disposal and rejects subsequent loads", async () => {
    const pending = pool.load("/pending.png");
    const released = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    pool.dispose();
    await released;
    expect(images[0]!.hasAttribute("src")).toBe(false);
    await expect(pool.load("/another.png")).rejects.toThrow("리더가 닫혔습니다");
    expect(images).toHaveLength(1);
  });
});
