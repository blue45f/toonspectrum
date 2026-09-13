import { expect, test } from "@playwright/test";

test("cached video text matches direct canvas rendering, survives seeking, and bounds memory", async ({ page }, testInfo) => {
  await page.route("**/api/studio-ai/status", (route) => route.fulfill({ json: { configured: false } }));
  await page.goto("/tools/browser-harnesses/promo-e2e.html");
  await expect(page.locator("#promo-work-title")).toBeEnabled();
  const result = await page.evaluate(async () => {
    const modelPath = "/src/domains/creator/promo/promo-model.ts";
    const canvasPath = "/src/domains/creator/promo/promo-canvas.ts";
    const model = await import(/* @vite-ignore */ modelPath) as typeof import("../apps/web/src/domains/creator/promo/promo-model");
    const renderer = await import(/* @vite-ignore */ canvasPath) as typeof import("../apps/web/src/domains/creator/promo/promo-canvas");
    const artwork = document.createElement("canvas"); artwork.width = 600; artwork.height = 900;
    const painter = artwork.getContext("2d")!;
    painter.fillStyle = "#233e57"; painter.fillRect(0, 0, 600, 900);
    painter.fillStyle = "#eaaf7a"; painter.fillRect(170, 200, 230, 500);
    const image = new Image(); image.src = artwork.toDataURL("image/png"); await image.decode();
    const project = { ...model.emptyPromoProject(), title: "별빛 아래 우리의 이야기",
      panels: [{ id: "one", src: image.src, description: "", caption: "우리가 다시 만나는 순간, 새로운 이야기가 시작됩니다.",
        motion: "push-in" as const, fit: "cover" as const, weight: 1 }] };
    const images = new Map([["one", image]]);
    const target = document.createElement("canvas"); target.width = 360; target.height = 640;
    const reference = document.createElement("canvas"); reference.width = 360; reference.height = 640;
    const ctx = target.getContext("2d", { alpha: false })!;
    const ref = reference.getContext("2d", { alpha: false })!;
    const tiles: HTMLCanvasElement[] = [];
    let measurements = 0;
    const owner = { createElement: () => { const tile = document.createElement("canvas"); tiles.push(tile); return tile; } };
    const wrap = (context: CanvasRenderingContext2D, cached: boolean) => new Proxy(context, {
      get(object, key) {
        if (key === "canvas") return { ownerDocument: cached ? owner : undefined };
        if (key === "measureText") return (value: string) => { measurements += 1; return object.measureText(value); };
        const value = Reflect.get(object, key, object) as unknown;
        return typeof value === "function" ? value.bind(object) : value;
      },
      set(object, key, value: unknown) { return Reflect.set(object, key, value, object); },
    });
    const cached = wrap(ctx, true); const direct = wrap(ref, false);
    renderer.drawPromoFrame(cached, project, images, 90, 360, 640);
    const firstMeasurements = measurements;
    renderer.drawPromoFrame(cached, project, images, 90, 360, 640);
    const repeatedMeasurements = measurements - firstMeasurements;
    let maxMeanError = 0; let cases = 0;
    for (const ratio of ["9:16", "16:9", "1:1"] as const) {
      const size = model.promoSize(ratio, 360);
      target.width = reference.width = size.width; target.height = reference.height = size.height;
      for (const captionStyle of ["classic", "boxed", "typewriter"] as const) {
        for (const frame of [0, 90, 420, 449, 30]) {
          const variant = { ...project, ratio, presentation: { ...model.PROMO_DEFAULT_PRESENTATION, captionStyle } };
          renderer.drawPromoFrame(cached, variant, images, frame, size.width, size.height);
          renderer.drawPromoFrame(direct, variant, images, frame, size.width, size.height);
          const actual = ctx.getImageData(0, 0, size.width, size.height).data;
          const expected = ref.getImageData(0, 0, size.width, size.height).data;
          let difference = 0;
          for (let i = 0; i < actual.length; i += 1) difference += Math.abs(actual[i]! - expected[i]!);
          maxMeanError = Math.max(maxMeanError, difference / actual.length);
          cases += 1;
        }
      }
    }
    for (let i = 0; i < 150; i += 1) {
      renderer.drawPromoFrame(cached, { ...project, title: `수정된 작품 제목 ${i}` }, images, 90, target.width, target.height);
    }
    const alive = tiles.filter((tile) => tile.width > 0 && tile.height > 0);
    const allocatedPixels = alive.reduce((sum, tile) => sum + tile.width * tile.height, 0);
    renderer.releasePromoTextCache(cached);
    const released = tiles.every((tile) => tile.width === 0 && tile.height === 0);
    return { firstMeasurements, repeatedMeasurements, maxMeanError, cases,
      alive: alive.length, allocatedPixels, evicted: tiles.length - alive.length, released };
  });
  await testInfo.attach("renderer-quality.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  expect(result.firstMeasurements).toBeGreaterThan(0);
  expect(result.repeatedMeasurements).toBe(0);
  expect(result.cases).toBe(45);
  // Allow subpixel alpha roundoff, not missing/clipped text or changed typography.
  expect(result.maxMeanError).toBeLessThan(0.3);
  expect(result.alive).toBeLessThanOrEqual(16);
  expect(result.allocatedPixels).toBeLessThanOrEqual(2_000_000);
  expect(result.evicted).toBeGreaterThan(100);
  expect(result.released).toBe(true);
});
