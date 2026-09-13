// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/domains/creator/studio-marketplace-cc0-catalog", () => ({
  findStudioMarketplaceCc0Asset: () => ({
    id: "polyhaven-sofa-02",
    name: "Sofa 02",
    kind: "model",
    path: "models/sofa.glb",
    previewPath: "previews/sofa.webp",
    width: 768,
    height: 512,
  }),
}));

vi.mock("@/domains/creator/studio-cc0-asset-delivery", () => ({
  studioCc0AssetUrl: (path: string) => `/assets/${path}`,
}));

afterEach(() => {
  cleanup();
});

describe("MarketVerifiedAssetPreview", () => {
  it("stages compact previews on a light paper field so dark GLB thumbs stay visible", async () => {
    const { MarketVerifiedAssetPreview } = await import("./MarketVerifiedAssetPreview");
    const { container } = render(
      <MarketVerifiedAssetPreview reference="studio-3d-asset:polyhaven-sofa-02" compact />,
    );

    await waitFor(() => {
      const image = container.querySelector("img");
      expect(image).toBeTruthy();
      expect(image?.className).toContain("#efe8dc");
      expect(image?.className).not.toContain("bg-panel");
    });
  });
});
