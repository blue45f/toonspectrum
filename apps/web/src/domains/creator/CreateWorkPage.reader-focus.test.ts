import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CreateWorkPage.tsx", import.meta.url), "utf8");

describe("CreateWorkPage reader focus contract", () => {
  it("uses the server public projection and preserves preview mode across canonical redirects", () => {
    expect(source).toContain("getWork(id, controller.signal, { publicPreview })");
    expect(source).toContain("const query = previewSearch ? `?${previewSearch}` : \"\";");
    expect(source).toContain("anonymous={publicPreview}");
    expect(source).toContain('data-public-reader-preview={publicPreview ? "anonymous" : "reader"}');
  });

  it("renders the work before collapsed owner tooling and suppresses editing actions in reader view", () => {
    const reader = source.indexOf("<PublishedWorkReader");
    const ownerTools = source.lastIndexOf("창작자 관리 도구");
    expect(reader).toBeGreaterThan(0);
    expect(ownerTools).toBeGreaterThan(reader);
    expect(source).toContain("const ownerControlsVisible = Boolean(work?.isOwner && !readerView);");
    expect(source).toContain("publicationPolicy.remixAllowed && !readerView");
    expect(source).toContain("isOwner={readerView ? false : work.isOwner}");
  });

  it("offers a true anonymous reader preview to the owner without publishing management controls", () => {
    expect(source).toContain("buildCreatorPublicReaderPreviewHref(work.id)");
    expect(source).toContain("실제 비로그인 독자 응답으로 확인 중");
    expect(source).toContain("현재 로그인 세션을 서버 조회에서 제외");
    expect(source).toContain("!readerView ? <CampusObjectSource");
  });
});
