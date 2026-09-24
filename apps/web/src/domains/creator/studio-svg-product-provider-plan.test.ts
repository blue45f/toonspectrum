import { describe, expect, it } from "vitest";

import { planStudioSvgProductProvider } from "./studio-svg-product-provider-plan";

describe("Studio SVG provider preflight", () => {
  it("keeps path-only SVG on Vello", () => {
    const plan = planStudioSvgProductProvider(
      '<svg><path d="M0 0L10 10"/></svg>',
      32,
      32,
      { webgpu: true },
    );
    expect(plan).toMatchObject({ route: "vello-native", providerId: "vello-svg-native" });
  });

  it("selects ThorVG WebGPU before rendering a bounded filter asset", () => {
    const plan = planStudioSvgProductProvider(
      '<svg><filter id="f"><feGaussianBlur stdDeviation="2"/></filter>'
      + '<rect width="20" height="20" filter="url(#f)"/></svg>',
      32,
      32,
      { webgpu: true },
    );
    expect(plan).toMatchObject({ route: "thorvg-specialist", providerId: "thorvg-webcanvas-wg" });
  });

  it("fails unsafe content before selecting a renderer", () => {
    const plan = planStudioSvgProductProvider(
      '<svg><image href="https://example.test/a.png"/></svg>',
      32,
      32,
      { webgpu: true },
    );
    expect(plan).toMatchObject({ route: "rejected", providerId: "rejected" });
  });
});
