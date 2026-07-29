import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportStudioPageToWillV1,
  STUDIO_WILL_V1_EXPORT_DISCLAIMER,
} from "./studio-will-v1-export-bridge";
import {
  STUDIO_WILL_V1_OPC_ASSURANCE,
} from "./studio-will-v1-opc-interchange";

import type { DrawEl } from "./studio-element-model";

const buildStudioWillV1OpcBytesInWorker = vi.fn();

vi.mock("./studio-will-v1-opc-worker-client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./studio-will-v1-opc-worker-client")
  >();
  return {
    ...actual,
    buildStudioWillV1OpcBytesInWorker,
  };
});

function draw(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "stroke-1",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [10, 20, 30, 40],
    pressures: [0.25, 1],
    pressureModel: "linear-full-v1",
    stroke: "#336699",
    strokeWidth: 8,
    opacity: 0.5,
    ...overrides,
  };
}

beforeEach(() => {
  buildStudioWillV1OpcBytesInWorker.mockReset();
  buildStudioWillV1OpcBytesInWorker.mockResolvedValue({
    bytes: Uint8Array.from([80, 75, 3, 4]),
    paths: [],
    loss: {
      status: "exact",
      quantization: "truncate-toward-zero",
      items: [],
    },
    assurance: STUDIO_WILL_V1_OPC_ASSURANCE,
  });
});

describe("Studio WILL v1 page export bridge", () => {
  it("lazily maps visible pressure freehand into the bounded Worker profile", async () => {
    const result = await exportStudioPageToWillV1({
      width: 800,
      height: 1_200,
      title: "Episode 1",
      elements: [
        draw(),
        draw({ id: "hidden", hidden: true }),
        draw({ id: "eraser", mode: "eraser" }),
        draw({ id: "shape", kind: "rect" }),
      ],
    });

    expect(buildStudioWillV1OpcBytesInWorker).toHaveBeenCalledTimes(1);
    const [input] = buildStudioWillV1OpcBytesInWorker.mock.calls[0]!;
    expect(input).toMatchObject({
      width: 800,
      height: 1_200,
      title: "Episode 1",
      application: "ToonSpectrum",
      paths: [{
        points: [
          { x: 10, y: 20 },
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 30, y: 40 },
        ],
        strokeWidths: [2, 2, 8, 8],
        strokeColor: { r: 51, g: 102, b: 153, a: 128 },
        decimalPrecision: 2,
      }],
    });
    expect(result).toMatchObject({
      bytes: Uint8Array.from([80, 75, 3, 4]),
      extension: ".will",
      mediaType: "application/vnd.toonspectrum.will-v1-bounded+zip",
      exportedStrokeIds: ["stroke-1"],
      skipped: [
        { elementId: "hidden", reason: "hidden-element" },
        {
          elementId: "eraser",
          reason: "eraser-semantic-not-representable",
        },
        { elementId: "shape", reason: "non-freehand-shape" },
      ],
      disclaimer: STUDIO_WILL_V1_EXPORT_DISCLAIMER,
      assurance: {
        vendorCertified: false,
        vendorTrademarkAuthorized: false,
      },
    });
  });

  it("pads single-point ink and explicitly reports zero-width profile adaptation", async () => {
    const result = await exportStudioPageToWillV1({
      width: 100,
      height: 100,
      title: "",
      elements: [
        draw({
          id: "dot",
          points: [5, 7],
          pressures: [0],
          strokeWidth: 4,
        }),
      ],
    });
    const [input] = buildStudioWillV1OpcBytesInWorker.mock.calls[0]!;
    expect(input.title).toBe("Untitled");
    expect(input.paths[0].points).toHaveLength(4);
    expect(input.paths[0].strokeWidths).toEqual([0.01, 0.01, 0.01, 0.01]);
    expect(result.adaptations).toEqual([{
      elementId: "dot",
      reason: "zero-width-clamped-to-profile-minimum",
      count: 1,
    }]);
  });

  it("fails before loading the Worker when no representable freehand remains", async () => {
    await expect(
      exportStudioPageToWillV1({
        width: 100,
        height: 100,
        title: "Empty",
        elements: [
          draw({ id: "eraser", mode: "eraser" }),
          draw({ id: "bad-color", stroke: "not-a-color" }),
        ],
      })
    ).rejects.toThrow(/보이는 펜 자유곡선이 없어요/u);
    expect(buildStudioWillV1OpcBytesInWorker).not.toHaveBeenCalled();
  });
});
