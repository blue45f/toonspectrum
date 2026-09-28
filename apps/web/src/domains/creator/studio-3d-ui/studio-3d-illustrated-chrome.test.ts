import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./studio-3d-illustrated-chrome.css");

describe("캐릭터·3D 외곽 시안 적용 경계", () => {
  it("경로별 진입 표면에서 스타일을 명시적으로 불러온다", () => {
    for (const path of [
      "../CharacterShaperLandingPage.tsx",
      "../character-shaper/StudioCharacterShaperDialog.tsx",
      "../bg3d/StudioBg3dEditorModal.tsx",
      "../bg3d/StudioBg3dSceneAssistantWorkspace.tsx",
      "../character-conversion/StudioCharacterConversionPage.tsx",
      "../onboarding/StudioCharacterOnboardingPage.tsx",
    ]) expect(read(path)).toMatch(/import "\.\.?\/studio-3d-ui\/studio-3d-illustrated-chrome\.css"/);
  });

  it("근검정 팔레트를 starlight로 한정하고 테마 의미 토큰과 시스템 색상을 남긴다", () => {
    const nearBlackRule = css.slice(css.indexOf(':root[data-design-theme="starlight"]'), css.indexOf(':is([data-character-shaper-surface]'));
    expect(nearBlackRule).toContain("--illustrated-3d-panel: #0b1020");
    expect(css).toContain("--illustrated-3d-panel: var(--color-panel)");
    expect(css).toContain(':root[data-design-theme="contrast"]');
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("--illustrated-3d-panel: Canvas");
    expect(css).not.toMatch(/--color-[\w-]+\s*:/);
  });

  it("뷰포트·렌더러를 선택하지 않고 시트 크기와 z-index를 덮어쓰지 않는다", () => {
    expect(css).not.toMatch(/(?:^|[\n,])\s*[^{}\n]*(?:canvas|data-character-shaper-viewport|data-bg3d-viewport|scene-assistant__viewport)[^{}\n]*\{/);
    expect(css).not.toMatch(/\bz-index\s*:|pointer-events\s*:|grid-template-rows\s*:|position\s*:\s*(?:fixed|absolute)/);
    expect(css).not.toContain("!important");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
