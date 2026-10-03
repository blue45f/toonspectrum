// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 의미 위계와 시각 위계가 뒤집혀 있던 히어로(h1이 15px 소제목, 실제 대제목은 <p>)의
// 재발 방지 계약. 대제목이 h1이어야 스크린리더·문서 개요가 시각 구조와 일치한다.
const page = readFileSync(new URL("../FeedbackPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./feedback/feedback-community.css", import.meta.url), "utf8");

describe("FeedbackPage 히어로 위계 계약", () => {
  it("대제목이 h1이고 소제목은 h1이 아니다", () => {
    expect(page).toContain('<h1 className="fb-hero-title">');
    expect(page).not.toContain('<p className="fb-hero-title">');
    expect(page).toContain('<p className="fb-hero-kicker">');
    expect(page.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("소제목 스타일은 kicker 규칙이 담당하고 낡은 h1 규칙이 없다", () => {
    expect(css).toContain(".fb-hero-kicker {");
    expect(css).not.toContain(".fb-hero h1 {");
  });

  it("목록 스켈레톤이 전역 skeleton(shimmer·reduced-motion)을 병기한다", () => {
    expect(page).toContain('className="fb-skeleton skeleton"');
  });
});
