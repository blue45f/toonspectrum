// StudioAssetMenuPanel의 모바일 터치·접근성 렌더 계약 회귀 테스트.
//
// 저장소 Vitest 환경은 node라 실제 클릭 이벤트 대신 renderToStaticMarkup으로 최초 렌더의
// 접근 가능한 이름, 44px 제어 클래스, hover에 의존하지 않는 작업 진입점을 검증한다.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioAssetMenuPanel } from "./StudioAssetMenuPanel";

import type { StudioAssetMenuPanelProps } from "./StudioAssetMenuPanel";
import type { SharedAsset } from "@/src/infrastructure/creator-client";

const LOCAL_ASSET = {
  id: "local-1",
  name: "로컬 에셋",
  dataUrl: "data:image/png;base64,AA",
  width: 512,
  height: 512,
  createdAt: 1,
  kind: "ai",
};

const SHARED_ASSET: SharedAsset = {
  id: "shared-1",
  name: "공유 에셋",
  dataUrl: "data:image/png;base64,AA",
  width: 512,
  height: 512,
  kind: "image",
  downloads: 3,
  author: { id: "author-1", name: "작가", avatar: "" },
  isOwner: true,
  createdAt: "2026-07-11T00:00:00.000Z",
};

const noop = () => {
  // 정적 렌더 테스트라 콜백은 실행되지 않는다.
};

function renderPanel(overrides: Partial<StudioAssetMenuPanelProps> = {}) {
  const props: StudioAssetMenuPanelProps = {
    assetTab: "mine",
    setAssetTab: noop,
    onUploadAsset: noop,
    assetPrompt: "투명 웹툰 소품",
    setAssetPrompt: noop,
    assetPromptName: "소품",
    setAssetPromptName: noop,
    assetPromptSize: "1024x1024",
    setAssetPromptSize: noop,
    assetPromptQuality: "high",
    setAssetPromptQuality: noop,
    assetGenerating: false,
    onGenerateAsset: noop,
    assetSearchQuery: "",
    setAssetSearchQuery: noop,
    assetSortOrder: "newest",
    setAssetSortOrder: noop,
    assets: [LOCAL_ASSET],
    assetsLoading: false,
    renamingAssetId: null,
    setRenamingAssetId: noop,
    renamingAssetName: "",
    setRenamingAssetName: noop,
    handleRenameAsset: noop,
    onUseLocalAsset: noop,
    onShareAsset: noop,
    onDeleteAsset: noop,
    publishingId: null,
    shared: [SHARED_ASSET],
    sharedLoading: false,
    sharedError: null,
    loadSharedAssets: noop,
    onUseSharedAsset: noop,
    onDeleteSharedAsset: noop,
    ...overrides,
  };
  return renderToStaticMarkup(<StudioAssetMenuPanel {...props} />);
}

describe("StudioAssetMenuPanel mobile asset controls", () => {
  it("renders 44px upload/generate controls and an accessible canvas-add action", () => {
    const html = renderPanel();

    expect(html).toContain('aria-label="이미지 에셋 업로드"');
    expect(html).toContain('aria-label="AI 에셋 생성"');
    expect(html).toContain('aria-label="로컬 에셋 캔버스에 추가"');
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(7);
    expect(html).toContain("lucide-plus");
  });

  it("keeps local management discoverable without hover-only 20px actions", () => {
    const html = renderPanel();

    expect(html).toContain('aria-controls="local-asset-actions-local-1"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="로컬 에셋 관리 작업 열기"');
    expect(html).not.toContain("size-5");
    expect(html).not.toContain("group-hover:opacity-100");
  });

  it("renders 44px save/cancel controls while renaming", () => {
    const html = renderPanel({ renamingAssetId: LOCAL_ASSET.id, renamingAssetName: "새 이름" });

    expect(html).toContain('aria-label="로컬 에셋 새 이름"');
    expect(html).toContain('aria-label="로컬 에셋 이름 저장"');
    expect(html).toContain('aria-label="로컬 에셋 이름 변경 취소"');
    expect(html).not.toContain('aria-controls="local-asset-actions-local-1"');
  });

  it("gives owned shared assets an always-visible management entry and accessible add action", () => {
    const html = renderPanel({ assetTab: "community" });

    expect(html).toContain('aria-label="공유 에셋 캔버스에 추가"');
    expect(html).toContain('aria-controls="shared-asset-actions-shared-1"');
    expect(html).toContain('aria-label="공유 에셋 공유 관리 작업 열기"');
    expect(html).not.toContain("group-hover:opacity-100");
  });
});
