import { describe, expect, it } from "vitest";

import {
  creatorWorkMediaPath,
  decodeCreatorWorkDataImage,
  isCreatorWorkMediaDigest,
  projectCreatorWorkDetailMedia,
  projectCreatorWorkSummaryMedia,
} from "./creator-work-media";

const PNG_DATA = `data:image/png;base64,${Buffer.from("png-payload").toString("base64")}`;

describe("creator work media projection", () => {
  it("decodes supported inline images and derives a stable content digest", () => {
    const media = decodeCreatorWorkDataImage(PNG_DATA);

    expect(media).toMatchObject({
      byteLength: 11,
      mediaType: "image/png",
      sha256: "9365bafed84754819501f0e2834abb98d433323529bb39e405fb489dfe4e75cb",
    });
    expect(media?.bytes.toString()).toBe("png-payload");
  });

  it("rejects active or malformed data URLs instead of proxying them", () => {
    expect(decodeCreatorWorkDataImage("data:image/svg+xml;base64,PHN2Zy8+"))
      .toBeNull();
    expect(decodeCreatorWorkDataImage("data:image/png;base64,not-valid***"))
      .toBeNull();
    expect(decodeCreatorWorkDataImage(PNG_DATA, 3)).toBeNull();
  });

  it("projects only inline media and keeps remote URLs untouched", () => {
    const work = projectCreatorWorkDetailMedia({
      id: "work / 1",
      cover: PNG_DATA,
      pages: [PNG_DATA, "https://cdn.example.test/page.webp"],
      title: "work",
    });

    expect(work.cover).toBe(
      "/api/creator/works/work%20%2F%201/media/cover/9365bafed84754819501f0e2834abb98d433323529bb39e405fb489dfe4e75cb",
    );
    expect(work.pages).toEqual([
      "/api/creator/works/work%20%2F%201/media/pages/0/9365bafed84754819501f0e2834abb98d433323529bb39e405fb489dfe4e75cb",
      "https://cdn.example.test/page.webp",
    ]);
    expect(work.title).toBe("work");
  });

  it("removes unsupported inline data instead of returning it in public JSON", () => {
    const work = projectCreatorWorkDetailMedia({
      id: "work-1",
      cover: "data:image/svg+xml;base64,PHN2Zy8+",
      pages: ["data:text/html;base64,PGgxPmJhZDwvaDE+"],
    });
    expect(work).toEqual({ id: "work-1", cover: "", pages: [""] });
  });

  it("preserves referential identity when no inline media is present", () => {
    const work = { id: "work-1", cover: "https://cdn.example.test/cover.webp" };
    expect(projectCreatorWorkSummaryMedia(work)).toBe(work);
  });

  it("validates immutable endpoint digests", () => {
    const digest = "a".repeat(64);
    expect(isCreatorWorkMediaDigest(digest)).toBe(true);
    expect(isCreatorWorkMediaDigest(digest.toUpperCase())).toBe(false);
    expect(creatorWorkMediaPath("work", { kind: "page", pageIndex: 2 }, digest))
      .toBe(`/api/creator/works/work/media/pages/2/${digest}`);
  });
});
