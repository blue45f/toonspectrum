import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `.page-intro`는 페이지 본문을 감싸는 래퍼(shared/components/page-intro*)가 쓰는 클래스다.
 * 앰비언트 진입 칩이 같은 이름으로 `position: fixed`·페이드아웃·움직임 줄이기 `display: none`을 걸면
 * 그 규칙이 래퍼에도 적용되어 로그인·설정·마켓·커뮤니티·배우기 화면이 1초 뒤 투명해지거나(모션 줄이기에서는 통째로) 사라진다.
 * 칩은 `route-intro-chip` 계열만 쓰고, 래퍼 클래스 자체에는 배치·표시를 바꾸는 규칙을 두지 않는다.
 */
const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : listFiles(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

/** 선택자가 정확히 `.page-intro`(래퍼 자체)인 규칙의 본문을 모은다. */
function bareWrapperRules(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const rules: string[] = [];
  for (const match of withoutComments.matchAll(/(^|[}\s])((?:[^{}]*,)?\s*\.page-intro)\s*(?:,[^{}]*)?\{([^{}]*)\}/gu)) {
    const selector = match[2]?.trim() ?? "";
    if (/^\.page-intro$/u.test(selector) || /,\s*\.page-intro$/u.test(selector)) rules.push(match[3] ?? "");
  }
  return rules;
}

describe("페이지 진입 연출 클래스 충돌 방지", () => {
  it("앰비언트 칩은 .page-intro 클래스를 쓰지 않는다", () => {
    const motifSource = readFileSync(join(SRC_ROOT, "shared/ambient/PageIntroMotif.tsx"), "utf8");
    expect(motifSource).toContain("route-intro-chip");
    expect(motifSource).not.toMatch(/["'`]page-intro(?:--|__)?/u);

    const ambientCss = readFileSync(join(SRC_ROOT, "shared/ambient/ambient-effects.css"), "utf8");
    expect(ambientCss).toContain(".route-intro-chip");
    expect(ambientCss).not.toMatch(/\.page-intro\b/u);
  });

  it("래퍼 .page-intro 규칙은 어느 CSS에서도 배치·표시를 바꾸지 않는다", () => {
    const offenders: string[] = [];
    for (const file of listFiles(SRC_ROOT, ".css")) {
      for (const body of bareWrapperRules(readFileSync(file, "utf8"))) {
        if (/(?:^|[;\s])(?:position\s*:\s*(?:fixed|absolute|sticky)|display\s*:\s*none|animation(?:-name)?\s*:|opacity\s*:)/u.test(body)) {
          offenders.push(relative(SRC_ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
