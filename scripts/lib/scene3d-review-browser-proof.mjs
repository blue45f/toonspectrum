import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "image-js";

const check = (value, message) => {
  if (!value) throw new Error(message);
};
function compareImages(actual, expected, choose) {
  check(
    actual.width === expected[0].width && actual.height === expected[0].height,
    "Review screenshot size changed.",
  );
  let mismatch = 0,
    samples = 0,
    maxDelta = 0;
  for (let y = 2; y < actual.height - 2; y++)
    for (let x = 2; x < actual.width - 2; x++) {
      const which = choose(x, y, actual.width, actual.height);
      if (which < 0) continue;
      const reference = expected[which];
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(
          actual.data[(y * actual.width + x) * actual.channels + c] -
            reference.data[(y * reference.width + x) * reference.channels + c],
        );
        maxDelta = Math.max(maxDelta, delta);
        if (delta > 2) mismatch++;
        samples++;
      }
    }
  return {
    samples,
    mismatch,
    maxDelta,
    mismatchRatio: mismatch / Math.max(1, samples),
  };
}
export async function verifyScene3dReview(
  page,
  directory,
  prefix,
  options = {},
) {
  const root = page.locator('[data-scene3d-review="true"]');
  await root
    .getByRole("button", { name: /^원본과 비교$|^Compare with source$/ })
    .click();
  let canvas = root.locator(
    'canvas[data-review-ready="true"][data-review-comparison="true"]',
  );
  await canvas.waitFor({ timeout: 60000 });
  await canvas.scrollIntoViewIfNeeded();
  const mode = async (name, value) => {
    await root.getByRole("button", { name }).click();
    await page.waitForFunction(
      (value) =>
        document
          .querySelector('canvas[data-review-ready="true"]')
          ?.getAttribute("data-review-mode") === value,
      value,
    );
  };
  await root.getByRole("button", { name: /^정면$|^Front$/ }).click();
  await root.getByRole("button", { name: /^확대$|^Zoom in$/ }).click();
  await mode(/^원본만$|^Source only$/, "source");
  const originalBytes = await canvas.screenshot({ scale: "css" });
  const original = decodePng(originalBytes);
  writeFileSync(join(directory, `${prefix}-source.png`), originalBytes);
  await mode(/^결과만$|^Result only$/, "result");
  const resultBytes = await canvas.screenshot({ scale: "css" });
  const result = decodePng(resultBytes);
  writeFileSync(join(directory, `${prefix}-result.png`), resultBytes);
  let content = 0;
  let leftContent = 0;
  let rightContent = 0;
  // Ignore DOM labels and border; compare to an actual clear-background pixel inside the viewport.
  const background = (2 * result.width + 2) * result.channels;
  for (let y = 40; y < result.height - 8; y++)
    for (let x = 8; x < result.width - 8; x++) {
      const i = y * result.width + x;
      if (
        [0, 1, 2].some(
          (c) =>
            Math.abs(
              result.data[i * result.channels + c] -
                result.data[background + c],
            ) > 8,
        )
      ) {
        content++;
        if (x < result.width / 2) leftContent++;
        else rightContent++;
      }
    }
  check(
    leftContent > 500 && rightContent > 500,
    "The model must occupy both sides of the split; a blank half cannot certify comparison.",
  );
  await mode(/^분할 비교$|^Wipe comparison$/, "wipe");
  const slider = root.getByRole("slider", {
    name: /비교 분할 위치|Comparison divider/,
  });
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 50; i++) await slider.press("ArrowRight");
  await page.waitForFunction(
    () =>
      document
        .querySelector('canvas[data-review-ready="true"]')
        ?.getAttribute("data-review-divider") === "0.5",
  );
  const wipeBytes = await canvas.screenshot({ scale: "css" });
  writeFileSync(join(directory, `${prefix}-wipe.png`), wipeBytes);
  const wipe = decodePng(wipeBytes);
  const match = compareImages(wipe, [original, result], (x, _y, width) =>
    Math.abs(x - width * 0.5) < 3 ? -1 : x < width * 0.5 ? 0 : 1,
  );
  check(
    match.mismatchRatio < 0.001,
    `Split preview does not match the same-camera full images: ${JSON.stringify(match)}`,
  );
  const measurements = await root
    .locator('[data-scene3d-review-measurements="true"]')
    .innerText();
  check(
    /1,472/.test(measurements),
    "The comparison omitted actual source geometry metrics.",
  );
  await root.getByRole("button", { name: /와이어프레임|Wireframe/ }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('canvas[data-review-ready="true"]')
        ?.getAttribute("data-review-wireframe") === "true",
  );
  const wireBytes = await canvas.screenshot({ scale: "css" });
  writeFileSync(join(directory, `${prefix}-wireframe.png`), wireBytes);
  const wire = compareImages(decodePng(wireBytes), [wipe], () => 0);
  check(
    wire.mismatch > 500,
    "Wireframe did not alter the actual rendered model.",
  );
  await root.getByRole("button", { name: /와이어프레임|Wireframe/ }).click();
  if (options.switchArtifactIndex !== undefined) {
    await mode(/^원본만$|^Source only$/, "source");
    const before = decodePng(await canvas.screenshot({ scale: "css" }));
    const currentName = await canvas.getAttribute("data-review-artifact");
    await page
      .getByRole("button", { name: /^미리보기$|^Preview$/ })
      .nth(options.switchArtifactIndex)
      .click();
    await page.waitForFunction(
      (old) => {
        const canvas = document.querySelector(
          'canvas[data-review-ready="true"]',
        );
        return (
          canvas &&
          canvas.getAttribute("data-review-artifact") !== old &&
          canvas.getAttribute("data-review-mode") === "source"
        );
      },
      currentName,
      { timeout: 60000 },
    );
    canvas = root.locator('canvas[data-review-ready="true"]');
    await canvas.scrollIntoViewIfNeeded();
    const after = decodePng(await canvas.screenshot({ scale: "css" }));
    const pose = compareImages(after, [before], () => 0);
    check(
      pose.mismatchRatio < 0.001,
      `LOD switch changed the common source camera: ${JSON.stringify(pose)}`,
    );
    options.cameraRetention = pose;
  }
  check(
    (await root.locator("canvas").count()) === 1,
    "Source and result created competing canvases.",
  );
  await root
    .getByRole("button", { name: /비교 종료|Close comparison/ })
    .click();
  await root
    .locator('canvas[data-review-ready="true"][data-review-comparison="false"]')
    .waitFor({ timeout: 60000 });
  return {
    sameProjectionPixels: match,
    wireframeChangedPixels: wire.mismatch,
    renderedContentPixels: content,
    contentPerHalf: { left: leftContent, right: rightContent },
    measurements,
    sourceLoadedExplicitly: true,
    singleCanvas: true,
    ...(options.cameraRetention
      ? { cameraRetainedAcrossLods: options.cameraRetention }
      : {}),
  };
}
