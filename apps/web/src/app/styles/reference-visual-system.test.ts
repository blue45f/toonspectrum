import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const paletteCss = readFileSync(new URL("./design-themes.css", import.meta.url), "utf8");
const unifiedCss = readFileSync(new URL("./unified-theme-contract.css", import.meta.url), "utf8");
const surfaceCss = readFileSync(new URL("./reference-visual-system.css", import.meta.url), "utf8");

function palette(source: string, theme: string, prefix: string): Map<string, string> {
  const block = source.split(`:root[data-design-theme="${theme}"]`)[1]?.split("}")[0] ?? "";
  return new Map([...block.matchAll(new RegExp(`--${prefix}-([\\w-]+):\\s*([^;]+);`, "gu"))]
    .map(([, name, value]) => [name, value]));
}

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = rgb.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

function contrast(a: string, b: string): number {
  const pair = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (pair[0] + .05) / (pair[1] + .05);
}

describe("공통 일러스트 표면의 테마·접근성 계약", () => {
  it.each(["starlight", "dark", "light", "aurora", "blossom", "graphite", "midnight", "sepia", "contrast"])(
    "%s의 문서와 중첩 작업 셸이 동일한 의미 색을 사용한다",
    (theme) => {
      const document = palette(paletteCss, theme, "color");
      const workspace = palette(unifiedCss, theme, "unified");
      expect(workspace.size).toBeGreaterThan(10);
      for (const [name, value] of workspace) expect(document.get(name), `${theme}:${name}`).toBe(value);
    },
  );

  it("별빛의 작은 본문·보조 텍스트와 강조 버튼이 불투명 표면에서 AA 대비를 유지한다", () => {
    const colors = palette(paletteCss, "starlight", "color");
    for (const foreground of ["fg", "fg-2", "fg-3", "accent", "accent-2"]) {
      for (const background of ["canvas", "panel", "card", "raised"]) {
        expect(contrast(colors.get(foreground) ?? "", colors.get(background) ?? ""), `${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(colors.get("on-accent") ?? "", colors.get("accent") ?? "")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.get("line-strong") ?? "", colors.get("raised") ?? "")).toBeGreaterThanOrEqual(3);
  });

  it("일러스트는 명시된 chrome 경로에만 선언하고 미분류/편집기 표면에는 이미지를 전파하지 않는다", () => {
    const rules = [...surfaceCss.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
    const images = rules.filter(([, , declarations]) => declarations.includes("url("));
    expect(images.length).toBeGreaterThan(0);
    for (const [, selector, declarations] of images) {
      expect(selector).toContain(':root[data-design-theme="starlight"]');
      expect(selector).toContain('[data-site-art-placement="chrome"]');
      expect(selector).toContain("[data-site-artwork=");
      expect(declarations).toContain("--site-domain-art:");
      expect(declarations).not.toMatch(/(?:^|;)\s*background(?:-image)?:/u);
    }
    for (const [, selector, declarations] of rules) {
      expect(selector).not.toMatch(/(?:^|[\s,])canvas\b|\[data-studio-canvas/u);
      if (declarations.includes("var(--site-domain-art)")) {
        expect(selector).toContain('[data-site-art-placement="chrome"]');
        expect(selector).toContain("[data-page-container] > header");
        expect(selector).toContain(".workspace-task-purpose");
      }
      // 공통 시각 계층이 포탈, 가상 목록과 펜 입력의 배치/이벤트 권위를 바꾸지 않는다.
      expect(declarations).not.toMatch(/(?:^|;)\s*(?:z-index|position|overflow(?:-[xy])?|touch-action|pointer-events|contain):/u);
    }
  });
});
