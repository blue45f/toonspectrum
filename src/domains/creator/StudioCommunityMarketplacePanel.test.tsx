import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioCommunityMarketplacePanel } from "./StudioCommunityMarketplacePanel";

const source = readFileSync(
  new URL("./StudioCommunityMarketplacePanel.tsx", import.meta.url),
  "utf8",
);
const assetMenuSource = readFileSync(
  new URL("./StudioAssetMenuPanel.tsx", import.meta.url),
  "utf8",
);

describe("StudioCommunityMarketplacePanel", () => {
  it("collapsed 상태에서는 서버 요청 UI를 지연하고 온라인 경계를 정확히 설명한다", () => {
    const html = renderToStaticMarkup(<StudioCommunityMarketplacePanel />);

    expect(html).toContain("온라인 Creator 공유");
    expect(html).toContain("공개 탐색 · 실제 설치 · 내 자료 게시");
    expect(html).not.toContain("온라인 공유 보기");
    expect(html).not.toContain("무료 공유 마켓에 게시");
  });

  it("공개·내 공유·자료 게시 탭과 모든 공통 리소스 종류를 노출한다", () => {
    const html = renderToStaticMarkup(
      <StudioCommunityMarketplacePanel initialOpen onUseAsset={() => true} />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-controls="');
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain("공개 마켓");
    expect(html).toContain("내 공유");
    expect(html).toContain("자료 게시");
    for (const label of ["에셋", "브러시", "필터", "팔레트", "템플릿", "3D"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("이름·설명·태그 검색");
    expect(html).toContain("검색");
  });

  it("실제 서버 목록·게시·소유자 삭제와 로컬 설치·제거 경로를 연결한다", () => {
    expect(source).toContain("listCreatorMarketplaceResources");
    expect(source).toContain("listMyCreatorMarketplaceResources");
    expect(source).toContain("publishCreatorMarketplaceResource");
    expect(source).toContain("deleteCreatorMarketplaceResource");
    expect(source).toContain("installStudioCreatorPack");
    expect(source).toContain("uninstallStudioCreatorPack");
    expect(source).toContain("projectCreatorMarketplaceRecordToAssets");
    expect(source).toContain("createStudioOriginalFreeAssetRecord");
    expect(source).toContain("deleteArmed");
    expect(source).toContain("삭제 확인");
  });

  it("권리·AI·라이선스 확인 없이 게시할 수 없고 가짜 성공을 표시하지 않는다", () => {
    expect(source).toContain("제가 직접 제작했으며 게시·재배포할 권리를 보유합니다.");
    expect(source).toContain("다른 마켓 상품을 복제하거나 알아보기 어렵게 변형한 자료가 아닙니다.");
    expect(source).toContain("AI 생성·보조 포함");
    expect(source).toContain("attributionRequired");
    expect(source).toContain("const ready = Boolean(candidate)");
    expect(source).toContain("await publishCreatorMarketplaceResource(manifest)");
    expect(source).toContain("await deleteCreatorMarketplaceResource(record.id)");
  });

  it("에셋 메뉴의 커뮤니티 경로가 실제 캔버스 삽입 콜백을 전달한다", () => {
    expect(assetMenuSource).toContain(
      "<StudioCommunityMarketplacePanel onUseAsset={onUseLocalAsset} />",
    );
  });
});
