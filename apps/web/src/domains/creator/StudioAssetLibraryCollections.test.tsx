import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioAssetLibraryCollections } from "./StudioAssetLibraryCollections";

import type { StudioAssetLibraryCollectionsProps } from "./StudioAssetLibraryCollections";

function props(): StudioAssetLibraryCollectionsProps {
  return {
    children: <p>기존 삽입 허브</p>, items: [], loading: false,
    assets: [{ id: "mine", name: "테스트 배경", dataUrl: "data:image/png;base64,AA==", width: 200, height: 100, createdAt: 1, kind: "bg3d" }],
    onDeleteAsset: vi.fn(async () => undefined), onUseAsset: vi.fn(() => true),
    onUseItem: vi.fn(() => true), onOpen3d: vi.fn(),
  };
}

describe("asset library collections", () => {
  it("keeps the insertion hub as the default and exposes direct library navigation", () => {
    const html = renderToStaticMarkup(<StudioAssetLibraryCollections {...props()} />);
    expect(html).toContain("기존 삽입 허브");
    expect(html).toContain("고품질 공용");
    expect(html).toContain("내 에셋 관리");
    expect(html).toContain("템플릿 · 배경");
  });
  it("shows a discoverable delete action and distinguishes rendered images from model originals", () => {
    const input = props();
    const html = renderToStaticMarkup(<StudioAssetLibraryCollections {...input} initialView="mine" />);
    expect(html).toContain('aria-label="테스트 배경 삭제"');
    expect(html).toContain("현재 페이지 선택");
    expect(html).toContain("3D 렌더 이미지");
    expect(html).toContain("3D 모델 원본 관리 열기");
    expect(input.onDeleteAsset).not.toHaveBeenCalled();
  });
  it("labels external libraries as links rather than installed asset inventory", () => {
    const html = renderToStaticMarkup(<StudioAssetLibraryCollections {...props()} initialView="sources" />);
    expect(html).toContain("기본 제공 소재 수에 포함하지 않습니다");
    expect(html).toContain("Poly Haven");
    expect(html).toContain("noopener noreferrer");
  });
});
