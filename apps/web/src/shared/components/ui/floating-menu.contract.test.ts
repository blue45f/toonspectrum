import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./floating-menu.css", import.meta.url), "utf8");
const sitewideCss = readFileSync(new URL("../../../app/styles/sitewide-visual-ux.css", import.meta.url), "utf8");
const backToTop = readFileSync(new URL("../back-to-top.tsx", import.meta.url), "utf8");
const floatingControls = readFileSync(new URL("../FloatingControls.tsx", import.meta.url), "utf8");
const modeSwitch = readFileSync(
  new URL("../../../domains/creator/StudioModeSwitchFloatingButton.tsx", import.meta.url),
  "utf8",
);

/**
 * 공용 플로팅 메뉴 디자인 시스템 계약.
 * z-index 체계: z-40(컨트롤 클러스터·스티키바) < z-50(모바일 탭바) < z-70(BackToTop·PWA넛지) < z-80+(모달)
 */
describe("floating menu design contracts", () => {
  it("공용 플로팅 표면·인터랙션·활성 클래스를 제공한다", () => {
    expect(css).toContain(".ts-float");
    expect(css).toContain(".ts-float-interactive");
    expect(css).toContain(".ts-float-active");
    expect(css).toContain(".ts-float-enter");
  });

  it("마켓 스티키 바가 떠 있을 때 데스크톱 플로팅 클러스터를 위로 들어 올린다", () => {
    expect(css).toContain('[data-market-sticky-bar="true"]');
    expect(css).toContain('[data-floating-controls="true"]');
    expect(css).toContain('[data-back-to-top="true"]');
    expect(css).toContain("@media (min-width: 768px)");
  });

  it("reduced-motion·고대비·강제색상을 지원한다", () => {
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("prefers-contrast");
    expect(css).toContain("forced-colors");
  });

  it("전역 플로팅 컴포넌트들이 공용 CSS를 로드한다", () => {
    expect(backToTop).toContain('import "./ui/floating-menu.css"');
    expect(floatingControls).toContain('import "./ui/floating-menu.css"');
    expect(modeSwitch).toContain('import "@/shared/components/ui/floating-menu.css"');
  });

  it("휴대폰 플로팅 요소를 하단 탭 위 한 기준선에 모은다", () => {
    // 하단 탭이 있는 화면은 탭 위 5.75rem, 없는 화면(집중 작업 등)은 1rem이 기준선이다.
    expect(sitewideCss).toContain("--site-float-base: calc(1rem + env(safe-area-inset-bottom));");
    expect(sitewideCss).toContain(":root:has(nav[data-site-product]) { --site-float-base: calc(5.75rem + env(safe-area-inset-bottom)); }");
    expect(sitewideCss).toContain(":root:has(.workspace-nav) { --site-float-base: calc(5.75rem + env(safe-area-inset-bottom)); }");
    // 오른쪽 조작 열: ⚙ → 음성 안내 → 맨 위로 순으로 한 칸(3.5rem)씩 쌓인다.
    expect(sitewideCss).toContain("--site-float-voice-bottom: calc(var(--site-float-base) + var(--site-float-controls-slot));");
    expect(sitewideCss).toContain("--site-float-top-bottom: calc(var(--site-float-voice-bottom) + var(--site-float-voice-slot));");
    // ⚙ 묶음이 있으면 OST 알약을 따로 띄우지 않고, OST 버튼은 플레이어가 있을 때만 보인다.
    expect(sitewideCss).toContain(':root:has([data-floating-controls="true"]) [data-site-ost-pill]');
    expect(css).toContain(':root:not(:has([data-site-ost="mounted"])) [data-floating-ost-toggle]');
  });

  it("키보드 초점이 하단 탭과 떠 있는 열 밑에 가려지지 않도록 뷰포트에 스크롤 여백을 둔다", () => {
    expect(sitewideCss).toMatch(/html:has\(nav\[data-site-product\]\) \{\s*scroll-padding-bottom: calc\(9rem \+ env\(safe-area-inset-bottom\)\);/u);
  });

  it("조작 열을 비워 두지 않고 안내 카드가 그 폭만큼 비켜 서며 칩 위로 올라간다", () => {
    // 조작 열(⚙·음성 안내·맨 위로)이 있는 화면은 알림 열의 오른쪽 끝을 열 폭만큼 당긴다.
    expect(sitewideCss).toContain("--site-float-column: 4.75rem;");
    expect(sitewideCss).toContain("right: max(0.75rem, var(--site-float-column));");
    expect(sitewideCss).toContain("bottom: max(var(--site-float-base), var(--service-status-overlay-clearance, 0px));");
    // 홍보 중이라고 ⚙·맨 위로·음성 안내를 숨기지 않는다(예전 해결책 폐기).
    expect(sitewideCss).not.toMatch(/:root:has\([^)]*data-beta-open-prompt[^)]*\)[^{]*\{[^}]*visibility:\s*hidden/u);
    // 넓은 화면에서는 오른쪽 아래 ⚙ 행·맨 위로를 가리지 않도록 알림 열(왼쪽)의 맨 위에 둔다.
    expect(sitewideCss).toContain("bottom: calc(max(1rem, var(--service-status-overlay-clearance, 0px)) + 4rem);");
    // 스튜디오 베타 확인은 맨 아래 줄을 쓰므로 좁은 태블릿에서 ⚙ 행과 폭이 닿지 않게 줄인다.
    expect(sitewideCss).toContain("width: min(31rem, calc(100vw - 19rem));");
    // 가입 버튼 줄을 가리던 6.25rem 높이 제한·내부 스크롤을 다시 쓰지 않는다.
    const betaRules = [...sitewideCss.matchAll(/\[data-beta-open-prompt="engaged"\][^{]*\{([^}]*)\}/gu)]
      .map((match) => match[1]);
    expect(betaRules.length).toBeGreaterThan(3);
    for (const declarations of betaRules) {
      expect(declarations).not.toMatch(/max-height|overflow-y/u);
    }
    expect(sitewideCss).toContain('[data-beta-open-prompt="engaged"] [data-beta-open-footer] > :nth-child(2)');
  });

  it("⚙ 묶음·OST 패널·음성 안내 자막이 열려 있는 동안 서로 겹칠 칸만 잠시 비운다", () => {
    expect(sitewideCss).toMatch(
      /:root:has\(\[data-floating-controls-open="true"\], \[data-site-ost-expanded="true"\]\) :is\(\[data-back-to-top="true"\], \[data-voice-guide-placement="fixed"\]\) \{\s*visibility: hidden;/u,
    );
    expect(sitewideCss).toMatch(/:root:has\(\[data-voice-guide-speaking="true"\]\) \[data-back-to-top="true"\] \{\s*visibility: hidden;/u);
    expect(sitewideCss).toMatch(/:root:has\(\[data-site-ost-expanded="true"\]\) \[data-beta-open-prompt="engaged"\] \{\s*visibility: hidden;/u);
  });

  it("펼친 설정 묶음과 그 안의 언어 선택 창은 같은 하단 영역의 안내 카드 위에 둔다", () => {
    expect(css).toContain('[data-floating-controls="true"]:is([data-floating-controls-open="true"], :has([role="dialog"]))');
    // 180은 홍보 카드(z-175) 위, 전역 모달(z-181+) 아래다.
    expect(css).toMatch(/:has\(\[role="dialog"\]\)\) \{\s*z-index: 180;/u);
  });

  it("칩 위로 쌓이는 요소는 bottom 이동이 부드럽고, 동작 줄이기에서는 즉시 움직인다", () => {
    expect(sitewideCss).toMatch(/:is\(\[data-site-ost="mounted"\], \[data-beta-open-prompt="engaged"\], \[data-studio-beta-notice-host="true"\]\) \{\s*transition: bottom 180ms ease;/u);
    expect(sitewideCss).toMatch(/prefers-reduced-motion: reduce\) \{\s*:is\(\[data-site-ost="mounted"\][^}]*\{\s*transition: none;/u);
  });

  it("플로팅 컴포넌트에 하드코딩된 한국어 문자열이 남아 있지 않다", () => {
    // aria-label/타이틀은 i18n 키 경유 (localizeStudioText 폴백 포함)
    expect(modeSwitch).not.toMatch(/aria-label=\{?["'][가-힣]/);
    expect(modeSwitch).toContain("studio.modeSwitch.toStudio");
    expect(modeSwitch).toContain("studio.modeSwitch.toSimple");
  });
});
