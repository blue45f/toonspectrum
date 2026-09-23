import { describe, expect, it } from "vitest";

import {
  ThorvgAssetRejectedError,
  auditThorvgLottie,
  auditThorvgSvg,
  selectThorvgBackend,
} from "./audit";

describe("ThorVG SVG preflight", () => {
  it("keeps the strict path-only subset on the Vello-first lane", () => {
    const result = auditThorvgSvg(
      '<svg width="32" height="32"><path d="M0 0L32 32"/></svg>',
      32,
      32,
    );
    expect(result.requiresThorvg).toBe(false);
    expect(result.elementCount).toBe(2);
  });

  it("identifies a bounded specialist feature before any renderer starts", () => {
    const result = auditThorvgSvg(
      '<svg><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs>'
      + '<rect width="20" height="20" filter="url(#blur)"/></svg>',
      32,
      32,
    );
    expect(result.requiresThorvg).toBe(true);
    expect(result.features).toContain("filter");
    expect(result.localReferenceCount).toBe(1);
  });

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="https://example.test/a.png"/></svg>',
    '<svg><rect style="fill:url(https://example.test/a.svg)"/></svg>',
  ])("rejects active or external content: %s", (source) => {
    expect(() => auditThorvgSvg(source, 32, 32)).toThrow(ThorvgAssetRejectedError);
  });
});

describe("ThorVG Lottie preflight", () => {
  const valid = JSON.stringify({
    v: "5.12.2",
    w: 64,
    h: 64,
    fr: 60,
    ip: 0,
    op: 120,
    layers: [{ ty: 4, nm: "shape", shapes: [] }],
    assets: [],
  });

  it("accepts a bounded expression-free document", () => {
    expect(auditThorvgLottie(valid)).toMatchObject({
      width: 64,
      height: 64,
      fps: 60,
      frameCount: 120,
      layerCount: 1,
    });
  });

  it("rejects expressions and external image assets", () => {
    const expression = JSON.stringify({
      w: 64, h: 64, fr: 30, ip: 0, op: 30, layers: [{ x: "time*2" }], assets: [],
    });
    const external = JSON.stringify({
      w: 64, h: 64, fr: 30, ip: 0, op: 30, layers: [], assets: [{ p: "image.png" }],
    });
    expect(() => auditThorvgLottie(expression)).toThrow("unsupported-expression");
    expect(() => auditThorvgLottie(external)).toThrow("external-resource");
  });
});

describe("ThorVG backend planning", () => {
  it("chooses exactly one backend before acquisition", () => {
    expect(selectThorvgBackend({ webgpu: true })).toBe("wg");
    expect(selectThorvgBackend({ webgpu: false, webgl2: true })).toBe("gl");
    expect(selectThorvgBackend({ webgpu: false, webgl2: false })).toBe("sw");
  });
});
