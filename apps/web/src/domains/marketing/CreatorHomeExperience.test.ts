import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPERIENCE_SOURCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const WRAPPER_STYLES = "apps/web/src/domains/marketing/studio-introduction.css";
const TOUR_STYLES = "apps/web/src/domains/marketing/studio-tour.css";
const INTENT_STYLES = "apps/web/src/domains/marketing/intent-start.css";
const MOCK_SOURCE = "apps/web/src/domains/marketing/public/intro-studio-window.tsx";
const MOCK_STYLES = "apps/web/src/domains/marketing/public/intro-studio-window.css";
const PRODUCT_IDENTITY_SOURCE = "apps/web/src/shared/lib/product-identity.ts";
const THEME_ART_SOURCE = "apps/web/src/domains/marketing/creator-theme-art.ts";
const THEME_SCENES_SOURCE = "apps/web/src/shared/lib/theme-scene-assets.ts";
const ROOT_HOME_SOURCE = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const APP_SHELL_SOURCE = "apps/web/src/app/AppShell.tsx";
const APP_ENTRY_SOURCE = "apps/web/src/app/main.tsx";
const INDEX_SOURCE = "apps/web/index.html";
const MANIFEST_SOURCE = "apps/web/public/manifest.webmanifest";
const RIBBON_MANIFEST_SOURCE = "apps/web/public/brand/spectrum-ribbon-v2/manifest.webmanifest";
const LLMS_SOURCE = "apps/web/public/llms.txt";
const BUSINESS_SOURCE = "packages/core/src/business.ts";
const FOOTER_KO_SOURCE = "apps/web/public/i18n/app/footer/ko.json";

