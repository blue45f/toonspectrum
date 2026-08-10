import { readFile } from "node:fs/promises";

import { providerDescriptorSchema } from "@toonspectrum/studio-engine-registry";
import { beforeAll, describe, expect, it } from "vitest";

import { velloSvgNativeProviderDescriptor } from "../descriptor";
import {
  SvgNativeRenderError,
  auditSvgNative,
  loadVelloSvgNative,
  renderSvgToPixelsVelloCpu,
  renderSvgToPixelsVelloGpu,
} from "../svg-vello";

const FIXTURE_ROOT = new URL(
  "../../../../crates/studio-engine-vello/tests/fixtures/svg/",
  import.meta.url,
);
const WASM_URL = new URL(
  "../../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello_bg.wasm",
  import.meta.url,
);

async function fixture(name: string): Promise<string> {
  return readFile(new URL(name, FIXTURE_ROOT), "utf8");
}

beforeAll(async () => {
  const wasm = new Uint8Array(await readFile(WASM_URL));
  await loadVelloSvgNative(wasm);
});

describe("Vello-native SVG strict audit", () => {
  it("reports bounded source structure before rendering", async () => {
    const audit = await auditSvgNative(await fixture("gradients.svg"));
    expect(audit.elementCount).toBeGreaterThanOrEqual(10);
    expect(audit.maxDepth).toBeGreaterThanOrEqual(2);
    expect(audit.localReferenceCount).toBe(2);
  });

  it.each([
    ["text", "<svg width='8' height='8'><text x='1' y='7'>loss</text></svg>", "element:text"],
    [
      "filter",
      "<svg width='8' height='8'><filter id='f'/><path filter='url(#f)' d='M0 0L8 8'/></svg>",
      "element:filter",
    ],
    [
      "mask",
      "<svg width='8' height='8'><mask id='m'/><path mask='url(#m)' d='M0 0L8 8'/></svg>",
      "element:mask",
    ],
    [
      "pattern",
      "<svg width='8' height='8'><pattern id='p'/><path fill='url(#p)' d='M0 0L8 8'/></svg>",
      "element:pattern",
    ],
    [
      "image",
      "<svg width='8' height='8'><image href='data:image/png;base64,AA=='/></svg>",
      "element:image",
    ],
    [
      "complex clip",
      "<svg width='8' height='8'><clipPath id='c'><rect/><circle/></clipPath><path clip-path='url(#c)' d='M0 0L8 8'/></svg>",
      "clipPath:requires-one-direct-geometry",
    ],
  ])("rejects unsupported %s semantics instead of approximating", async (_name, svg, marker) => {
    const rejection = auditSvgNative(svg).catch((error: unknown) => error);
    await expect(rejection).resolves.toBeInstanceOf(SvgNativeRenderError);
    const error = (await rejection) as SvgNativeRenderError;
    expect(error.code).toBe("svg-native-unsupported");
    expect(error.message).toContain(marker);
  });

  it("rejects malformed XML and target sizes with typed errors", async () => {
    await expect(auditSvgNative("<svg><path></svg>")).rejects.toMatchObject({
      code: "svg-native-invalid-xml",
    });
    await expect(renderSvgToPixelsVelloCpu("<svg/>", 0, 8)).rejects.toMatchObject({
      code: "svg-native-invalid-size",
    });
  });
});

describe("Vello-native SVG CPU reference", () => {
  it.each(["curves.svg", "gradients.svg", "clip.svg"])(
    "renders %s bit-deterministically",
    async (name) => {
      const svg = await fixture(name);
      const first = await renderSvgToPixelsVelloCpu(svg, 128, 128);
      const second = await renderSvgToPixelsVelloCpu(svg, 128, 128);
      expect(first).toHaveLength(128 * 128 * 4);
      expect(second).toEqual(first);
      expect(first.some((value) => value !== 255)).toBe(true);
    },
  );

  it("keeps the GPU API explicit when navigator.gpu is absent", async () => {
    await expect(
      renderSvgToPixelsVelloGpu(await fixture("curves.svg"), 128, 128),
    ).rejects.toThrow(/WebGPU is unavailable/);
  });
});

describe("Vello-native SVG provider descriptor", () => {
  it("is schema-valid and scopes authority to an audited subset", () => {
    const descriptor = providerDescriptorSchema.parse(velloSvgNativeProviderDescriptor);
    expect(descriptor.id).toBe("vello-svg-native");
    expect(descriptor.capabilities).toContain("format.svg.strict-audit");
    expect(descriptor.capabilities).toContain("render.svg.vello-native");
    expect(descriptor.limitations.join(" ")).toMatch(/text.*reject/i);
    expect(descriptor.limitations.join(" ")).toMatch(/clipPath.*exactly one/i);
    expect(descriptor.fallbackProviderId).toBe("skia-canvaskit");
  });
});
