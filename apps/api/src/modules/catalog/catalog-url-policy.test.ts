import { describe, expect, it } from "vitest";

import { resolveAffiliateDestination, resolveCoverFetchUrl } from "./catalog-url-policy";

describe("catalog destination security", () => {
  it.each([
    "http://image-comic.pstatic.net/a.png",
    "https://image-comic.pstatic.net:8443/a.png",
    "https://user:pass@image-comic.pstatic.net/a.png",
    "https://image-comic.pstatic.net.evil.test/a.png",
    "https://evil.image-comic.pstatic.net/a.png",
    "https://127.0.0.1/a.png",
    "https://[::1]/a.png",
    "https://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd",
  ])("rejects an untrusted cover destination: %s", (url) => {
    expect(resolveCoverFetchUrl(url)).toBeNull();
  });

  it("preserves a trusted CDN path without allowing it to replace the authority", () => {
    const result = resolveCoverFetchUrl("https://image-comic.pstatic.net//evil.test/a.png?size=200#ignored");
    expect(result).toBe("https://image-comic.pstatic.net//evil.test/a.png?size=200");
    expect(new URL(result!).origin).toBe("https://image-comic.pstatic.net");
  });

  it.each([
    ["ridi", "https://evil.test/phish"],
    ["ridi", "https://ridibooks.com.evil.test/phish"],
    ["ridi", "https://ridibooks.com:8443/phish"],
    ["ridi", "https://user@ridibooks.com/books/1"],
    ["ridi", "javascript:alert(1)"],
    ["ridi", "//ridibooks.com/books/1"],
    ["unknown", "https://ridibooks.com/books/1"],
    ["__proto__", "https://ridibooks.com/books/1"],
    ["ridi", "https://www.yes24.com/books/1"],
  ])("rejects mismatched affiliate platform %s and URL %s", (platform, url) => {
    expect(resolveAffiliateDestination(platform, url)).toBeNull();
  });

  it("accepts the platform origin and preserves path/query/fragment", () => {
    expect(resolveAffiliateDestination("ridi", "https://ridibooks.com/books/1?view=2#reviews"))
      .toBe("https://ridibooks.com/books/1?view=2#reviews");
  });
});
