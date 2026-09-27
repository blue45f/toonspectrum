import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const STYLES = "apps/web/src/domains/marketing/creator-home.css";

/**
 * 이 셸은 라이트 세이지 표면, 다크 필름 섹션, 라이트 앱 창 모형이 한 화면에 섞여
 * 배경 밝기가 일정하지 않다. 측정하면 어떤 단일 색도 전 표면에서 3:1을 못 채운다.
 * 그래서 포커스 링은 안쪽 밝은 링(--ch-paper) + 바깥쪽 어두운 링(--ch-ink)의
 * 양면 구조여야 하고, 그러면 모든 표면에서 두 링 중 하나가 반드시 3:1을 넘는다.
 */
function expandHex(hex: string): string {
  const body = hex.replace("#", "");
  return body.length === 3 ? body.split("").map((char) => char + char).join("") : body;
}

function relativeLuminance(hex: string): number {
  const channels = expandHex(hex).match(/../gu)!.map((pair) => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [first, second] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function themeTokens(selector: string): Record<string, string> {
  const source = readFileSync(STYLES, "utf8");
  const start = source.indexOf(selector);
  const body = source.slice(start, source.indexOf("}", start) + 1);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--ch-[a-z-]+):(#[0-9a-fA-F]{3,8})/gu)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

const LIGHT = themeTokens(".creator-home{");
const DARK = themeTokens("html[data-theme=dark] .creator-home{");

const SURFACES = {
  "라이트 세이지 종료 섹션": "#ddeaaf",
  "라이트 세이지 기능 칸": "#e5ecca",
  "다크 필름 섹션": "#1e332a",
  "라이트 앱 창 모형": "#f9faf7",
} as const;

describe("크리에이터 홈 공통 셸 포커스 링", () => {
  it("포커스 링이 하드코딩 색이 아니라 토큰을 쓴다", () => {
    const rule = readFileSync(STYLES, "utf8").match(/focus-visible\{[^}]*\}/u)?.[0] ?? "";
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}/u);
    expect(rule).not.toContain("rgb(");
    expect(rule).toContain("var(--ch-ink)");
    expect(rule).toContain("var(--ch-paper)");
  });

  it("단일 색으로는 전 표면 대비를 확보할 수 없다 — 양면 링이 필요한 근거", () => {
    // 교체 전 초록 하드코딩이 다크 필름 표면에서 3:1을 깬 것이 이번 수정의 원인이다.
    expect(contrast("#57823e", SURFACES["다크 필름 섹션"]!)).toBeLessThan(3);
    // DESIGN.md가 지정한 accent 토큰도 이 셸에서는 부족하다. 그래서 단순 토큰 교체가 정답이 아니다.
    expect(contrast("#e8623f", SURFACES["라이트 세이지 종료 섹션"]!)).toBeLessThan(3);
  });

  it.each(Object.entries(SURFACES))("라이트 테마 · %s에서 양면 링 중 하나가 반드시 3:1을 넘는다", (_name, surface) => {
    const best = Math.max(contrast(LIGHT["--ch-ink"]!, surface), contrast(LIGHT["--ch-paper"]!, surface));
    expect(best).toBeGreaterThanOrEqual(3);
  });

  it("양면 링의 각 층이 자기 표면에서 실제로 3:1을 넘는다", () => {
    // 어두운 층은 밝은 표면에서, 밝은 층은 어두운 표면에서담당한다.
    expect(contrast(LIGHT["--ch-ink"]!, SURFACES["라이트 세이지 종료 섹션"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(LIGHT["--ch-ink"]!, SURFACES["라이트 앱 창 모형"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(LIGHT["--ch-paper"]!, SURFACES["다크 필름 섹션"]!)).toBeGreaterThanOrEqual(3);
  });

  it("다크 테마에서는 --ch-ink가 밝은 값으로 뒤집혀 그 자체로 대비를 확보한다", () => {
    // 다크 테마에서 --ch-paper는 어두운 표면 값이라 밝은 층 역할을 하지 않는다.
    // 대신 --ch-ink가 #f0f3e9로 뒤집혀 다크 표면 전부와 3:1을 넘는다.
    expect(relativeLuminance(LIGHT["--ch-ink"]!)).toBeLessThan(0.1);
    expect(relativeLuminance(DARK["--ch-ink"]!)).toBeGreaterThan(0.7);
    expect(contrast(DARK["--ch-ink"]!, DARK["--ch-bg"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(DARK["--ch-ink"]!, DARK["--ch-paper"]!)).toBeGreaterThanOrEqual(3);
  });
});
