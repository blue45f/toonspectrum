// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeCharacterShaperWebGl } from "./character-shaper/character-shaper-entry";
import { CharacterShaperLandingPage } from "./CharacterShaperLandingPage";

import { useI18n } from "@/shared/lib/i18n";

const SLOT_LABELS = [
  "얼굴형",
  "눈",
  "눈동자",
  "코",
  "입",
  "귀",
  "헤어",
  "체형",
  "상의",
  "하의",
  "신발",
  "액세서리",
  "표정",
  "포즈",
  "손 포즈",
];

function readRepoFile(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function readAppLocale(locale: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const namespace of readdirSync(path.resolve(process.cwd(), "apps/web/public/i18n/app"))) {
    const file = path.resolve(process.cwd(), "apps/web/public/i18n/app", namespace, `${locale}.json`);
    try { Object.assign(merged, JSON.parse(readFileSync(file, "utf8"))); } catch { /* namespace has no locale */ }
  }
  return merged;
}

vi.mock("./character-shaper/character-shaper-entry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./character-shaper/character-shaper-entry")>()),
  probeCharacterShaperWebGl: vi.fn(() => "supported"),
}));

// 3D 런타임 대신 같은 계약(열림·닫기)만 가진 편집기로 진입 흐름을 검증한다.
vi.mock("./character-shaper/CharacterShaperStandaloneEditor", () => ({
  CharacterShaperStandaloneEditor: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="캐릭터 셰이퍼 편집기">
      <button type="button" onClick={onClose}>편집기 닫기</button>
    </div>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(initialEntry = "/studio/assets/characters/new") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CharacterShaperLandingPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function guideTab(name: string) {
  return screen.getByRole("tab", { name });
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  document.head.innerHTML = `
    <meta name="description" content="기본 설명">
    <link rel="canonical" href="https://www.toonstudio.cloud/">
    <meta property="og:title" content="기본 제목">
    <meta property="og:url" content="https://www.toonstudio.cloud/">
  `;
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  window.location.hash = "";
});

describe("CharacterShaperLandingPage", () => {
  it("opens with the hero headline, one start button and a guide link", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "프리셋으로 시작하는 3D 웹툰 캐릭터" }),
    ).toBeTruthy();

    // /studio/character는 이 랜딩으로 되돌아오는 별칭이라 더는 링크하지 않는다.
    expect(screen.queryByRole("link", { name: "스튜디오에서 열기" })).toBeNull();
    // 여는 동작은 주소(?editor=open) 변경이므로 새 탭 열기·주소 복사가 되는 링크다.
    for (const name of ["샘플 캐릭터로 바로 시작", "지금 편집기 열기"]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe("/studio/assets/characters/new?editor=open");
    }

    expect(screen.getByRole("link", { name: "사용 가이드" }).getAttribute("href")).toBe("#how-to");
    expect(screen.getByText("캐릭터의 첫 장면을 준비하세요")).toBeTruthy();
    expect(screen.getByText("창작 영감을 위한 예시 일러스트")).toBeTruthy();
    expect(document.querySelectorAll(".studio-3d-illustration__portraits img")).toHaveLength(2);
  });

  it("serves the example portraits in responsive sizes so phones skip the full-size files", () => {
    renderPage();

    for (const image of document.querySelectorAll<HTMLImageElement>(".studio-3d-illustration__portraits img")) {
      expect(image.getAttribute("src")).toMatch(/\/brand\/illustrated-20260928\/character-(pink|blue)\.webp$/u);
      expect(image.getAttribute("srcset")).toMatch(/-320\.webp 320w, .*-640\.webp 640w, .*\.webp 720w$/u);
    }
  });

  it("summarizes the whole workflow in three steps before any long text", () => {
    renderPage();

    const steps = screen.getByRole("list", { name: "세 단계로 끝나는 작업 흐름" });
    const items = within(steps).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(["고르기", "포즈·그리기", "컷에 넣기"]);
    // 훑어보는 줄이므로 문장이 아니라 짧은 구절이어야 한다.
    for (const item of items) {
      expect(item.querySelectorAll("p")[1]?.textContent?.length ?? 99).toBeLessThanOrEqual(20);
    }
  });

  it("groups features, how-to, learning and shortcuts into one tab strip that opens on features", () => {
    const { container } = renderPage();

    const guide = container.querySelector<HTMLElement>("#how-to");
    expect(guide).not.toBeNull();
    expect(within(guide!).getByRole("heading", { level: 2, name: "기능과 사용법" })).toBeTruthy();

    const tabs = within(guide!).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["핵심 기능", "사용법", "학습", "조작법"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    for (const tab of tabs) {
      const panel = container.querySelector(`#${tab.getAttribute("aria-controls")}`);
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
      expect((panel as HTMLElement).hidden).toBe(tab !== tabs[0]);
    }
    // 소개 단계에서는 기능 카드만 보이고 다른 설명은 숨겨져 있다.
    expect(screen.getByRole("list", { name: "핵심 기능 네 가지" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "다섯 단계 사용법" })).toBeNull();
  });

  it("names every slot on the four feature cards", () => {
    renderPage();

    const features = screen.getByRole("list", { name: "핵심 기능 네 가지" });
    expect(within(features).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "15개 슬롯 프리셋",
      "모델 위에 직접 드로잉",
      "AI 보조",
      "제작 편의",
    ]);
    for (const slot of SLOT_LABELS) {
      expect(screen.getAllByText(slot, { exact: false }).length, slot).toBeGreaterThan(0);
    }
    // 긴 칩 목록은 접혀 있고 눌러서 연다.
    expect(features.querySelectorAll("details")).toHaveLength(4);
    expect([...features.querySelectorAll("details")].every((details) => !details.open)).toBe(true);
  });

  it("walks five numbered steps as a fold-out list with a tip each", () => {
    renderPage();

    fireEvent.click(guideTab("사용법"));
    const list = screen.getByRole("list", { name: "다섯 단계 사용법" });
    const steps = within(list).getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    expect(steps[0]?.textContent).toContain("모델 고르기");
    expect(steps[4]?.textContent).toContain("투명 PNG·PSD 출력");
    // 첫 단계만 열려 있고, 단계마다 설명과 팁을 함께 싣는다.
    const folds = [...list.querySelectorAll("details")];
    expect(folds.map((details) => details.open)).toEqual([true, false, false, false, false]);
    expect(within(list).getAllByText("팁")).toHaveLength(5);
  });

  it("moves between tabs with the arrow keys and keeps focus on the selected tab", () => {
    renderPage();

    const features = guideTab("핵심 기능");
    features.focus();
    fireEvent.keyDown(features, { key: "ArrowRight" });
    expect(guideTab("사용법").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(guideTab("사용법"));
    expect(guideTab("사용법").tabIndex).toBe(0);
    expect(guideTab("핵심 기능").tabIndex).toBe(-1);

    fireEvent.keyDown(guideTab("사용법"), { key: "End" });
    expect(guideTab("조작법").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(guideTab("조작법"), { key: "ArrowRight" });
    expect(guideTab("핵심 기능").getAttribute("aria-selected")).toBe("true");
  });

  it("opens the how-to tab when the guide anchor is requested", () => {
    window.location.hash = "#how-to";
    renderPage();
    expect(guideTab("사용법").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("list", { name: "다섯 단계 사용법" })).toBeTruthy();

    // 이미 열린 페이지에서 "사용 가이드"를 눌러도 같은 탭으로 옮겨 간다.
    cleanup();
    window.location.hash = "";
    renderPage();
    expect(guideTab("핵심 기능").getAttribute("aria-selected")).toBe("true");
    window.location.hash = "#how-to";
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(guideTab("사용법").getAttribute("aria-selected")).toBe("true");
  });

  it("lists the four touch gestures and the shortcuts as pairs without a wide table", () => {
    const { container } = renderPage();

    fireEvent.click(guideTab("조작법"));
    const shortcuts = container.querySelector<HTMLElement>("[data-character-shaper-shortcuts]");
    expect(shortcuts).not.toBeNull();
    expect(within(shortcuts!).queryByRole("table")).toBeNull();
    // 모바일 조작 가이드: 편집기 첫 사용 안내와 같은 네 가지 제스처.
    const gestures = within(shortcuts!.querySelector<HTMLElement>("[data-character-shaper-gestures]")!).getAllByRole("listitem");
    expect(gestures.map((item) => item.querySelector("span.block")?.textContent)).toEqual([
      "한 손가락으로 끌기",
      "두 손가락 벌리기·오므리기",
      "아래 카테고리 → 카드 누르기",
      "버튼 길게 누르기",
    ]);
    for (const key of ["1", "0", "⌘Z", "⇧⌘Z", "T", "B", "Esc"]) {
      expect(within(shortcuts!).getByText(key, { selector: "kbd" }), key).toBeTruthy();
    }
    for (const action of ["슬롯 이동", "되돌리기", "다시 실행", "턴테이블", "표면 드로잉", "닫기"]) {
      expect(within(shortcuts!).getByText(action), action).toBeTruthy();
    }
  });

  it("states the honest capability boundaries and answers four questions in fold-outs", () => {
    const { container } = renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "지원 범위와 한계" })).toBeTruthy();
    expect(screen.getAllByText(/VRM 0\.x/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/shape key/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MediaPipe/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SQLite\/OPFS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/권한에 동의한 뒤에만/).length).toBeGreaterThan(0);

    const faq = container.querySelector<HTMLElement>("[data-character-shaper-faq]");
    expect(faq?.querySelectorAll("details")).toHaveLength(4);
    const scope = container.querySelector<HTMLElement>("[data-character-shaper-scope]");
    expect(scope?.querySelectorAll("details")).toHaveLength(6);
    // 한계는 접어 둬도 제목에 드러난다.
    expect(scope?.textContent).toContain("얼굴 프리셋은 모델에 따라");
    expect(scope?.textContent).toContain("저장은 이 기기에");
    for (const item of container.querySelectorAll("details > summary")) {
      expect(item.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("mounts the 3D learning center with four tutorial tracks inside the learn tab", () => {
    const { container } = renderPage();

    fireEvent.click(guideTab("학습"));
    const learnCenter = container.querySelector("#learn-center");
    expect(learnCenter).not.toBeNull();
    expect(within(learnCenter as HTMLElement).getAllByRole("tab")).toHaveLength(4);
    // 기본 트랙(프리셋 활용)의 "바로 해보기"는 랜딩으로 되돌아오지 않고 편집기를 바로 연다.
    const cta = within(learnCenter as HTMLElement).getByRole("link", { name: "바로 해보기 — 캐릭터 작업실 열기" });
    expect(cta.getAttribute("href")).toBe("/studio/assets/characters/new?editor=open");
  });

  it("opens the editor in place from the hero and closes it back to the guide", async () => {
    renderPage();
    expect(screen.queryByRole("dialog", { name: "캐릭터 셰이퍼 편집기" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "샘플 캐릭터로 바로 시작" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio/assets/characters/new?editor=open");
    expect(await screen.findByRole("dialog", { name: "캐릭터 셰이퍼 편집기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "편집기 닫기" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio/assets/characters/new");
    expect(screen.queryByRole("dialog", { name: "캐릭터 셰이퍼 편집기" })).toBeNull();
  });

  it("honors a shared ?editor=open link and removes only the editor parameter on close", async () => {
    renderPage("/studio/assets/characters/new?editor=open&ref=seminar");
    expect(await screen.findByRole("dialog", { name: "캐릭터 셰이퍼 편집기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "편집기 닫기" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio/assets/characters/new?ref=seminar");
  });

  it("explains a missing WebGL context instead of opening a broken editor", () => {
    vi.mocked(probeCharacterShaperWebGl).mockReturnValueOnce("unsupported");
    renderPage("/studio/assets/characters/new?editor=open");

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("3D 편집기를 열 수 없습니다");
    expect(alert.textContent).toContain("WebGL");
    expect(screen.queryByRole("dialog", { name: "캐릭터 셰이퍼 편집기" })).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "안내 닫기" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio/assets/characters/new");
  });

  it("renders the English copy for every section when the UI language is English", () => {
    useI18n.setState({ lang: "en" });
    const { container } = renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "3D webtoon characters that start from presets" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "A three-step workflow" })).toBeTruthy();
    expect(within(container.querySelector<HTMLElement>("#how-to")!).getAllByRole("tab").map((tab) => tab.textContent))
      .toEqual(["Features", "How to", "Learn", "Controls"]);
    fireEvent.click(screen.getByRole("tab", { name: "Learn" }));
    const learn = container.querySelector<HTMLElement>("#learn-center")!;
    expect(within(learn).getByRole("link", { name: "Try it now — open Character workshop" })).toBeTruthy();
    expect(within(learn).getByText("Change an expression with one card")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Scope and limits" })).toBeTruthy();
  });

  it.each([
    ["en", "ToonStudio", "Character Shaper", "transparent PNGs and layered PSDs"],
    ["ko", "툰스튜디오", "캐릭터 셰이퍼", "투명 PNG와 레이어 PSD"],
  ] as const)("owns the %s title, description, canonical URL and JSON-LD for /shaper", (lang, brand, pageTitle, descriptionSnippet) => {
    useI18n.setState({ lang });
    renderPage();

    expect(document.title).toBe(`${pageTitle} · ${brand}`);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      descriptionSnippet,
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.toonstudio.cloud/studio/assets/characters/new",
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      `${pageTitle} · ${brand}`,
    );

    const jsonLd = document.head.querySelector('script[type="application/ld+json"]');
    expect(jsonLd).not.toBeNull();
    const parsed = JSON.parse(jsonLd!.textContent ?? "{}") as Record<string, unknown>;
    expect(parsed["@type"]).toBe("WebPage");
    expect(parsed.url).toBe("https://www.toonstudio.cloud/studio/assets/characters/new");
  });
});

describe("/shaper registration", () => {
  it("is wired into the router, titles, manifest, sitemap and centralized site navigation", () => {
    // AppRouter now renders one <Route> per entry of the grouped route table, so the /shaper
    // registration lives in the creator group rather than in the router JSX.
    expect(readRepoFile("apps/web/src/app/routes/groups/creator.routes.tsx")).toContain(
      '{ id: "creator-character-shaper", path: "/shaper", element: <Navigate to={studioRoutePath("asset-character-new")} replace /> }',
    );
    expect(readRepoFile("apps/web/src/app/routes/route-titles.ts")).toContain('"/shaper": "route.shaper"');
    expect(readRepoFile("apps/web/src/app/routes/route-manifest.ts")).toContain(
      '{ path: "/shaper", label: "route.shaper" }',
    );
    // Editors stay in site navigation, not in the indexable SEO sitemap.
    const staticRoutes = readRepoFile("scripts/build-static-catalog.ts")
      .match(/const STATIC_ROUTES = \[([\s\S]*?)\];/u)?.[1] ?? "";
    expect(staticRoutes).not.toBe("");
    expect(staticRoutes).not.toContain('"/shaper"');
    expect(staticRoutes).not.toContain('"/studio/assets/characters/new"');

    const navigation = readRepoFile("apps/web/src/shared/components/site-navigation.ts");
    expect(navigation).toContain('"/studio/assets/characters/new"');
    expect(readRepoFile("apps/web/src/app/routes/groups/creator.routes.tsx")).toContain('path: studioRoutePath("asset-character-new"), element: <CharacterShaperLandingPage />');
    expect(navigation).toContain("I.studioAssets");
    expect(readRepoFile("apps/web/src/domains/legal/site-directory-data.ts")).toContain('"/studio/assets/characters/new"');
    // Desktop footer and context-aware mobile menus share the centralized navigation authority.
    expect(readRepoFile("apps/web/src/shared/components/site-footer.tsx")).toContain("SITE_NAVIGATION_GROUPS.map");
    const mobileNavigation = readRepoFile("apps/web/src/shared/components/site-header-mobile-nav.tsx");
    expect(mobileNavigation).toContain("siteNavigationGroupsForPath(pathname)");
    expect(mobileNavigation).toContain("navigationGroups.map");
  });

  it("publishes the new app-shell keys in the built-in locales", () => {
    const ko = readAppLocale("ko");
    const en = readAppLocale("en");

    expect(ko["route.shaper"]).toBe("캐릭터 셰이퍼");
    expect(en["route.shaper"]).toBe("Character Shaper");
    for (const key of ["nav.shaper", "footer.link.shaper", "footer.section.create", "footer.link.studio"]) {
      expect(typeof ko[key], key).toBe("string");
      expect(typeof en[key], key).toBe("string");
    }
  });
});
