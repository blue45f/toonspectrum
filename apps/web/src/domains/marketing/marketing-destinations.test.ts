import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { aboutJourneyNeighbors, serviceFlowNext } from "./public/intro-journey";
import { ABOUT_JOURNEY, HOME_LEARN_MORE, SERVICE_FLOW } from "./reference-home-content";

/**
 * 홈·서비스 소개·제품 투어·브랜드 필름의 모든 내부 링크가 실제 라우트로 이어지는지 확인한다.
 * 앱 라우트 모듈을 직접 가져오면 도메인 경계를 넘으므로, 라우트 정의 원문을 읽어 경로 목록을 만든다.
 */
const ROUTE_GROUP_DIR = "apps/web/src/app/routes/groups";
const STUDIO_REGISTRY = "apps/web/src/domains/creator/studio-route-registry.ts";
const STUDIO_WORKSPACE_ROUTE = "apps/web/src/domains/creator/studio-workspace-route.ts";
const STUDIO_ROUTE_MANIFEST = "apps/web/src/domains/creator/studio-router/studio-route-manifest.ts";
const MARKETING_DIR = "apps/web/src/domains/marketing";
// /about/studio는 1차 정리 때 StudioIntroduction.tsx를 CreatorHomeExperience.tsx로 합쳤다(같은 컴포넌트가 / 와 /about/studio를 그린다).
const STUDIO_INTRODUCTION = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const PRODUCT_TOUR_PAGE = "apps/web/src/domains/marketing/ProductTourPage.tsx";
const HOME_DASHBOARD = "apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx";
const ABOUT_PAGES = [
  "apps/web/src/domains/legal/AboutPage.tsx",
  "apps/web/src/domains/legal/WebtoonWorkflowPage.tsx",
  "apps/web/src/domains/legal/ProductPrinciplesPage.tsx",
] as const;
const STATIC_FILE = /\.(?:webp|jpe?g|png|gif|avif|mp4|webm|vtt|svg|json|css|js|txt|xml|glb|vrm|woff2?)$/u;
const ASSET_PREFIX = /^\/(?:brand|assets|fonts|i18n|api|images|media|reference|icons)\//u;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name) ? [path] : [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function routeMatcher(pattern: string): RegExp {
  const splat = pattern.endsWith("/*");
  const base = splat ? pattern.slice(0, -2) : pattern;
  const body = base.split("/").map((part) => (part.startsWith(":") ? "[^/]+" : escapeRegExp(part))).join("/");
  return new RegExp(`^${body}${splat ? "(?:/.*)?" : ""}/?$`, "u");
}

