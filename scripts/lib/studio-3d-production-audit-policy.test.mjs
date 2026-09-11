import assert from "node:assert/strict";
import { test } from "vitest";

import {
  classifyStudio3dCanvas,
  classifyStudio3dImage,
  studio3dProductionAuditFailures,
  summarizeStudio3dProductionAudit,
} from "./studio-3d-production-audit-policy.mjs";

test("canvas quality uses a deliberate 2x audit ceiling on high-DPR devices", () => {
  const sample = classifyStudio3dCanvas({
    visible: true,
    cssWidth: 500,
    cssHeight: 300,
    bitmapWidth: 1_000,
    bitmapHeight: 600,
    deviceScaleFactor: 3,
  });
  assert.equal(sample.effectiveDpr, 2);
  assert.equal(sample.potentiallyBlurry, false);
});

test("canvas quality flags a materially undersized backing store", () => {
  const sample = classifyStudio3dCanvas({
    visible: true,
    cssWidth: 1_000,
    cssHeight: 800,
    bitmapWidth: 1_000,
    bitmapHeight: 800,
    deviceScaleFactor: 2,
  });
  assert.equal(sample.potentiallyBlurry, true);
});

test("image quality ignores tiny icons but catches broken and enlarged card art", () => {
  assert.equal(
    classifyStudio3dImage({
      visible: true,
      displayedWidth: 24,
      displayedHeight: 24,
      complete: true,
      naturalWidth: 0,
      naturalHeight: 0,
      deviceScaleFactor: 2,
    }).relevant,
    false,
  );
  const broken = classifyStudio3dImage({
    visible: true,
    displayedWidth: 128,
    displayedHeight: 128,
    complete: true,
    naturalWidth: 0,
    naturalHeight: 0,
    deviceScaleFactor: 2,
  });
  assert.equal(broken.broken, true);
  const upscaled = classifyStudio3dImage({
    visible: true,
    displayedWidth: 256,
    displayedHeight: 256,
    complete: true,
    naturalWidth: 128,
    naturalHeight: 128,
    deviceScaleFactor: 1,
  });
  assert.equal(upscaled.potentiallyUpscaled, true);
});

test("summary and severe failure policy keep warnings separate from blockers", () => {
  const summary = summarizeStudio3dProductionAudit([
    {
      navigationError: null,
      pageErrors: [],
      consoleErrors: ["third-party warning"],
      failedRequests: [{ url: "analytics" }],
      httpErrors: [],
      webgl: { available: true },
      threeDEntrypoints: [{ text: "3D 장면" }],
      images: [
        { relevant: true, broken: false, potentiallyUpscaled: true },
      ],
      canvases: [
        { relevant: true, potentiallyBlurry: false },
      ],
    },
  ]);
  assert.equal(summary.consoleErrors, 1);
  assert.equal(summary.upscaledImages, 1);
  assert.deepEqual(studio3dProductionAuditFailures(summary), []);
});

test("broken visible art, uncaught errors and blurry canvases block the audit", () => {
  const failures = studio3dProductionAuditFailures({
    navigationFailures: 0,
    pageErrors: 1,
    consoleErrors: 0,
    failedRequests: 0,
    httpErrors: 0,
    brokenImages: 2,
    upscaledImages: 0,
    blurryCanvases: 1,
    relevantCanvases: 1,
    webglTargets: 1,
    threeDEntrypoints: 2,
  });
  assert.equal(failures.length, 3);
});
