import { initializeCanvas, readPsd } from "ag-psd";
import { describe, expect, it } from "vitest";

import {
  BG3D_MULTIPASS_PSD_LAYER_LABELS,
  BG3D_MULTIPASS_PSD_LAYER_ORDER,
  buildBg3dMultiPassPsd,
  composeBg3dMultiPassLayers,
  compositeMultiplyBlend,
  compositeMultiPassPsdPreview,
  compositeSourceOver,
  multiPassPsdResultMessage,
  type Bg3dMultiPassPsdLayerInput,
} from "./studio-bg3d-multipass-psd";

/**
 * `readPsd` decodes layer pixels through the DOM canvas even in `useImageData` mode.
 * The shim hands it a plain `ImageData` so the round trip can assert real structure
 * under `environment: node`.
 */
initializeCanvas(
  (): HTMLCanvasElement => {
    throw new Error("PSD 검증에서는 캔버스를 만들지 않습니다.");
  },
  (width: number, height: number): ImageData => ({
    colorSpace: "srgb",
    data: new Uint8ClampedArray(width * height * 4),
    height,
    width,
  }),
);

const WIDTH = 4;
const HEIGHT = 2;
const PIXELS = WIDTH * HEIGHT;

function rgba(fill: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(PIXELS * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * WIDTH + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return out;
}

const ink = (a: number): [number, number, number, number] => [20, 16, 14, a];
const white = (a: number): [number, number, number, number] => [255, 255, 255, a];
const gray = (v: number, a: number): [number, number, number, number] => [v, v, v, a];

function pixelOf(data: Uint8ClampedArray, x: number, y: number): [number, number, number, number] {
  const i = (y * WIDTH + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe("compositeSourceOver", () => {
  it("불투명 상위가 하위를 완전히 덮는다", () => {
    const base = rgba(() => [10, 20, 30, 255]);
    const top = rgba(() => [200, 100, 50, 255]);
    const out = compositeSourceOver(base, top);
    expect(pixelOf(out, 0, 0)).toEqual([200, 100, 50, 255]);
  });

  it("반투명 상위는 알파로 혼합된다", () => {
    const base = rgba(() => [0, 0, 0, 255]);
    const top = rgba(() => [255, 255, 255, 128]);
    const out = compositeSourceOver(base, top);
    const [r, , , a] = pixelOf(out, 1, 0);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
  });

  it("크기가 다르면 실패한다", () => {
    expect(() => compositeSourceOver(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toThrow(TypeError);
  });
});

describe("compositeMultiplyBlend", () => {
  it("흰색 음영은 베이스를 바꾸지 않는다", () => {
    const base = rgba(() => [120, 60, 30, 255]);
    const shade = rgba(() => white(255));
    const out = compositeMultiplyBlend(base, shade);
    expect(pixelOf(out, 0, 0)).toEqual([120, 60, 30, 255]);
  });

  it("회색 음영은 베이스를 어둡게 한다", () => {
    const base = rgba(() => [200, 200, 200, 255]);
    const shade = rgba(() => gray(128, 255));
    const out = compositeMultiplyBlend(base, shade);
    const [r] = pixelOf(out, 0, 0);
    expect(r).toBeGreaterThan(90);
    expect(r).toBeLessThan(110);
  });

  it("투명 음영 픽셀은 베이스를 유지한다", () => {
    const base = rgba(() => [90, 80, 70, 255]);
    const shade = rgba(() => gray(0, 0));
    const out = compositeMultiplyBlend(base, shade);
    expect(pixelOf(out, 2, 1)).toEqual([90, 80, 70, 255]);
  });
});

describe("composeBg3dMultiPassLayers", () => {
  it("장면 패스만으로 표준 4레이어를 만든다", () => {
    const result = composeBg3dMultiPassLayers({
      width: WIDTH,
      height: HEIGHT,
      scene: {
        mainLine: rgba((x) => (x === 0 ? ink(255) : [0, 0, 0, 0])),
        textureLine: rgba((x) => (x === 1 ? ink(128) : [0, 0, 0, 0])),
        tone: rgba(() => gray(160, 255)),
        color: rgba(() => [240, 200, 160, 255]),
        background: rgba(() => [135, 206, 235, 255]),
      },
    });
    expect(result.layers.map((layer) => layer.id)).toEqual(["line", "shade", "flat", "background"]);
    expect(result.skipped).toEqual([]);
    expect(result.includedCharacter).toBe(false);
    // 선화: x=0은 주선(255), x=1은 질감선(128) — 가장 진한 획 유지
    const line = result.layers[0].rgba;
    expect(pixelOf(line, 0, 0)[3]).toBe(255);
    expect(pixelOf(line, 1, 0)[3]).toBe(128);
    expect(pixelOf(line, 2, 0)[3]).toBe(0);
  });

  it("캐릭터 패스를 같은 구조에 합성한다", () => {
    const result = composeBg3dMultiPassLayers({
      width: WIDTH,
      height: HEIGHT,
      scene: {
        mainLine: rgba((x) => (x === 0 ? ink(255) : [0, 0, 0, 0])),
        color: rgba(() => [240, 200, 160, 255]),
        background: rgba(() => [135, 206, 235, 255]),
      },
      characterPasses: [
        { id: "line", rgba: rgba((x) => (x === 3 ? ink(200) : [0, 0, 0, 0])) },
        { id: "shadow", rgba: rgba(() => gray(120, 255)) },
        { id: "flat", rgba: rgba((x) => (x >= 2 ? [250, 220, 180, 255] : [0, 0, 0, 0])) },
      ],
    });
    expect(result.includedCharacter).toBe(true);
    expect(result.layers.map((layer) => layer.id)).toEqual(["line", "shade", "flat", "background"]);
    // 캐릭터 밑색이 장면 컬러 위에 얹힌다
    const flat = result.layers.find((layer) => layer.id === "flat")!.rgba;
    expect(pixelOf(flat, 3, 0).slice(0, 3)).toEqual([250, 220, 180]);
    expect(pixelOf(flat, 0, 0).slice(0, 3)).toEqual([240, 200, 160]);
    // 캐릭터 선화가 합쳐진다
    const line = result.layers.find((layer) => layer.id === "line")!.rgba;
    expect(pixelOf(line, 3, 1)[3]).toBe(200);
  });

  it("캐릭터 하이라이트는 4레이어 예산상 건너뜀으로 기록한다", () => {
    const result = composeBg3dMultiPassLayers({
      width: WIDTH,
      height: HEIGHT,
      scene: { color: rgba(() => [240, 200, 160, 255]) },
      characterPasses: [{ id: "highlight", rgba: rgba(() => white(255)) }],
    });
    expect(result.skipped.some((entry) => entry.pass === "highlight")).toBe(true);
    expect(result.skipped.some((entry) => entry.pass === "background")).toBe(true);
    expect(result.skipped.some((entry) => entry.pass === "line")).toBe(true);
  });

  it("모든 패스가 비면 에러로 실패한다(빈 레이어 위조 금지)", () => {
    expect(() =>
      composeBg3dMultiPassLayers({ width: WIDTH, height: HEIGHT, scene: {} }),
    ).toThrow("PSD로 저장할 레이어가 없습니다");
  });

  it("크기가 다른 패스는 실패한다", () => {
    expect(() =>
      composeBg3dMultiPassLayers({
        width: WIDTH,
        height: HEIGHT,
        scene: { color: new Uint8ClampedArray(4) },
      }),
    ).toThrow(TypeError);
  });
});

describe("compositeMultiPassPsdPreview", () => {
  it("배경→밑색→음영(multiply)→선화 순서로 합성한다", () => {
    const layers: Bg3dMultiPassPsdLayerInput[] = [
      { id: "line", rgba: rgba((x) => (x === 0 ? ink(255) : [0, 0, 0, 0])) },
      { id: "shade", rgba: rgba(() => gray(128, 255)) },
      { id: "flat", rgba: rgba(() => [200, 200, 200, 255]) },
      { id: "background", rgba: rgba(() => [10, 10, 10, 255]) },
    ];
    const out = compositeMultiPassPsdPreview(WIDTH, HEIGHT, layers);
    // x=0: 선화가 덮음
    expect(pixelOf(out, 0, 0).slice(0, 3)).toEqual([20, 16, 14]);
    // x=1: 밑색(200)에 음영 multiply(128/255) → 약 100
    const [r] = pixelOf(out, 1, 0);
    expect(r).toBeGreaterThan(90);
    expect(r).toBeLessThan(112);
  });

  it("visible 집합으로 레이어를 끌 수 있다", () => {
    const layers: Bg3dMultiPassPsdLayerInput[] = [
      { id: "line", rgba: rgba(() => ink(255)) },
      { id: "background", rgba: rgba(() => [10, 20, 30, 255]) },
    ];
    const out = compositeMultiPassPsdPreview(WIDTH, HEIGHT, layers, new Set(["background"]));
    expect(pixelOf(out, 0, 0).slice(0, 3)).toEqual([10, 20, 30]);
  });
});

describe("buildBg3dMultiPassPsd", () => {
  function sceneLayers(): Bg3dMultiPassPsdLayerInput[] {
    const composed = composeBg3dMultiPassLayers({
      width: WIDTH,
      height: HEIGHT,
      scene: {
        mainLine: rgba((x) => (x === 0 ? ink(255) : [0, 0, 0, 0])),
        tone: rgba(() => gray(160, 255)),
        color: rgba(() => [240, 200, 160, 255]),
        background: rgba(() => [135, 206, 235, 255]),
      },
    });
    return [...composed.layers];
  }

  it("8BPS 시그니처의 PSD를 만들고 레이어명을 기록한다", () => {
    const layers = sceneLayers();
    const result = buildBg3dMultiPassPsd({ title: "테스트컷", width: WIDTH, height: HEIGHT, layers });
    expect(result.blob.type).toBe("image/vnd.adobe.photoshop");
    expect(result.receipt.layerNames).toEqual(BG3D_MULTIPASS_PSD_LAYER_ORDER.map((id) => BG3D_MULTIPASS_PSD_LAYER_LABELS[id]));
    expect(result.receipt.width).toBe(WIDTH);
    expect(result.receipt.height).toBe(HEIGHT);
    expect(result.receipt.byteLength).toBeGreaterThan(0);
  });

  it("readPsd로 레이어 구조·블렌드·숨김을 왕복 검증한다", async () => {
    const layers = sceneLayers();
    const result = buildBg3dMultiPassPsd({
      title: "테스트컷",
      width: WIDTH,
      height: HEIGHT,
      layers,
      hiddenLayerIds: new Set(["shade"]),
    });
    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    expect(buffer[0]).toBe(0x38);
    expect(buffer[1]).toBe(0x42);
    expect(buffer[2]).toBe(0x50);
    expect(buffer[3]).toBe(0x53);
    const psd = readPsd(buffer.buffer, { useImageData: true });
    expect(psd.width).toBe(WIDTH);
    expect(psd.height).toBe(HEIGHT);
    expect(psd.children?.length).toBe(4);
    expect(psd.children?.map((layer) => layer.name)).toEqual(
      BG3D_MULTIPASS_PSD_LAYER_ORDER.map((id) => BG3D_MULTIPASS_PSD_LAYER_LABELS[id]),
    );
    expect(psd.children?.map((layer) => layer.blendMode)).toEqual(["normal", "multiply", "normal", "normal"]);
    expect(psd.children?.[1].hidden).toBe(true);
    expect(psd.children?.[0].hidden).not.toBe(true);
  });

  it("레이어가 없으면 실패한다", () => {
    expect(() => buildBg3dMultiPassPsd({ title: "x", width: WIDTH, height: HEIGHT, layers: [] })).toThrow();
  });

  it("캔버스 예산을 넘으면 실패한다", () => {
    // 1449×1449 = 2,099,601px > 2,097,152px 예산
    const big = new Uint8ClampedArray(1449 * 1449 * 4);
    big[3] = 255;
    const layers: Bg3dMultiPassPsdLayerInput[] = [{ id: "flat", rgba: big }];
    expect(() =>
      buildBg3dMultiPassPsd({ title: "x", width: 1449, height: 1449, layers }),
    ).toThrow("2,097,152");
  });

  it("크기가 맞지 않는 레이어는 예산 검사 전에 실패한다", () => {
    const layers = sceneLayers();
    expect(() =>
      buildBg3dMultiPassPsd({ title: "x", width: 4096, height: 4096, layers }),
    ).toThrow("크기가 4096×4096와 맞지 않습니다");
  });

  it("hidden 레이어도 영수증에는 모두 기록된다", () => {
    const layers = sceneLayers();
    const result = buildBg3dMultiPassPsd({
      title: "x",
      width: WIDTH,
      height: HEIGHT,
      layers,
      hiddenLayerIds: new Set(["line", "shade", "flat", "background"]),
    });
    expect(result.receipt.layerNames).toHaveLength(4);
  });
});

describe("multiPassPsdResultMessage", () => {
  it("레이어 수와 캐릭터 합성 여부를 요약한다", () => {
    expect(
      multiPassPsdResultMessage({
        width: 4,
        height: 2,
        layerNames: ["a", "b"],
        skipped: [{ pass: "background", reason: "없음" }],
        byteLength: 10,
        includedCharacter: true,
      }),
    ).toBe("PSD 저장 완료 — 레이어 2개 · 캐릭터 합성 포함 · 건너뜀 1건");
  });
});
