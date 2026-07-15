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
    expect(html).toContain('data-studio-gpu-frame-authorized="false"');
    expect(html).toContain("invisible");
    expect(html).toContain('data-studio-gpu-surface="webgpu"');
    expect(html).toContain('data-studio-gpu-surface="canvas2d"');
    expect(html).not.toContain("WebGPU 미지원");
    expect(html).not.toContain("Fallback");
  });

  it("shows the compositor only when the parent authorizes the matching frame receipt", () => {
    const html = renderToStaticMarkup(
      <StudioWebGpuCanvas width={800} height={1_200} frameAuthorized />
    );

    expect(html).toContain('data-studio-gpu-frame-authorized="true"');
    expect(html).not.toContain("invisible");
  });

  it("renders a bounded viewport surface instead of a full-height document surface", () => {
    const html = renderToStaticMarkup(
      <StudioWebGpuCanvas
        width={800}
        height={12_000}
        surfaceBounds={{ left: 120, top: 4_800, width: 640, height: 720 }}
        scaleX={1.875}
        scaleY={25}
        offsetX={-150}
        offsetY={-80_000}
        frameAuthorized
      />
    );

    expect(html).toContain('data-studio-gpu-surface-width="640"');
    expect(html).toContain('data-studio-gpu-surface-height="720"');
    expect(html).toContain("left:120px");
    expect(html).toContain("top:4800px");
    expect(html).toContain("width:640px");
    expect(html).toContain("height:720px");
    expect(html).not.toContain("height:12000px");
    expect(html).toContain('class="overflow-hidden absolute"');
  });
});
