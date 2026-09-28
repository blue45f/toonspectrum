import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import config from "../vite.feedback-review.config";

const entries = ["e2e/feedback-community.html", "e2e/community-replies.html"];

describe("커뮤니티 검증의 독립 진입점 준비", () => {
  it("게시판과 댓글 진입점을 모두 사전 탐색하고 같은 경로를 빌드한다", () => {
    expect(config.optimizeDeps?.entries).toEqual(entries);
    expect(config.build?.rolldownOptions?.input).toEqual(entries);
  });
  it("첫 페이지 접근 전에 두 HTML의 모듈을 준비한다", () => {
    expect(config.server?.warmup?.clientFiles).toEqual(entries);
  });
  it("호출 위치와 무관한 저장소 root에 실제 검증 페이지가 존재한다", () => {
    expect(config.root && path.isAbsolute(config.root)).toBe(true);
    for (const entry of entries) expect(existsSync(path.resolve(config.root!, entry))).toBe(true);
    expect(config.resolve?.alias).toEqual({ "@": path.resolve(config.root!, "apps/web/src") });
  });
  it("다른 앱이나 worktree의 의존성 캐시를 공유하지 않는다", () => {
    expect(config.cacheDir).toBe(path.resolve(config.root!, ".qa/feedback-vite-cache"));
    expect(config.publicDir).toBe(false);
  });
});
