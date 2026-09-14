import { describe, expect, it } from "vitest";

import {
  extractExportedHttpUrls,
  hasExactExportedHttpsUrl,
  hasExportedHttpsUrlUnderPath,
} from "./exported-url-provenance";

const ART_INSTITUTE_SOURCE = "https://www.artic.edu/artworks/116363";
const POLY_HAVEN_ORIGIN = "https://polyhaven.com";

describe("exported URL provenance", () => {
  it("parses Markdown and plain HTTP(S) tokens without credentials", () => {
    const urls = extractExportedHttpUrls([
      `[source](${ART_INSTITUTE_SOURCE})`,
      "https://polyhaven.com/a/brick_floor_03.",
      "https://user:password@example.test/private",
      "javascript:https://example.test/not-a-link",
    ].join("\n"));

    expect(urls.map((url) => url.href)).toEqual([
      ART_INSTITUTE_SOURCE,
      "https://polyhaven.com/a/brick_floor_03",
    ]);
  });

  it("matches an exact trusted URL by parsed components", () => {
    expect(hasExactExportedHttpsUrl(
      `출처: [Art Institute](${ART_INSTITUTE_SOURCE})`,
      ART_INSTITUTE_SOURCE,
    )).toBe(true);
  });

  it.each([
    "https://www.artic.edu.evil.example/artworks/116363",
    "https://evil.example/https://www.artic.edu/artworks/116363",
    "https://evil.example/?next=https://www.artic.edu/artworks/116363",
    "https://attacker@www.artic.edu/artworks/116363",
    "http://www.artic.edu/artworks/116363",
    "javascript:https://www.artic.edu/artworks/116363",
    "prefixhttps://www.artic.edu/artworks/116363",
    "data:text/plain,https://www.artic.edu/artworks/116363",
    "next=https://www.artic.edu/artworks/116363",
  ])("rejects exact-URL substring bypass %s", (candidate) => {
    expect(hasExactExportedHttpsUrl(candidate, ART_INSTITUTE_SOURCE)).toBe(false);
  });

  it("matches a non-empty asset path only at the exact trusted origin", () => {
    expect(hasExportedHttpsUrlUnderPath(
      "[brick](https://polyhaven.com/a/brick_floor_03)",
      POLY_HAVEN_ORIGIN,
      "/a/",
    )).toBe(true);
    expect(hasExportedHttpsUrlUnderPath(
      "https://polyhaven.com/a/brick_floor_03?download=1",
      POLY_HAVEN_ORIGIN,
      "/a/",
    )).toBe(true);
  });

  it.each([
    "https://polyhaven.com.evil.example/a/brick_floor_03",
    "https://evil.example/https://polyhaven.com/a/brick_floor_03",
    "https://evil.example/?source=https://polyhaven.com/a/brick_floor_03",
    "https://attacker@polyhaven.com/a/brick_floor_03",
    "http://polyhaven.com/a/brick_floor_03",
    "https://polyhaven.com/a/",
  ])("rejects origin/path substring bypass %s", (candidate) => {
    expect(hasExportedHttpsUrlUnderPath(candidate, POLY_HAVEN_ORIGIN, "/a/")).toBe(false);
  });

  it("rejects invalid trusted constraints before scanning export text", () => {
    expect(() => hasExactExportedHttpsUrl("", "http://example.test/item")).toThrow();
    expect(() => hasExportedHttpsUrlUnderPath("", "https://polyhaven.com/a", "/a/")).toThrow();
    expect(() => hasExportedHttpsUrlUnderPath("", POLY_HAVEN_ORIGIN, "a/")).toThrow();
  });
});
