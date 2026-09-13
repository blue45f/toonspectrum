import { describe, expect, it } from "vitest";

import { spatialBookVtt } from "./spatial-book-captions";

import type { SpatialBook } from "./spatial-book";

function book(captions: string[]): SpatialBook {
  return { format: "toonstudio-spatial-book", version: 1, id: "sample", title: "test",
    panels: captions.map((caption, i) => ({ id: String(i), title: "cut", alt: "", src: "", caption, seconds: 6, layers: [] })) };
}

describe("authored panel dialogue captions", () => {
  it("preserves timing across silent cuts", () => {
    expect(spatialBookVtt(book(["", "안녕하세요"]))).toContain("00:00:06.000 --> 00:00:12.000\n안녕하세요");
  });
  it("escapes cue markup and prevents blank lines from injecting cues", () => {
    const output = spatialBookVtt(book(["<b>안녕</b>\n\nA & B --> C"]));
    expect(output).toContain("&lt;b&gt;안녕&lt;/b&gt;\nA &amp; B --&gt; C");
    expect(output).not.toContain("<b>");
  });
  it("produces a valid empty caption header for music without dialogue", () => {
    expect(spatialBookVtt(book([""]))).toBe("WEBVTT\n");
  });
});
