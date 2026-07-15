import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioWebGpuCanvas } from "./StudioWebGpuCanvas";

describe("StudioWebGpuCanvas", () => {
  it("renders transparent WebGPU and Canvas2D surfaces without an unsupported warning overlay", () => {
    const html = renderToStaticMarkup(
      <StudioWebGpuCanvas
        width={800}
        height={1_200}
        strokes={[
          {
            id: "preview-stroke",
            points: [10, 10, 40, 40],
            color: "#7c5cff",
            size: 8,
          },
        ]}
      />
    );

    expect(html).toContain('data-studio-gpu-compositor="true"');
    expect(html).toContain('data-studio-gpu-surface="webgpu"');
    expect(html).toContain('data-studio-gpu-surface="canvas2d"');
    expect(html).not.toContain("WebGPU 미지원");
    expect(html).not.toContain("Fallback");
  });
});
