import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("/studio SVG product wiring boundary", () => {
  it("connects the live asset popover to the routed Elements preview", () => {
    const popover = read("./StudioAssetToolPopoverBody.tsx");
    const elements = read("./StudioElementsPanel.tsx");
    const preview = read("./StudioSvgAssetPreview.tsx");

    expect(popover).toContain("<StudioElementsPanel");
    expect(popover).toContain("addCatalogElement(item)");
    expect(elements).toContain("<StudioSvgAssetPreview");
    expect(elements).toContain("onPointerEnter={() => setPreviewRequested(true)}");
    expect(preview).toContain("tournament.resolve({");
    expect(preview).toContain('trust: "bundled-catalog"');
    expect(preview).toContain("data-studio-svg-preview-provider");
  });

  it("keeps the original SVG as placement authority and excludes GPU readback", () => {
    const page = read("./StudioPage.tsx");
    const elements = read("./StudioElementsPanel.tsx");
    const router = read("./studio-svg-vello-product-router.ts");

    expect(elements).toContain("onPick(item)");
    expect(elements).toContain("src: svgToDataUrl(item.svg)");
    expect(page).toContain("function addCatalogElement");
    expect(page).toContain("src: svgToDataUrl(item.svg)");
    expect(router).toContain("renderSvgToPixelsVelloCpu");
    expect(router).not.toContain("renderSvgToPixelsVelloGpu");
    expect(router).toContain("interactiveGpuReadbackBytes: 0");
  });
});

describe("SVG router engine imports must survive bundling", () => {
  it("imports every engine adapter with a literal specifier", () => {
    const router = read("./studio-svg-vello-product-router.ts");

    // 이 게이트가 없던 동안 skia-canvaskit-scene-ir 라우트가 프로덕션에서 통째로 죽어 있었다.
    // 어댑터 패키지 이름을 const 에 담아 `@vite-ignore` 로 import 하면 Vite 가 그 지정자를 그대로
    // 내보내고, 브라우저는 bare specifier 를 해석할 수 없어 loadCanvasKitRenderer 가 매번 던졌다.
    // 라우터는 조용히 resvg 로 떨어졌고, 어댑터 코드는 dist 에 존재조차 하지 않았다(매니페스트
    // 엔트리 0개). 라우터의 단위 테스트는 가짜 엔진을 주입하므로 이걸 잡을 수 없다 — 잡히는
    // 지점은 소스의 import 모양뿐이다.
    // 주석이 아니라 실제 호출 모양을 본다: 모든 동적 import 의 지정자가 따옴표로 시작해야 한다.
    const dynamicImports = [...router.matchAll(/\bimport\(\s*([^)]{0,40})/gu)]
      .map(([, head]) => head.trim())
      .filter((head) => !head.startsWith("//"));
    expect(dynamicImports.length).toBeGreaterThan(0);
    for (const head of dynamicImports) {
      expect(head.startsWith('"') || head.startsWith("'"), head).toBe(true);
    }
    expect(router).toContain('import("@toonspectrum/studio-engine-skia")');
    expect(router).toContain('import("@toonspectrum/studio-engine-vello")');

    // 앱은 어댑터의 타입을 좁은 shim 으로 대체한다(tsconfig paths). 그게 원래 const + @vite-ignore
    // 가 하려던 일이고, 번들러를 막지 않는 올바른 도구다.
    const tsconfig = readFileSync(
      new URL("../../../tsconfig.json", import.meta.url),
      "utf8",
    );
    expect(tsconfig).toContain("@toonspectrum/studio-engine-skia");
    expect(tsconfig).toContain("studio-engine-skia-shim.d.ts");
  });
});
