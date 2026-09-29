import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./floating-menu.css", import.meta.url), "utf8");
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

  it("플로팅 컴포넌트에 하드코딩된 한국어 문자열이 남아 있지 않다", () => {
    // aria-label/타이틀은 i18n 키 경유 (localizeStudioText 폴백 포함)
    expect(modeSwitch).not.toMatch(/aria-label=\{?["'][가-힣]/);
    expect(modeSwitch).toContain("studio.modeSwitch.toStudio");
    expect(modeSwitch).toContain("studio.modeSwitch.toSimple");
  });
});
