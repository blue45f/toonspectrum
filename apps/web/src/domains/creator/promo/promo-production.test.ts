import { describe, expect, it } from "vitest";

import { emptyPromoProject, parsePromoProject, promoCameraAt, promoShotList, PROMO_CAMERA_EASINGS } from "./promo-model";
import { promoPreflight } from "./promo-preflight";
import { promoRemotionFiles } from "./promo-remotion";
import { promoGutterCuts } from "./promo-split";

import type { PromoCamera, PromoPanel } from "./promo-model";

const camera: PromoCamera = { from: { x: 0.1, y: 0.2, zoom: 1 }, to: { x: 0.9, y: 0.8, zoom: 2 }, easing: "smooth" };
const panel: PromoPanel = { id: "scene1", src: "data:image/png;base64,aA==", description: "주인공", caption: "다시 만나는 순간", motion: "push-in", weight: 1, fit: "contain", camera };
const project = () => ({ ...emptyPromoProject(), panels: [{ ...panel }] });

describe("keyframe camera", () => {
  it.each(Object.keys(PROMO_CAMERA_EASINGS) as PromoCamera["easing"][])("%s interpolates endpoints monotonically and independently of seek order", (easing) => {
    const value = { ...camera, easing };
    expect(promoCameraAt(value, 0)).toEqual(camera.from);
    expect(promoCameraAt(value, 1).zoom).toBe(camera.to.zoom);
    const samples = Array.from({ length: 101 }, (_, index) => promoCameraAt(value, index / 100).zoom);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(promoCameraAt(value, 0.2)).toEqual(promoCameraAt(value, 0.2));
    expect(promoCameraAt(value, 0.9, true)).toEqual(camera.from);
    expect(promoCameraAt(value, -1)).toEqual(camera.from);
    expect(promoCameraAt(value, 2)).toEqual(promoCameraAt(value, 1));
    expect(promoCameraAt(value, Number.NaN)).toEqual(camera.from);
  });
  it("round trips with old projects and includes camera metadata in both exports", () => {
    const value = project();
    expect(parsePromoProject(value).panels[0]?.camera).toEqual(camera);
    const legacy = { ...value, panels: [{ ...panel, camera: undefined }] };    expect(parsePromoProject(legacy).panels[0]?.camera).toBeUndefined();
    expect(JSON.parse(promoShotList(value)).scenes[0].camera).toEqual(camera);
    const files = promoRemotionFiles(value, {
      model: "model",
      canvas: "canvas",
      voiceStudioModel: "voice-studio-model",
    });
    expect(JSON.parse(String(files["project.json"])).panels[0].camera).toEqual(camera);
    expect(promoShotList(value)).not.toContain("base64");
  });
  it.each([null, {}, { ...camera, easing: "bounce" }, { ...camera, from: { x: -0.1, y: 0, zoom: 1 } }, { ...camera, to: { x: 0, y: 1.1, zoom: 1 } }, { ...camera, to: { x: 0, y: 1, zoom: 4 } }, { ...camera, from: { x: 0, y: 1, zoom: Number.NaN } }])("rejects malformed or unsafe framing: %j", (invalid) => {
    expect(() => parsePromoProject({ ...project(), panels: [{ ...panel, camera: invalid }] })).toThrow();
  });
});

function artwork(gutters: [number, number][], transparent = false) {
  const width = 100; const height = 420;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const blank = gutters.some(([from, to]) => y >= from && y < to);
    const offset = (y * width + x) * 4;
    data[offset] = blank ? 255 : 25; data[offset + 1] = blank ? 255 : 40;
    data[offset + 2] = blank ? 255 : 60; data[offset + 3] = blank && transparent ? 0 : 255;
  }
  return { width, height, data };
}

describe("conservative gutter splitting", () => {
  it.each([false, true])("splits whitespace without losing source pixels, transparency=%s", (transparent) => {
    const cuts = promoGutterCuts(artwork([[120, 140], [260, 280]], transparent), 840);
    expect(cuts).toEqual([0, 260, 540, 840]);
    expect(cuts.slice(1).reduce((total, end, index) => total + end - cuts[index]!, 0)).toBe(840);
  });  it("keeps ambiguous or blank manuscripts intact", () => {
    expect(promoGutterCuts(artwork([]), 420)).toEqual([0, 420]);
    expect(promoGutterCuts(artwork([[0, 420]]), 420)).toEqual([0, 420]);
    expect(promoGutterCuts(artwork([[120, 121]]), 420)).toEqual([0, 420]);
    expect(promoGutterCuts(artwork([[0, 20], [400, 420]]), 420)).toEqual([0, 420]);
  });
  it("reports overflow without dropping panels", () => {
    expect(() => promoGutterCuts(artwork([[120, 140], [260, 280]]), 840, 2)).toThrow(/남은 공간/u);
  });
  it("rejects incomplete analysis data", () => {
    expect(() => promoGutterCuts({ width: 2, height: 2, data: [0] }, 10)).toThrow();
    expect(() => promoGutterCuts(artwork([]), 10)).toThrow();
    expect(() => promoGutterCuts(artwork([]), 420, 0)).toThrow();
  });
});

describe("editorial export preflight", () => {
  it("reports missing panels without blocking intentional silent exports", () => {
    expect(promoPreflight(emptyPromoProject())).toContainEqual(expect.objectContaining({ id: "no-panels", severity: "error" }));
    expect(promoPreflight(project()).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(promoPreflight(project())).toContainEqual(expect.objectContaining({ id: "silent", severity: "warning" }));
  });
  it("locates fast, long and cropped subtitles", () => {
    const issues = promoPreflight({ ...project(), panels: Array.from({ length: 12 }, (_, index) => ({ ...panel, id: `cut${index}`, caption: "가".repeat(100), fit: "cover" })) });
    expect(issues.filter((issue) => issue.id.startsWith("reading-"))).toHaveLength(12);
    expect(issues.filter((issue) => issue.id.startsWith("caption-"))).toHaveLength(12);
    expect(issues.filter((issue) => issue.id.startsWith("crop-"))).toHaveLength(12);
    expect(issues.find((issue) => issue.id === "reading-cut0")?.frame).toBe(0);
  });
  it("distinguishes voice outside the video from a trimmed ending", () => {
    const voiceover = { src: "data:audio/wav;base64,aA==", volume: 1, startSec: 16, durationSec: 2 };
    expect(promoPreflight({ ...project(), voiceover })).toContainEqual(expect.objectContaining({ id: "voice-outside" }));
    expect(promoPreflight({ ...project(), voiceover: { ...voiceover, startSec: 14 } })).toContainEqual(expect.objectContaining({ id: "voice-trimmed" }));
    expect(promoPreflight({ ...project(), voiceover: { ...voiceover, volume: 0 } }).some((issue) => issue.id.startsWith("voice-"))).toBe(false);
  });
});
