/**
 * 액센트 계층의 "선택된 도구" 규칙이 실제로 매칭되는지 고정한다.
 *
 * 선택 상태는 아이콘 SVG가 아니라 조상 버튼이 `aria-current` / `aria-pressed` 로
 * 표시한다(CharacterShaperSlotRail). 그래서 CSS는 반드시 자손 선택자로 물어야 한다.
 * 아이콘 자신에 속성을 찾는 형태로 되돌아가면 규칙이 조용히 죽고, 선택된 도구와
 * 나머지 도구의 액센트가 같은 색으로 평평해진다. jsdom은 스타일시트를 적용하지
 * 않으므로 여기서는 CSS 계약 자체를 텍스트로 고정한다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "studio-3d-tool-icons.css");
const css = readFileSync(CSS_PATH, "utf8");

describe("3D 도구 아이콘 액센트 선택 규칙", () => {
  it("선택 상태를 조상 속성에서 찾는다", () => {
    expect(css).toMatch(/\[aria-current="true"\]\s*\.studio-3d-tool-icon/);
    expect(css).toMatch(/\[aria-pressed="true"\]\s*\.studio-3d-tool-icon/);
  });

  it("아이콘 자신에게 속성을 찾는 죽은 선택기를 두지 않는다", () => {
    // `.studio-3d-tool-icon[aria-pressed=...]` 형태는 DOM에 그런 속성이 없어 영원히 미매칭이다.
    expect(css).not.toMatch(/\.studio-3d-tool-icon\s*\[\s*aria-(current|pressed)\s*=/);
    expect(css).not.toMatch(/\.studio-3d-tool-icon\s*\[\s*data-active\s*=/);
  });

  it("선택된 도구와 나머지 도구의 액센트 토큰이 서로 다르다", () => {
    const selected = css.match(/\[aria-current="true"\][\s\S]*?;/);
    expect(selected).not.toBeNull();
    expect(selected?.[0]).toContain("--color-accent-2");
    // 기본(비선택) 계층은 accent-2가 아니라 accent를 쓴다.
    expect(css).toMatch(/--studio-3d-icon-accent:\s*var\(--color-accent,/);
  });

  it("강제 색상에서는 액센트 채움이 currentColor로 내려앉는다", () => {
    const forced = css.match(/@media \(forced-colors: active\)[^{]*\{[\s\S]*?\n\}/);
    expect(forced?.[0]).toContain("--studio-3d-icon-accent: currentColor");
  });
});