function declaredRoutePatterns(): Set<string> {
  const registry = read(STUDIO_REGISTRY);
  const studioPatterns = new Map([...registry.matchAll(/route\("([^"]+)",\s*"([^"]+)"/gu)].map((match) => [match[1], match[2]]));
  const patterns = new Set<string>();
  for (const name of readdirSync(ROUTE_GROUP_DIR)) {
    if (!/\.tsx?$/u.test(name) || /\.test\.tsx?$/u.test(name)) continue;
    const source = read(join(ROUTE_GROUP_DIR, name));
    for (const match of source.matchAll(/path:\s*"([^"]+)"/gu)) patterns.add(match[1] ?? "");
    for (const match of source.matchAll(/route\("[^"]+",\s*"(\/[^"]*)"/gu)) patterns.add(match[1] ?? "");
    for (const match of source.matchAll(/path:\s*studioRoutePath\("([^"]+)"\)/gu)) {
      const pattern = studioPatterns.get(match[1] ?? "");
      if (pattern) patterns.add(pattern);
    }
  }
  // /studio/* 아래 편집기 화면은 스튜디오 라우터가 작업 공간 이름으로 해석한다.
  const surfaces = read(STUDIO_WORKSPACE_ROUTE).match(/STUDIO_2D_WORKSPACE_SURFACES = \[([\s\S]*?)\]/u)?.[1] ?? "";
  for (const match of surfaces.matchAll(/"([a-z0-9-]+)"/gu)) patterns.add(`/studio/${match[1]}`);
  if (read(STUDIO_ROUTE_MANIFEST).includes('"/studio/publish"')) patterns.add("/studio/publish");
  // 모든 경로를 받아 주는 catch-all은 “존재하는 화면”의 근거가 될 수 없다.
  patterns.delete("*");
  patterns.delete("/studio/*");
  return patterns;
}

interface Destination {
  readonly file: string;
  readonly href: string;
}

function internalDestinations(): Destination[] {
  const files = [...sourceFiles(MARKETING_DIR), ...ABOUT_PAGES];
  return files.flatMap((file) =>
    [...read(file).matchAll(/["'`](\/[a-z][^"'`$\s]*)["'`]/gu)]
      .map((match) => match[1] ?? "")
      .filter((href) => !ASSET_PREFIX.test(href))
      .map((href) => ({ file, href })),
  );
}

function pathnameOf(href: string): string {
  const pathname = href.split(/[?#]/u, 1)[0] ?? "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
}

describe("마케팅·소개 페이지의 내부 목적지", () => {
  const patterns = declaredRoutePatterns();
  const matchers = [...patterns].map(routeMatcher);
  const destinations = internalDestinations();

  it("라우트 정의 원문에서 핵심 공개 경로를 읽어 온다", () => {
    for (const route of ["/", "/about", "/about/studio", "/product-tour", "/brand-film", "/pricing", "/membership", "/events", "/studio/new", "/studio/space", "/studio/comic", "/studio/bg3d", "/production"]) {
      expect(matchers.some((matcher) => matcher.test(route)), route).toBe(true);
    }
    expect(destinations.length).toBeGreaterThan(100);
  });

  it("모든 내부 링크가 실제 화면으로 이어진다(404 금지)", () => {
    const broken = destinations
      .filter(({ href }) => !STATIC_FILE.test(pathnameOf(href)) && !pathnameOf(href).endsWith(".html"))
      .filter(({ href }) => !matchers.some((matcher) => matcher.test(pathnameOf(href))))
      .map(({ file, href }) => `${file}: ${href}`);
    expect(broken).toEqual([]);
  });

  it("정적 설치 안내 페이지 링크는 public 파일로 존재한다", () => {
    const staticPages = destinations.filter(({ href }) => pathnameOf(href).endsWith(".html"));
    for (const { file, href } of staticPages) {
      expect(existsSync(join("apps/web/public", pathnameOf(href))), `${file}: ${href}`).toBe(true);
    }
  });
});

describe("서비스 소개 서사와 페이지 간 연결", () => {
  const about = read(ABOUT_PAGES[0]);

  it("/about은 핵심 기능 → 작동 방식 → 역할별 시작점 → 영상·더 알아보기 → 시작하기 순서로 짧게 읽힌다", () => {
    // 2차 단순화: '왜 ToonStudio'는 첫 화면 가치 칩으로, 영상·안내 카드·약속 섹션은 한 줄 레일로 합쳤다.
    const order = [
      "about-features-title",
      "about-how-title",
      "about-audience-title",
      "about-explore-title",
      "about-start-title",
    ].map((id) => about.indexOf(`id="${id}"`));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(about.match(/<section\b/gu)).toHaveLength(order.length);
    // 첫 화면은 한 문장 + 주요 행동 1개(+보조 1개)만: 히어로 → 소개 메뉴 → 본문 섹션 순서.
    expect(about.indexOf("<HeroBlock")).toBeLessThan(order[0] ?? -1);
    expect(about.match(/<IntroActions\b/gu)).toHaveLength(1);
  });

  it("핵심 기능 다섯 가지(드로잉·3D·협업·가상 스튜디오·AI)를 실제 작업공간 링크와 함께 소개한다", () => {
    for (const id of ["drawing", "three-d", "collaboration", "virtual-studio", "ai"]) {
      expect(about).toContain(`id: "${id}"`);
    }
    for (const href of ["/studio/canvas", "/studio/assets/characters/new", "/studio/bg3d", "/production", "/studio/space", "/studio/ai-lab"]) {
      expect(about).toContain(`"${href}"`);
    }
  });

  it("소개 페이지들이 정본 순서(소개 → 작업실 → 제작 과정 → 기술 → 원칙)의 이전·다음 링크로 이어진다", () => {
    expect(ABOUT_JOURNEY.map((link) => link.href)).toEqual(["/about", "/about/studio", "/about/workflow", "/about/technology", "/about/principles"]);
    // 이전·다음은 각 페이지가 직접 적지 않고 ABOUT_JOURNEY에서 구한다(순서가 한곳에서만 바뀐다).
    const neighbors = (href: (typeof ABOUT_JOURNEY)[number]["href"]) => {
      const { previous, next } = aboutJourneyNeighbors(href);
      return [previous?.href, next?.href];
    };
    expect(neighbors("/about")).toEqual([undefined, "/about/studio"]);
    expect(neighbors("/about/studio")).toEqual(["/about", "/about/workflow"]);
    expect(neighbors("/about/workflow")).toEqual(["/about/studio", "/about/technology"]);
    // 마지막 페이지는 다음 소개 대신 시작하기(/studio/new)로 끝낸다(AboutJourneyPager).
    expect(neighbors("/about/principles")).toEqual(["/about/technology", undefined]);
    const pages: readonly (readonly [string, string])[] = [
      [ABOUT_PAGES[0], "/about"],
      [STUDIO_INTRODUCTION, "/about/studio"],
      [ABOUT_PAGES[1], "/about/workflow"],
      [ABOUT_PAGES[2], "/about/principles"],
    ];
    for (const [file, href] of pages) {
      expect(read(file), file).toContain(`<AboutJourneyPager current="${href}"`);
    }
  });

  it("처음 둘러보는 순서(홈 → 서비스 소개 → 제품 투어 → 첫 작품 시작)가 각 페이지의 '다음' 버튼으로 이어진다", () => {
    expect(SERVICE_FLOW.map((step) => step.href)).toEqual(["/", "/about", "/product-tour", "/studio/new"]);
    expect(serviceFlowNext("home")?.href).toBe("/about");
    expect(serviceFlowNext("about")?.href).toBe("/product-tour");
    expect(serviceFlowNext("tour")?.href).toBe("/studio/new");
    expect(serviceFlowNext("start")).toBeUndefined();
    expect(read(HOME_DASHBOARD)).toContain('<ServiceFlowNext current="home"');
    expect(about).toContain('<ServiceFlowNext current="about"');
    expect(read(PRODUCT_TOUR_PAGE)).toContain('<ServiceFlowNext current="tour"');
  });

  it("소개 이전·다음 번호와 홈 '더 알아보기'가 같은 소개 순서(정본)를 따른다", () => {
    // 2차 단순화로 /about의 '01~04 안내 카드'는 이전·다음 카드(AboutJourneyPager)로 합쳐졌다.
    // 번호가 각 페이지에 따로 적히지 않고 ABOUT_JOURNEY의 위치에서만 계산되는지를 확인한다.
    expect(ABOUT_JOURNEY.map((link) => aboutJourneyNeighbors(link.href).index)).toEqual([0, 1, 2, 3, 4]);
    expect(aboutJourneyNeighbors("/about").total).toBe(ABOUT_JOURNEY.length);
    expect(about).not.toMatch(/eyebrow: "0\d/u);
    expect(HOME_LEARN_MORE.slice(0, ABOUT_JOURNEY.length)).toEqual(ABOUT_JOURNEY);
  });
});