describe("creator home experience contracts", () => {
  it("renders a separate public root without mounting the private workspace", () => {
    const source = readFileSync(ROOT_HOME_SOURCE, "utf8");
    expect(source).toContain("<CreatorHomeExperience />");
    expect(source).not.toContain("<StudioWorkspacePage");
    const routes = readFileSync("apps/web/src/app/routes/groups/marketing.routes.tsx", "utf8");
    expect(routes).toContain('path: "/about/studio"');
    expect(routes).toContain('default: module.CreatorHomeExperience');
    expect(source).not.toContain("CreatorHubEntry");
    expect(source).toContain('pathname: "/about/studio"');
  });

  it("keeps / as the reference dashboard and turns /about/studio into a tabbed, tappable studio tour", () => {
    const source = readFileSync(EXPERIENCE_SOURCE, "utf8");
    const identity = readFileSync(PRODUCT_IDENTITY_SOURCE, "utf8");
    // 같은 컴포넌트가 두 화면을 그린다: 경로가 /about/studio일 때만 둘러보기.
    expect(source).toContain('const introduction = pathname === "/about/studio"');
    expect(source).toContain("{!introduction && <ReferenceCreatorDashboard />}");
    expect(source).toContain('data-creator-home="production-first"');
    expect(source).toContain('data-creator-experience="all-in-one-studio-v3"');
    expect(source).toContain('data-product-direction="planning-to-publishing"');
    expect(source).toContain("data-theme-art={resolvedTheme}");
    expect(source).toContain("useTheme((state) => state.resolvedTheme)");
    // 둘러보기는 요소 규칙을 거는 옛 래퍼 클래스 없이 그린다(홈만 .creator-experience·.creator-flagship).
    expect(source).toContain('cx("creator-home", !introduction && "creator-experience creator-flagship")');
    // 세 탭: 화면 구성(주석 달린 예시 편집기) · 바로 시작(ProductIntentStart) · 재료·협업·도움. 예전 섹션 앵커는 탭으로 이어진다.
    expect(source).toContain("<IntroTabs");
    expect(source).toContain("anchors={STUDIO_TOUR_ANCHORS}");
    expect(source).toContain('id="creator-start"');
    expect(source).toContain('<ProductIntentStart headingId="creator-toolkit-title" />');
    expect(source).toContain("<StudioAnnotatedTour />");
    expect(source).toContain("<StudioSupportLinks />");
    expect(source).toContain('<AboutJourneyPager current="/about/studio" />');
    expect(source).toContain('import { useCreatorHomeSectionNavigation } from "./use-creator-home-section-navigation"');
    expect(source).toContain("useCreatorHomeSectionNavigation();");
    // 첫 화면: 한 문장 + 주요 행동 1개(+보조 1개).
    expect(source).toContain('<IntroPrimaryLink href="/studio/new">');
    expect(source).toContain('<IntroSecondaryLink href="/studio" icon={FolderKanban}>');
    expect(identity).toContain('href: "/story-lab"');
    expect(identity).toContain('href: "/studio/bg3d"');
    expect(identity).toContain('href: "/studio/assets"');
    expect(identity).toContain('href: "/studio/publish"');
    expect(identity).toContain("기획부터 연재까지");
    expect(identity).toContain("올인원 웹툰 제작 스튜디오");
    expect(`${source}\n${identity}`).not.toContain("그림은 익숙한 도구에서");
    expect(`${source}\n${identity}`).not.toContain("기존 드로잉 도구 그대로");
    expect(`${source}\n${identity}`).not.toContain("Keep your drawing tools");
  });

  it("keeps the first load lightweight: no player, no heavy launchpad, and only one eager artwork", () => {
    const source = readFileSync(EXPERIENCE_SOURCE, "utf8");
    for (const heavyweight of [
      "AtelierWorkbenchDemo",
      "CreatorBrandFilm",
      "CreatorLaunchpad",
      "CreatorReferenceSearch",
      "CreatorWorkspaceReadiness",
      "CreatorHomeCinematic",
    ]) {
      expect(source).not.toContain(heavyweight);
    }
    expect(source).not.toMatch(/from ["'](?:remotion|@remotion|.*StudioPage)/u);
    expect(source).not.toContain("<img");
    // 예시 편집기: 캔버스 한 장만 즉시, 나머지 썸네일은 지연 로드. 장식이라 보조기술에서는 숨긴다.
    const mock = readFileSync(MOCK_SOURCE, "utf8");
    expect(mock.match(/fetchPriority="high"/gu)).toHaveLength(1);
    expect(mock).toContain('loading="lazy"');
    expect(mock).toContain('<div className="isw-window" aria-hidden="true">');
    expect(existsSync("apps/web/public/brand/illustrated-20260928/canvas-noir-640.webp")).toBe(true);
  });

  it("keeps anti-clipping, touch, focus, reduced-motion and forced-color contracts in the styles", () => {
    const wrapper = readFileSync(WRAPPER_STYLES, "utf8");
    const tour = readFileSync(TOUR_STYLES, "utf8");
    const intent = readFileSync(INTENT_STYLES, "utf8");
    const mock = readFileSync(MOCK_STYLES, "utf8");
    // 홈 래퍼: 가로 넘침 방지·초점·감속.
    expect(wrapper).toContain('data-creator-experience="all-in-one-studio-v3"');
    expect(wrapper).toContain("overflow-x: clip");
    expect(wrapper).toContain("max-inline-size: 100%");
    expect(wrapper).toContain(":focus-visible");
    expect(wrapper).toContain("@media (prefers-reduced-motion: reduce)");
    // 둘러보기 층: 토큰·가로 넘침·패널 초점.
    expect(tour).toContain('.creator-home[data-home-view="introduction"]');
    expect(tour).toContain("overflow-x: clip");
    expect(tour).toContain(":focus-visible");
    expect(tour).toContain("env(safe-area-inset-bottom)");
    // 시작 선택기: 좁은 화면·감속.
    expect(intent).toContain("@media (max-width: 720px)");
    expect(intent).toContain("@media (prefers-reduced-motion: reduce)");
    // 예시 편집기: 컨테이너 반응·감속(완성된 장면으로 멈춤)·강제 색상.
    expect(mock).toContain("@container (max-width: 30rem)");
    expect(mock).toContain("@media (prefers-reduced-motion: reduce)");
    expect(mock).toContain("animation: none !important");
    expect(mock).toContain("@media (forced-colors: active)");
  });

  it("keeps public metadata, install surfaces and the legal service description aligned", () => {
    const index = readFileSync(INDEX_SOURCE, "utf8");
    const manifest = JSON.parse(readFileSync(MANIFEST_SOURCE, "utf8")) as { description: string };
    const ribbonManifest = JSON.parse(readFileSync(RIBBON_MANIFEST_SOURCE, "utf8")) as { description: string };
    const llms = readFileSync(LLMS_SOURCE, "utf8");
    const business = readFileSync(BUSINESS_SOURCE, "utf8");
    const footer = JSON.parse(readFileSync(FOOTER_KO_SOURCE, "utf8")) as Record<string, string>;
    expect(index).toContain("기획부터 연재까지 올인원 웹툰 제작");
    expect(index).toContain("대본·콘티·전문 2D 작화·3D 캐릭터와 배경");
    expect(manifest.description).toContain("기획부터 연재까지");
    expect(ribbonManifest.description).toBe(manifest.description);
    expect(llms).toContain("올인원 웹툰 제작 스튜디오");
    expect(business).toContain("웹툰 기획·제작·협업·연재");
    expect(footer["footer.tagline"]).toContain("기획부터 연재까지");
  });

  it("assigns every design theme a distinct local scene instead of recolouring one hero", () => {
    const source = readFileSync(THEME_ART_SOURCE, "utf8");
    const scenes = readFileSync(THEME_SCENES_SOURCE, "utf8");
    for (const theme of ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast"]) {
      expect(source).toContain(`${theme}: direction("${theme}"`);
    }
    const scenePaths = [...scenes.matchAll(/src: "(\/brand\/theme-scenes\/[^"]+\.svg)"/gu)].map((match) => match[1]);
    expect(scenePaths).toHaveLength(9);
    expect(new Set(scenePaths).size).toBe(9);
    for (const path of scenePaths) expect(existsSync(`apps/web/public${path}`)).toBe(true);
    expect(source).toContain("/brand/atelier-world.webp");
    expect(source).toContain("/brand/atelier-process.webp");
    expect(source).toContain("/brand/atelier-materials.webp");
    expect(`${source}\n${scenes}`).not.toMatch(/https?:\/\//u);
  });

  it("tracks allow-listed destinations and captures installability before render", () => {
    const shell = readFileSync(APP_SHELL_SOURCE, "utf8");
    const entry = readFileSync(APP_ENTRY_SOURCE, "utf8");
    expect(shell).toContain("<CreatorContinuityTracker />");
    expect(shell).toContain("recordCreatorDestination(pathname, search)");
    expect(shell).toContain("<PwaInstallNudge />");
    expect(entry).toContain("initializePwaInstallCapture();");
    expect(entry).toContain("initializeCreatorContinuity();");
    expect(entry.indexOf("initializePwaInstallCapture();")).toBeLessThan(entry.indexOf("createRoot("));
  });
});
