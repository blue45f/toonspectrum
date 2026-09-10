export const STUDIO_3D_AUDIT_MIN_VISIBLE_IMAGE_EDGE = 48;
export const STUDIO_3D_AUDIT_CANVAS_BITMAP_RATIO = 0.9;
export const STUDIO_3D_AUDIT_IMAGE_SAMPLE_RATIO = 0.75;

export function classifyStudio3dCanvas(sample) {
  if (!sample?.visible || sample.cssWidth < 64 || sample.cssHeight < 64) {
    return Object.freeze({ ...sample, relevant: false, potentiallyBlurry: false });
  }
  const effectiveDpr = Math.min(Math.max(sample.deviceScaleFactor || 1, 1), 2);
  const requiredWidth = Math.ceil(sample.cssWidth * effectiveDpr);
  const requiredHeight = Math.ceil(sample.cssHeight * effectiveDpr);
  const widthRatio = requiredWidth > 0 ? sample.bitmapWidth / requiredWidth : 1;
  const heightRatio = requiredHeight > 0 ? sample.bitmapHeight / requiredHeight : 1;
  return Object.freeze({
    ...sample,
    relevant: true,
    effectiveDpr,
    requiredWidth,
    requiredHeight,
    widthRatio,
    heightRatio,
    potentiallyBlurry:
      widthRatio < STUDIO_3D_AUDIT_CANVAS_BITMAP_RATIO
      || heightRatio < STUDIO_3D_AUDIT_CANVAS_BITMAP_RATIO,
  });
}

export function classifyStudio3dImage(sample) {
  const relevant = Boolean(
    sample?.visible
    && sample.displayedWidth >= STUDIO_3D_AUDIT_MIN_VISIBLE_IMAGE_EDGE
    && sample.displayedHeight >= STUDIO_3D_AUDIT_MIN_VISIBLE_IMAGE_EDGE,
  );
  if (!relevant) {
    return Object.freeze({ ...sample, relevant: false, broken: false, potentiallyUpscaled: false });
  }
  const effectiveDpr = Math.min(Math.max(sample.deviceScaleFactor || 1, 1), 2);
  const broken = Boolean(
    sample.complete
    && (!Number.isFinite(sample.naturalWidth) || sample.naturalWidth <= 0
      || !Number.isFinite(sample.naturalHeight) || sample.naturalHeight <= 0),
  );
  const requiredWidth = sample.displayedWidth * effectiveDpr;
  const requiredHeight = sample.displayedHeight * effectiveDpr;
  return Object.freeze({
    ...sample,
    relevant: true,
    effectiveDpr,
    broken,
    potentiallyUpscaled:
      !broken
      && sample.complete
      && (sample.naturalWidth < requiredWidth * STUDIO_3D_AUDIT_IMAGE_SAMPLE_RATIO
        || sample.naturalHeight < requiredHeight * STUDIO_3D_AUDIT_IMAGE_SAMPLE_RATIO),
  });
}

export function summarizeStudio3dProductionAudit(targets) {
  const summary = {
    navigationFailures: 0,
    pageErrors: 0,
    consoleErrors: 0,
    failedRequests: 0,
    httpErrors: 0,
    brokenImages: 0,
    upscaledImages: 0,
    blurryCanvases: 0,
    relevantCanvases: 0,
    webglTargets: 0,
    threeDEntrypoints: 0,
  };
  for (const target of targets ?? []) {
    summary.navigationFailures += target.navigationError ? 1 : 0;
    summary.pageErrors += target.pageErrors?.length ?? 0;
    summary.consoleErrors += target.consoleErrors?.length ?? 0;
    summary.failedRequests += target.failedRequests?.length ?? 0;
    summary.httpErrors += target.httpErrors?.length ?? 0;
    summary.brokenImages += target.images?.filter((item) => item.relevant && item.broken).length ?? 0;
    summary.upscaledImages += target.images?.filter((item) => item.relevant && item.potentiallyUpscaled).length ?? 0;
    summary.blurryCanvases += target.canvases?.filter((item) => item.relevant && item.potentiallyBlurry).length ?? 0;
    summary.relevantCanvases += target.canvases?.filter((item) => item.relevant).length ?? 0;
    summary.webglTargets += target.webgl?.available ? 1 : 0;
    summary.threeDEntrypoints = Math.max(summary.threeDEntrypoints, target.threeDEntrypoints?.length ?? 0);
  }
  return Object.freeze(summary);
}

export function studio3dProductionAuditFailures(summary) {
  const failures = [];
  if (summary.navigationFailures > 0) failures.push(`${summary.navigationFailures} navigation failure(s)`);
  if (summary.pageErrors > 0) failures.push(`${summary.pageErrors} uncaught page error(s)`);
  if (summary.brokenImages > 0) failures.push(`${summary.brokenImages} broken visible image(s)`);
  if (summary.blurryCanvases > 0) failures.push(`${summary.blurryCanvases} undersized visible canvas bitmap(s)`);
  if (summary.webglTargets === 0) failures.push("WebGL unavailable on every audit target");
  return Object.freeze(failures);
}
