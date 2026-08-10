import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_SVG_PRODUCT_VISUAL_GATE,
  StudioSvgProductTournament,
  studioSvgProductFuzzyMismatchPct,
  type StudioSvgProductEngines,
  type StudioSvgProductPixels,
} from "./studio-svg-vello-product-router";

import type { SceneIR } from "@toonspectrum/studio-project-model";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#f00"/></svg>';

function pixels(value = 17, width = 2, height = 2): StudioSvgProductPixels {
  return { width, height, bytes: new Uint8Array(width * height * 4).fill(value) };
}

function engines(overrides: Partial<StudioSvgProductEngines> = {}): StudioSvgProductEngines {
  const reference = pixels();
  return {
    auditVello: vi.fn(async () => ({ elementCount: 2, maxDepth: 2, localReferenceCount: 0 })),
    renderVelloCpu: vi.fn(async () => reference.bytes.slice()),
    importScene: vi.fn(async () => ({
      scene: { width: 2, height: 2 } as SceneIR,
      warnings: [],
      unsupported: [],
    })),
    renderScene: vi.fn(async () => reference),
    renderResvg: vi.fn(async () => reference),
    ...overrides,
  };
}

function input(svg = SVG) {
  return { assetId: "shape-red", svg, width: 2, height: 2, trust: "bundled-catalog" as const };
}

describe("Studio SVG product renderer tournament", () => {
  it("selects vello-svg-native only after strict audit and the resvg visual gate", async () => {
    const ports = engines();
    const result = await new StudioSvgProductTournament(ports).resolve(input());

    expect(ports.auditVello).toHaveBeenCalledOnce();
    expect(ports.renderVelloCpu).toHaveBeenCalledOnce();
    expect(ports.renderResvg).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      providerId: "vello-svg-native",
      route: "strict-native-reference",
      visualGate: { pass: true, referenceProviderId: "resvg-wasm" },
      sourcePreserved: true,
      interactiveGpuReadbackBytes: 0,
    });
  });

  it("routes a visually divergent native frame to the resvg reference", async () => {
    const result = await new StudioSvgProductTournament(engines({
      renderVelloCpu: async () => pixels(255).bytes,
      renderResvg: async () => pixels(0),
    })).resolve(input());

    expect(result.providerId).toBe("resvg-wasm");
    expect(result.visualGate).toMatchObject({ pass: false, mismatchPct: 100 });
    expect(result.reasons.join(" ")).toContain("visual gate failed");
  });

  it("uses an editable SceneIR/CanvasKit route only when the loss ledger is empty", async () => {
    const renderScene = vi.fn(async () => pixels(31));
    const result = await new StudioSvgProductTournament(engines({
      auditVello: async () => { throw new Error("strict subset rejected polygon"); },
      renderScene,
    })).resolve(input());

    expect(renderScene).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      providerId: "skia-canvaskit-scene-ir",
      route: "editable-scene-ir",
      editable: true,
      fallbackFrom: "vello-svg-native",
    });
  });

  it("never calls CanvasKit when FormatGateway reports unsupported meaning", async () => {
    const renderScene = vi.fn(async () => pixels(31));
    const result = await new StudioSvgProductTournament(engines({
      auditVello: async () => { throw new Error("filter unsupported"); },
      importScene: async () => ({
        scene: { width: 2, height: 2 } as SceneIR,
        warnings: ["filter kept only in source"],
        unsupported: ["element:filter"],
      }),
      renderScene,
    })).resolve(input('<svg width="2" height="2"><filter id="f"/></svg>'));

    expect(renderScene).not.toHaveBeenCalled();
    expect(result.providerId).toBe("resvg-wasm");
    expect(result.warnings).toEqual(["filter kept only in source"]);
    expect(result.unsupported).toEqual(["element:filter"]);
  });

  it("preserves font-dependent bundled SVG on the browser route instead of dropping text", async () => {
    const svg = '<svg width="2" height="2"><text x="0" y="1">A</text></svg>';
    const result = await new StudioSvgProductTournament(engines({
      auditVello: async () => { throw new Error("text unsupported"); },
      importScene: async () => ({
        scene: { width: 2, height: 2 } as SceneIR,
        warnings: [],
        unsupported: ["element:text"],
      }),
    })).resolve(input(svg));

    expect(result).toMatchObject({
      providerId: "browser-native-svg",
      route: "trusted-browser-preservation",
      pixels: null,
      sourcePreserved: true,
    });
    expect(result.unsupported).toContain("element:text");
  });

  it("fails closed for active or externally resolved SVG before loading an engine", async () => {
    const ports = engines();
    const result = await new StudioSvgProductTournament(ports).resolve(
      input('<svg width="2" height="2"><script>alert(1)</script></svg>'),
    );

    expect(result.providerId).toBe("rejected");
    expect(result.unsupported).toContain("security:active-or-external-content");
    expect(ports.auditVello).not.toHaveBeenCalled();
  });

  it("deduplicates in-flight work and returns the cached immutable decision", async () => {
    const ports = engines();
    const tournament = new StudioSvgProductTournament(ports);
    const first = tournament.resolve(input());
    const second = tournament.resolve(input());
    const [a, b] = await Promise.all([first, second]);
    const cached = await tournament.resolve(input());

    expect(a).toBe(b);
    expect(cached).toBe(a);
    expect(ports.auditVello).toHaveBeenCalledOnce();
    expect(tournament.metrics()).toMatchObject({ cachedEntries: 1, inFlight: 0, active: 0 });
  });

  it("does not reuse an asset-specific decision across equal SVG sources", async () => {
    const ports = engines();
    const tournament = new StudioSvgProductTournament(ports);
    const first = await tournament.resolve(input());
    const second = await tournament.resolve({ ...input(), assetId: "shape-red-copy" });

    expect(first.assetId).toBe("shape-red");
    expect(second.assetId).toBe("shape-red-copy");
    expect(first.sourceDigest).toBe(second.sourceDigest);
    expect(ports.auditVello).toHaveBeenCalledTimes(2);
  });

  it("uses the committed symmetric fuzzy metric and fixed quality floor", () => {
    const left = pixels(0, 3, 1).bytes;
    const shifted = left.slice();
    shifted[4] = 47;
    expect(studioSvgProductFuzzyMismatchPct(left, shifted, 3, 1)).toBe(0);
    expect(STUDIO_SVG_PRODUCT_VISUAL_GATE).toMatchObject({
      metric: "symmetric-3x3-rgba-delta48",
      maximumMismatchPct: 2,
      referenceProviderId: "resvg-wasm",
    });
  });
});
