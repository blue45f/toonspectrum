import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

import {
  classifyStudio3dCanvas,
  classifyStudio3dImage,
  studio3dProductionAuditFailures,
  summarizeStudio3dProductionAudit,
} from "./lib/studio-3d-production-audit-policy.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = option("--url", "https://www.toonstudio.cloud/studio");
const outputDir = path.resolve(option("--output", "artifacts/studio-3d-production-audit"));
const targets = [
  { name: "desktop", viewport: { width: 1_440, height: 1_000 }, deviceScaleFactor: 1 },
  { name: "retina", viewport: { width: 1_440, height: 1_000 }, deviceScaleFactor: 2 },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
];
const entrypointPattern = /(3D|캐릭터|배경|소품|포즈|데생|장면|scene|character|background|mannequin)/iu;

async function inspectPage(page, target) {
  return page.evaluate(({ deviceScaleFactor, sourcePattern }) => {
    const pattern = new RegExp(sourcePattern, "iu");
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== "hidden"
        && style.display !== "none"
        && Number(style.opacity || "1") > 0;
    };

    const canvases = [...document.querySelectorAll("canvas")].map((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      return {
        index,
        visible: isVisible(canvas),
        cssWidth: rect.width,
        cssHeight: rect.height,
        bitmapWidth: canvas.width,
        bitmapHeight: canvas.height,
        deviceScaleFactor,
      };
    });
    const images = [...document.images].map((image, index) => {
      const rect = image.getBoundingClientRect();
      return {
        index,
        visible: isVisible(image),
        src: image.currentSrc || image.src,
        alt: image.alt,
        displayedWidth: rect.width,
        displayedHeight: rect.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        complete: image.complete,
        deviceScaleFactor,
      };
    });
    const interactive = [...document.querySelectorAll(
      'button, a, [role="button"], [role="tab"], [role="menuitem"]',
    )]
      .filter(isVisible)
      .map((element, index) => ({
        index,
        text: (
          element.textContent
          || element.getAttribute("aria-label")
          || element.getAttribute("title")
          || ""
        ).trim().replace(/\s+/gu, " ").slice(0, 160),
        href: element.getAttribute("href"),
      }))
      .filter((entry) => entry.text);

    let webgl = { available: false };
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") || probe.getContext("webgl");
      if (gl) {
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        webgl = {
          available: true,
          version: gl.getParameter(gl.VERSION),
          renderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        };
      }
    } catch (error) {
      webgl = { available: false, error: String(error) };
    }

    return {
      title: document.title,
      location: location.href,
      bodyTextLength: document.body?.innerText.length ?? 0,
      canvases,
      images,
      webgl,
      threeDEntrypoints: interactive.filter((entry) => pattern.test(entry.text)),
    };
  }, { deviceScaleFactor: target.deviceScaleFactor, sourcePattern: entrypointPattern.source });
}

async function openFirstUseful3dSurface(page) {
  const candidates = page.locator(
    'button, a, [role="button"], [role="tab"], [role="menuitem"]',
  );
  const count = Math.min(await candidates.count(), 300);
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const text = (
      (await candidate.textContent().catch(() => ""))
      || (await candidate.getAttribute("aria-label").catch(() => ""))
      || ""
    ).trim().replace(/\s+/gu, " ");
    if (!entrypointPattern.test(text)) continue;
    try {
      await candidate.click({ timeout: 3_000 });
      await page.waitForTimeout(1_500);
      const hasVisibleCanvas = await page.locator("canvas:visible").count().catch(() => 0);
      if (hasVisibleCanvas > 0 || page.url() !== url) return { text, location: page.url() };
    } catch {
      // Continue with the next visible 3D-labelled control.
    }
  }
  return null;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const targetReports = [];

try {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: target.viewport,
      deviceScaleFactor: target.deviceScaleFactor,
      isMobile: target.isMobile ?? false,
      hasTouch: target.hasTouch ?? false,
      locale: "ko-KR",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const httpErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        method: request.method(),
        error: request.failure()?.errorText ?? "unknown",
      });
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !/favicon/iu.test(response.url())) {
        httpErrors.push({ url: response.url(), status: response.status() });
      }
    });

    let navigationError = null;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForTimeout(5_000);
    } catch (error) {
      navigationError = String(error?.stack || error);
    }

    await page.screenshot({
      path: path.join(outputDir, `${target.name}-studio.png`),
      fullPage: true,
    }).catch(() => undefined);

    let rootAudit = null;
    let openedSurface = null;
    let surfaceAudit = null;
    if (!navigationError) {
      rootAudit = await inspectPage(page, target);
      openedSurface = await openFirstUseful3dSurface(page);
      if (openedSurface) {
        await page.screenshot({
          path: path.join(outputDir, `${target.name}-3d-surface.png`),
          fullPage: false,
        }).catch(() => undefined);
        surfaceAudit = await inspectPage(page, target);
      }
    }

    const audit = surfaceAudit ?? rootAudit ?? {
      canvases: [],
      images: [],
      webgl: { available: false },
      threeDEntrypoints: [],
    };
    targetReports.push({
      ...target,
      navigationError,
      openedSurface,
      title: audit.title,
      location: audit.location,
      bodyTextLength: audit.bodyTextLength,
      webgl: audit.webgl,
      threeDEntrypoints: rootAudit?.threeDEntrypoints ?? [],
      canvases: (audit.canvases ?? []).map(classifyStudio3dCanvas),
      images: (audit.images ?? []).map(classifyStudio3dImage),
      consoleErrors,
      pageErrors,
      failedRequests,
      httpErrors,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const summary = summarizeStudio3dProductionAudit(targetReports);
const failures = studio3dProductionAuditFailures(summary);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  url,
  summary,
  failures,
  targets: targetReports,
};
await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# ToonStudio 3D production visual audit",
  "",
  `- Generated: ${report.generatedAt}`,
  `- URL: ${url}`,
  `- Blocking findings: ${failures.length}`,
  `- Navigation failures: ${summary.navigationFailures}`,
  `- Uncaught page errors: ${summary.pageErrors}`,
  `- Broken visible images: ${summary.brokenImages}`,
  `- Potentially upscaled visible images: ${summary.upscaledImages}`,
  `- Undersized visible canvas bitmaps: ${summary.blurryCanvases}`,
  `- Targets with WebGL: ${summary.webglTargets}/${targets.length}`,
  `- Maximum visible 3D entrypoints: ${summary.threeDEntrypoints}`,
  "",
  ...(failures.length > 0 ? ["## Blocking findings", "", ...failures.map((item) => `- ${item}`), ""] : []),
  ...targetReports.flatMap((target) => [
    `## ${target.name}`,
    "",
    `- Viewport: ${target.viewport.width}×${target.viewport.height}; DPR ${target.deviceScaleFactor}`,
    `- Opened surface: ${target.openedSurface?.text ?? "none"}`,
    `- Visible relevant canvases: ${target.canvases.filter((item) => item.relevant).length}`,
    `- Blurry canvases: ${target.canvases.filter((item) => item.potentiallyBlurry).length}`,
    `- Broken images: ${target.images.filter((item) => item.broken).length}`,
    `- Upscaled images: ${target.images.filter((item) => item.potentiallyUpscaled).length}`,
    `- Console errors: ${target.consoleErrors.length}`,
    `- Failed requests: ${target.failedRequests.length}`,
    "",
  ]),
].join("\n");
await writeFile(path.join(outputDir, "report.md"), `${markdown}\n`);

if (failures.length > 0) {
  console.error(markdown);
  process.exitCode = 1;
} else {
  console.log(markdown);
}
