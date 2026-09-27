import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CreatorEcosystemAtlas } from "./CreatorEcosystemAtlas";
import { ECOSYSTEM_MODULES as MODULES } from "./creator-ecosystem-atlas-data";
import { imageSizeOf } from "./image-header-size";

const COMPONENT_SOURCE = "apps/web/src/domains/marketing/CreatorEcosystemAtlas.tsx";
const STYLES = "apps/web/src/domains/marketing/creator-ecosystem-atlas.css";
const ROUTES_DIR = "apps/web/src/app/routes";

function routeSources(): string {
  const files = [
    ...readdirSync(ROUTES_DIR, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx")),
  ];
  return files.map((name) => readFileSync(join(ROUTES_DIR, name), "utf8")).join("\n");
}

describe("생태계 아틀라스 모듈 그리드", () => {
  it("레퍼런스 구조대로 8개 모듈을 4열 그리드로 노출한다", () => {
    expect(MODULES).toHaveLength(8);
    const styles = readFileSync(STYLES, "utf8");
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(styles).toContain("repeat(2, minmax(0, 1fr))");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("같은 원본 아트를 서로 다른 크롭으로 잘라 8개가 구분되게 한다", () => {
    const positions = MODULES.map((module) => module.position);
    expect(new Set(positions).size).toBe(positions.length);
    for (const module of MODULES) {
      expect(module.position).toMatch(/^\d+% \d+%$/u);
    }
  });

  it("8개 모듈이 8개의 서로 다른 원본 아트를 쓴다", () => {
    const images = MODULES.map((module) => module.image);
    expect(new Set(images).size).toBe(images.length);
  });

  it("이전까지 코드 참조가 없던 시네마틱 아트를 제품 화면에 편입한다", () => {
    const images = MODULES.map((module) => module.image);
    for (const orphan of ["/brand/toonstudio-route-header-0.jpg", "/brand/toonstudio-route-header-6.jpg", "/brand/toonstudio-route-header-12.jpg", "/brand/toonstudio-route-header-18.jpg"]) {
      expect(images).toContain(orphan);
    }
  });

  it("선언한 원본 크기와 실제 파일의 크기가 어긋나지 않는다", () => {
    for (const module of MODULES) {
      const actual = imageSizeOf(`apps/web/public${module.image}`);
      expect({ ...actual, image: module.image }).toEqual({ width: module.width, height: module.height, image: module.image });
    }
  });

  it("모든 모듈이 실제 존재하는 아트를 커밋된 파일에서 읽는다", () => {
    for (const module of MODULES) {
      expect(module.image.startsWith("/brand/")).toBe(true);
      expect(existsSync(`apps/web/public${module.image}`)).toBe(true);
    }
  });

  it("모듈 목적지는 실제로 등록된 경로만 사용한다", () => {
    const routes = routeSources();
    for (const module of MODULES) {
      expect(routes).toContain(`"${module.href}"`);
    }
  });

  it("한글과 영문 카피가 모두 갖춰진다", () => {
    for (const module of MODULES) {
      expect(module.titleKo.length).toBeGreaterThan(0);
      expect(module.titleEn.length).toBeGreaterThan(0);
      expect(module.label).toMatch(/^[A-Z0-9 ,·]+$/u);
      expect(module.bodyKo.length).toBeGreaterThan(0);
      expect(module.bodyEn.length).toBeGreaterThan(0);
    }
  });

  it("AI 제작 콘셉트 아트임을 화면에 명시한다", () => {
    const source = readFileSync(COMPONENT_SOURCE, "utf8");
    expect(source).toContain("AI로 제작한 브랜드 콘셉트 아트");
    expect(source).toContain("AI-generated brand concept art");
    expect(source).toContain("cf-atlas-disclosure");
  });

  it("장식 맥락에 임의 색을 하드코딩하지 않는다", () => {
    const styles = readFileSync(STYLES, "utf8");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(styles).not.toMatch(/\brgba?\(/u);
    expect(styles).not.toContain("#000");
    expect(styles).not.toContain("#fff");
  });

  it("한글이 어절 중간에서 끊기지 않게 하고 자간을 라틴 디스플레이값에 맞추지 않는다", () => {
    const styles = readFileSync(STYLES, "utf8");
    expect(styles).not.toContain("word-break: break-all");
    expect(styles).toContain("word-break: keep-all");
    // 한글 음각이 -0.02em보다 더 조이면 글자가 서로 붙는다.
    expect(styles).not.toMatch(/letter-spacing: -0\.0[3-9]em/u);
    expect(styles).not.toContain("#000");
  });

  it("모션 감소 설정을 존중한다", () => {
    const styles = readFileSync(STYLES, "utf8");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("아트를 장식 이미지로 처리해 대체 텍스트 요구를 어기지 않는다", () => {
    const source = readFileSync(COMPONENT_SOURCE, "utf8");
    expect(source).toContain('alt=""');
    expect(source).toContain("aria-hidden");
  });

  it("이미지 헤더 파서는 이미지가 아니면 조용히 통과하지 않고 실패한다", () => {
    // CI에서 macOS 전용 sips를 쓰면 ENOENT로 터졌었다. 순수 Node 파서로 대체했고,
    // 지원하지 않는 컨테이너를 조용히 넘기지 않는지 확인한다.
    expect(() => imageSizeOf("package.json")).toThrow(/unsupported image container/gu);
    expect(() => imageSizeOf("apps/web/public/brand/film-manifest.json")).toThrow();
  });

  it("명시적 export로 나뉘어 있어 다른 화면에서도 재사용할 수 있다", () => {
    expect(typeof CreatorEcosystemAtlas).toBe("function");
  });
});
