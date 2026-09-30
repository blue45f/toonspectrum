import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ABOUT_JOURNEY, HOME_LEARN_MORE } from "./reference-home-content";

/**
 * 홈·서비스 소개·제품 투어·브랜드 필름의 모든 내부 링크가 실제 라우트로 이어지는지 확인한다.
 * 앱 라우트 모듈을 직접 가져오면 도메인 경계를 넘으므로, 라우트 정의 원문을 읽어 경로 목록을 만든다.
 */
const ROUTE_GROUP_DIR = "apps/web/src/app/routes/groups";
const STUDIO_REGISTRY = "apps/web/src/domains/creator/studio-route-registry.ts";
const STUDIO_WORKSPACE_ROUTE = "apps/web/src/domains/creator/studio-workspace-route.ts";
const STUDIO_ROUTE_MANIFEST = "apps/web/src/domains/creator/studio-router/studio-route-manifest.ts";
const MARKETING_DIR = "apps/web/src/domains/marketing";
const STUDIO_INTRODUCTION = "apps/web/src/domains/marketing/StudioIntroduction.tsx";
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
    for (const route of ["/", "/about", "/about/studio", "/product-tour", "/brand-film", "/studio/new", "/studio/space", "/studio/comic", "/studio/bg3d", "/production"]) {
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

  it("/about은 누구 → 왜 → 핵심 기능 → 작동 방식 → 영상 → 더 알아보기 → 시작하기 순서로 읽힌다", () => {
    const order = [
      "about-audience-title",
      "about-purpose-title",
      "about-features-title",
      "about-how-title",
      "about-videos-title",
      "about-guides-title",
      "about-start-title",
    ].map((id) => about.indexOf(`id="${id}"`));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
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
    const pager = (source: string, rel: "prev" | "next") => source.match(new RegExp(`href="([^"]+)" rel="${rel}"`, "u"))?.[1];
    const workflow = read(ABOUT_PAGES[1]);
    const principles = read(ABOUT_PAGES[2]);
    const studio = read(STUDIO_INTRODUCTION);
    expect(ABOUT_JOURNEY.map((link) => link.href)).toEqual(["/about", "/about/studio", "/about/workflow", "/about/technology", "/about/principles"]);
    expect(pager(about, "next")).toBe("/about/studio");
    expect(pager(studio, "prev")).toBe("/about");
    expect(pager(studio, "next")).toBe("/about/workflow");
    expect(pager(workflow, "prev")).toBe("/about/studio");
    expect(pager(workflow, "next")).toBe("/about/technology");
    expect(pager(principles, "prev")).toBe("/about/technology");
    // 마지막 페이지는 다음 소개 대신 시작하기로 끝낸다.
    expect(pager(principles, "next")).toBeUndefined();
    expect(principles).toContain('href="/studio/new"');
  });

  it("/about 안내 카드 번호와 홈 '더 알아보기'가 같은 소개 순서를 따른다", () => {
    const guideOrder = [...about.matchAll(/href: "(\/about\/[a-z]+)",\s*icon: \w+,\s*eyebrow: "0(\d)/gu)].map((match) => [match[1], Number(match[2])]);
    expect(guideOrder).toEqual(ABOUT_JOURNEY.slice(1).map((link, index) => [link.href, index + 1]));
    expect(HOME_LEARN_MORE.slice(0, ABOUT_JOURNEY.length)).toEqual(ABOUT_JOURNEY);
  });
});
