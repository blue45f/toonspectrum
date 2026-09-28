// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceCustomizationPanel } from "./StudioVirtualSpaceCustomizationPanel";
import { StudioVirtualSpaceEnvironmentPanel } from "./StudioVirtualSpaceEnvironmentPanel";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "./studio-virtual-space-environment-preference";
import { studioVirtualDecorationPreset, DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION } from "./studio-virtual-space-customization";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

// 저장 안내 검증은 정상 빈 목록을 사용하고 HTTP 계약은 client 테스트가 소유한다.
vi.mock("./studio-virtual-custom-furniture-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-virtual-custom-furniture-client")>(),
  listStudioVirtualCustomFurniture: vi.fn(async () => []),
}));

afterEach(cleanup);

describe("배치와 환경의 저장 의미 안내", () => {
  it("배경 장소는 장소별, 배경·시간대·날씨는 전체 적용이며 서버 게시 권한을 대신하지 않는다고 밝힌다", () => {
    render(<StudioVirtualSpaceCustomizationPanel
      world={studioVirtualPlaceWorldManifest("creator-cafe")}
      nickname="" onNickname={vi.fn()}
      character={DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION}
      onCharacter={vi.fn()}
      decorations={studioVirtualDecorationPreset("creator-garden")}
      selfPoint={{ x: 480, y: 540 }}
      onDecorations={vi.fn()} />);
    const text = screen.getByText(/이 브라우저에만 저장되며 서버의 공유 월드 게시 권한을 대신하지 않습니다/u);
    expect(text).not.toBeNull();
    expect(text.textContent).toContain("지금 장소에만 저장");
    expect(text.textContent).toContain("모든 장소에 함께 적용");
  });

  it("환경 패널은 전체 적용과 장소별 배경 장소로의 안내를 함께 제공한다", () => {
    render(<StudioVirtualSpaceEnvironmentPanel
      value={DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT} onChange={vi.fn()} />);
    expect(screen.getByText(/이 설정은 모든 장소에 함께 적용되어 이 브라우저에만 저장됩니다/u)).not.toBeNull();
    expect(screen.getByText(/꾸미기의 배경 장소를 고르세요/u)).not.toBeNull();
  });
});
