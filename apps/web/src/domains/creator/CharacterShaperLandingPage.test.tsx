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
});

describe("CharacterShaperLandingPage", () => {
  it("opens with the hero headline and both calls to action", () => {
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

  it("names every slot, walks five numbered steps, and lists the shortcuts", () => {
    const { container } = renderPage();

    for (const slot of SLOT_LABELS) {
      expect(screen.getAllByText(slot, { exact: false }).length, slot).toBeGreaterThan(0);
    }

    const howTo = container.querySelector<HTMLElement>("#how-to");
    expect(howTo).not.toBeNull();
    expect(within(howTo!).getByRole("heading", { level: 2 }).textContent).toBe("다섯 단계로 첫 캐릭터 만들기");
    const steps = howTo!.querySelectorAll("ol > li");
    expect(steps.length).toBe(5);
    expect(steps[0]?.textContent).toContain("모델 고르기");
    expect(steps[4]?.textContent).toContain("투명 PNG·PSD 출력");
    // 각 단계는 설명과 팁을 함께 싣는다.
    expect(howTo!.textContent?.match(/팁/g)?.length).toBe(5);

    const table = screen.getByRole("table");
    for (const key of ["1", "0", "⌘Z", "⇧⌘Z", "T", "B", "Esc"]) {
      expect(within(table).getByText(key, { selector: "kbd" }), key).toBeTruthy();
    }
    for (const action of ["슬롯 이동", "되돌리기", "다시 실행", "턴테이블", "표면 드로잉", "닫기"]) {
      expect(within(table).getByText(action, { selector: "td" }), action).toBeTruthy();
    }
  });

  it("states the honest capability boundaries and answers four questions", () => {
    const { container } = renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "지원 범위와 한계" })).toBeTruthy();
    expect(screen.getAllByText(/VRM 0\.x/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/shape key/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MediaPipe/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SQLite\/OPFS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/권한에 동의한 뒤에만/).length).toBeGreaterThan(0);

    const faqItems = container.querySelectorAll("details");
    expect(faqItems.length).toBe(4);
    for (const item of faqItems) {
      expect(item.querySelector("summary")?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("mounts the 3D learning center with four tutorial tabs after the how-to guide", () => {
    const { container } = renderPage();

    const learnCenter = container.querySelector("#learn-center");
    expect(learnCenter).not.toBeNull();
    expect(within(learnCenter as HTMLElement).getByRole("heading", { level: 2, name: "3D 학습 센터" })).toBeTruthy();
    expect(within(learnCenter as HTMLElement).getAllByRole("tab")).toHaveLength(4);
    // 기본 탭(프리셋 활용)의 "바로 해보기"는 랜딩으로 되돌아오지 않고 편집기를 바로 연다.
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
