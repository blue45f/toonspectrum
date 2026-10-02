import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * CSS는 전역이라, 서로 다른 기능이 같은 클래스 이름에 배치·표시 규칙을 걸면 나중에 로드된 쪽이 다른 기능의 화면을 깨뜨린다.
 * 통합 병합에서 실제로 두 번 생겼다.
 * - `.page-intro`: 앰비언트 진입 칩의 고정 카드·페이드아웃 규칙이 페이지 래퍼에 적용되어 페이지가 투명해지거나 사라졌다.
 * - `.comic-bubble`: 마케팅 인트로의 절대 위치 말풍선 규칙이 운세 만화 대화에 적용됐다.
 *
 * 기능 영역(domains/<이름>, shared/<묶음>)이 다른 두 CSS가 같은 최상위 클래스 선택자에 배치·표시 속성을 두면 실패한다.
 * 같은 영역 안의 단계적 덮어쓰기(workspace-visual-v3 등)와 app/styles의 전역 테마 계층은 의도된 구조라 대상에서 뺀다.
 */
const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LAYOUT_PROPERTY = /(?:^|[;\s])(?:position|display|animation(?:-name)?|opacity|transform|top|left|right|bottom|inset|width|height|min-height|overflow|z-index)\s*:/u;

/** 의도적으로 허용하는 영역 간 중복. 새로 추가하려면 두 화면이 한 세션에서 함께 로드되지 않음을 확인하고 사유를 적는다. */
const ALLOWED_CROSS_AREA_CLASSES: ReadonlySet<string> = new Set<string>([]);

function listCssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : listCssFiles(path);
    return path.endsWith(".css") && !path.endsWith(".module.css") ? [path] : [];
  });
}

function areaOf(relativePath: string): string {
  const [first, second] = relativePath.split("/");
  return first === "domains" || first === "shared" ? `${first}/${second ?? ""}` : (first ?? relativePath);
}

/** 중괄호 깊이 0의 규칙만 읽는다(@media 같은 at-rule 안쪽은 건너뛴다). */
function topLevelRules(css: string): Array<{ selector: string; body: string }> {
  const source = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const rules: Array<{ selector: string; body: string }> = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  let selector = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      if (depth === 0) {
        selector = source.slice(selectorStart, index).trim();
        bodyStart = index + 1;
      }
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        if (!selector.startsWith("@")) rules.push({ selector, body: source.slice(bodyStart, index) });
        selectorStart = index + 1;
      }
    }
  }
  return rules;
}

describe("CSS 클래스 이름 충돌 방지", () => {
  it("서로 다른 기능 영역이 같은 최상위 클래스에 배치·표시 규칙을 두지 않는다", () => {
    const areasByClass = new Map<string, Map<string, string>>();
    for (const file of listCssFiles(SRC_ROOT)) {
      const relativePath = relative(SRC_ROOT, file).replaceAll("\\", "/");
      const area = areaOf(relativePath);
      if (area === "app") continue;
      for (const { selector, body } of topLevelRules(readFileSync(file, "utf8"))) {
        if (!LAYOUT_PROPERTY.test(body)) continue;
        for (const part of selector.split(",")) {
          const match = /^\.([A-Za-z_][\w-]*)$/u.exec(part.trim());
          if (!match?.[1]) continue;
          const areas = areasByClass.get(match[1]) ?? new Map<string, string>();
          if (!areas.has(area)) areas.set(area, relativePath);
          areasByClass.set(match[1], areas);
        }
      }
    }
    const collisions = [...areasByClass]
      .filter(([className, areas]) => areas.size > 1 && !ALLOWED_CROSS_AREA_CLASSES.has(className))
      .map(([className, areas]) => `.${className} ← ${[...areas.values()].join(" · ")}`)
      .sort();
    expect(collisions).toEqual([]);
  });
});
