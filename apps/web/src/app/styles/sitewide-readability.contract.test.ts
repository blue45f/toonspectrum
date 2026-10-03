import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sitewide = readFileSync(new URL("./sitewide-visual-ux.css", import.meta.url), "utf8");
const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const journeyReadability = readFileSync(new URL("./product-journey-readability.css", import.meta.url), "utf8");

/**
 * 모바일·태블릿 가독성 계약(390·768·1024·1440). 한국어는 어절 단위로만 줄을 바꾸고, 제목은 줄 길이를
 * 고르게 맞추며, 휴대폰의 공개 화면은 12px 아래로 내려가는 글자를 두지 않는다.
 */
describe("공통 한국어·가독성 계약", () => {
  it("한국어는 어절 단위로만 줄을 바꾸고, 넘칠 때만 글자 중간에서 끊는다", () => {
    expect(sitewide).toMatch(/:root:lang\(ko\) body \{\s*word-break: keep-all;\s*overflow-wrap: break-word;\s*\}/u);
  });

  it("제목은 균형 있게, 본문은 마지막 줄에 한 단어만 남지 않게 한다 — Tailwind 유틸리티가 이기도록 base 레이어에서", () => {
    expect(sitewide).toMatch(/@layer base \{\s*:where\(h1, h2, h3, h4, h5, h6\) \{\s*text-wrap: balance;\s*\}\s*:where\(p, li, dd, figcaption, blockquote\) \{\s*text-wrap: pretty;/u);
  });

  it("<small>은 크기를 고정하지 않고 10px 바닥선만 지킨다", () => {
    expect(sitewide).toMatch(/@layer base \{\s*:root\[data-design-theme\] small:not\(\.sr-only\) \{\s*font-size: max\(0\.625rem, 0\.8333em\);/u);
    // 모든 <small>을 !important로 10px에 고정하던 이전 규칙이 되살아나지 않는다.
    expect(sitewide).not.toMatch(/small:not\(\.sr-only\),\s*:root\[data-design-theme\] :where\(/u);
  });

  it("휴대폰 공개 화면은 12px 아래 글자를 올리고, 작업 화면(편집기)은 건드리지 않는다", () => {
    expect(sitewide).toMatch(/@media \(max-width: 767px\) \{\s*#main-content\[data-public-experience\] :is\(\s*small,/u);
    for (const arbitrary of ['[class*="text-[0.6"]', '[class*="text-[10px]"]', '[class*="text-[11px]"]']) {
      expect(sitewide).toContain(arbitrary);
    }
    expect(sitewide).toMatch(/\):not\(\.sr-only\) \{\s*font-size: 0\.75rem !important;/u);
  });

  it("공용 영문 눈썹 라벨과 여정 보정 시트도 12px 바닥선을 지킨다", () => {
    expect(globals).toMatch(/@utility eyebrow \{[^}]*font-size: 0\.75rem;/u);
    // 마지막에 로드돼 '최종 권한'을 갖는 보정 시트가 11px로 되돌리지 않는다.
    expect(journeyReadability).not.toMatch(/font-size: 0\.6\d*rem;/u);
    expect(journeyReadability).toContain("font-size: 0.75rem;");
  });
});
