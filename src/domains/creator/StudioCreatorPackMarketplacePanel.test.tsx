import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioCreatorPackMarketplacePanel } from "./StudioCreatorPackMarketplacePanel";

const panelSource = readFileSync(
  new URL("./StudioCreatorPackMarketplacePanel.tsx", import.meta.url),
  "utf8",
);

describe("StudioCreatorPackMarketplacePanel", () => {
  it("stays lazy while collapsed", () => {
    const html = renderToStaticMarkup(<StudioCreatorPackMarketplacePanel />);
    expect(html).toContain("Creator Pack 통합 마켓");
    expect(html).toContain("13 FREE");
    expect(html).not.toContain("data-studio-creator-pack=");
  });

  it("renders five resource kinds, real install boundaries and package metadata", () => {
    const html = renderToStaticMarkup(
      <StudioCreatorPackMarketplacePanel initialOpen />,
    );
    expect(html.match(/data-studio-creator-pack=/g)).toHaveLength(5);
    for (const label of ["브러시", "필터", "팔레트", "템플릿", "3D"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("실제 설치");
    expect(html).toContain("Studio 내장됨");
    expect(html).toContain("CC0 1.0");
    expect(html).toContain("v1.0.0");
  });

  it("offers a real transactional uninstall path for installed portable packs", () => {
    expect(panelSource).toContain("uninstallStudioCreatorPack(pack, storage)");
    expect(panelSource).toContain('"기기에서 제거"');
    expect(panelSource).toContain("status.status === \"conflict\"");
    expect(panelSource).toContain("key={`${pack.metadata.id}:${refreshToken}`}");
  });
});
