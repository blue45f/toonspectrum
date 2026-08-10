import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const RESULT_PATH = new URL(
  "../benchmarks/results/studio-v12-browser-qa.json",
  import.meta.url,
);

const EXPECTED_VIEWPORTS = {
  "desktop-1440x900": { width: 1440, height: 900 },
  "mobile-390x844": { width: 390, height: 844 },
  "narrow-mobile-320x568": { width: 320, height: 568 },
} as const;

const EXPECTED_COMMANDS = [
  "verify:studio-launch",
  "verify:studio-menus",
  "verify:studio-mobile-top",
  "verify:studio-icons",
] as const;

const ERROR_AXES = [
  "console",
  "page",
  "requestFailed",
  "responses5xx",
  "csp",
  "unhandledRejections",
] as const;

const UNAVAILABLE_AXES = [
  "gpuAdapter",
  "gpuBackend",
  "gpuMemoryBytes",
  "jsHeapUsedBytes",
  "wasmMemoryBytes",
] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function positiveFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateViewport(viewport: unknown, issues: string[]): void {
  if (!isRecord(viewport)) {
    issues.push("viewport entry is not an object");
    return;
  }

  const id = viewport.id;
  if (typeof id !== "string" || !(id in EXPECTED_VIEWPORTS)) {
    issues.push(`unexpected viewport id: ${String(id)}`);
    return;
  }

  const expected = EXPECTED_VIEWPORTS[id as keyof typeof EXPECTED_VIEWPORTS];
  if (viewport.width !== expected.width || viewport.height !== expected.height) {
    issues.push(`viewport ${id} dimensions drifted`);
  }

  if (viewport.routePathname !== "/studio") {
    issues.push(`viewport ${id} route drifted`);
  }
  if (!nonEmptyString(viewport.finalUrl)) {
    issues.push(`viewport ${id} final URL is missing`);
  } else {
    try {
      if (new URL(viewport.finalUrl as string).pathname !== "/studio") {
        issues.push(`viewport ${id} final URL left /studio`);
      }
    } catch {
      issues.push(`viewport ${id} final URL is invalid`);
    }
  }

  const page = record(viewport.page);
  if (!positiveFinite(page.clientWidth) || !positiveFinite(page.clientHeight)) {
    issues.push(`viewport ${id} page dimensions are invalid`);
  }
  if (!nonNegativeFinite(page.scrollWidth) || !nonNegativeFinite(page.scrollHeight)) {
    issues.push(`viewport ${id} scroll dimensions are invalid`);
  }
  if (page.horizontalOverflowPx !== 0) {
    issues.push(`viewport ${id} has horizontal overflow`);
  }
  if (
    typeof page.scrollWidth === "number"
    && typeof page.clientWidth === "number"
    && page.scrollWidth > page.clientWidth
  ) {
    issues.push(`viewport ${id} scrollWidth exceeds clientWidth`);
  }

  const canvas = record(viewport.canvas);
  if (!nonEmptyString(canvas.selector)) {
    issues.push(`viewport ${id} canvas selector is missing`);
  }
  if (canvas.visible !== true) {
    issues.push(`viewport ${id} primary canvas host is not visible`);
  }
  if (!positiveFinite(canvas.width) || !positiveFinite(canvas.height)) {
    issues.push(`viewport ${id} primary canvas host is zero-sized`);
  }

  const surfaces = record(viewport.surfaces);
  for (const surfaceName of ["topChrome", "editing"] as const) {
    const surface = record(surfaces[surfaceName]);
    if (!nonEmptyString(surface.selector) || surface.visible !== true) {
      issues.push(`viewport ${id} ${surfaceName} surface is unreachable`);
    }
  }
  if (array(surfaces.loadingOrErrorOverlaysVisible).length > 0) {
    issues.push(`viewport ${id} has a permanent loading/error overlay`);
  }

  const interaction = record(viewport.interaction);
  if (
    interaction.passed !== true
    || interaction.opened !== true
    || interaction.closed !== true
    || !nonEmptyString(interaction.selector)
    || !nonEmptyString(interaction.outcome)
  ) {
    issues.push(`viewport ${id} safe interaction failed`);
  }

  const errors = record(viewport.errors);
  for (const axis of ERROR_AXES) {
    const entries = errors[axis];
    if (!Array.isArray(entries)) {
      issues.push(`viewport ${id} error axis ${axis} is missing`);
    } else if (entries.length > 0) {
      issues.push(`viewport ${id} error axis ${axis} is not empty`);
    }
  }

  const unavailable = record(viewport.unavailableMetrics);
  for (const axis of UNAVAILABLE_AXES) {
    if (!(axis in unavailable)) {
      issues.push(`viewport ${id} unavailable axis ${axis} is missing`);
    } else if (unavailable[axis] !== null) {
      issues.push(`viewport ${id} unavailable axis ${axis} must be explicit null`);
    }
  }
}

export function validateStudioV12BrowserQaArtifact(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["artifact is not an object"];

  if (value.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (value.status !== "pass" || value.pass !== true) {
    issues.push("artifact is not a passing result");
  }
  if (!nonEmptyString(value.generatedAt) || Number.isNaN(Date.parse(value.generatedAt as string))) {
    issues.push("generatedAt is missing or invalid");
  }

  const build = record(value.build);
  if (!/^[0-9a-f]{40}$/u.test(String(build.gitSha ?? ""))) {
    issues.push("build git SHA is missing or invalid");
  }
  if (build.detachedHead !== true || build.distSource !== "existing-production-dist") {
    issues.push("build provenance does not prove the existing detached production dist");
  }
  if (!/^[0-9a-f]{64}$/u.test(String(build.distIndexSha256 ?? ""))) {
    issues.push("dist index digest is missing or invalid");
  }

  const browser = record(value.browser);
  if (
    browser.name !== "Chromium"
    || !nonEmptyString(browser.version)
    || !nonEmptyString(browser.userAgent)
  ) {
    issues.push("Chromium identity is incomplete");
  }

  const route = record(value.route);
  if (
    route.requestedPath !== "/studio"
    || route.expectedPath !== "/studio"
    || route.parallelRouteObserved !== false
    || array(route.observedParallelRoutes).length > 0
  ) {
    issues.push("top-level route authority drifted from /studio");
  }

  const viewports = array(value.viewports);
  const ids = viewports.flatMap((entry) => {
    const id = record(entry).id;
    return typeof id === "string" ? [id] : [];
  });
  if (viewports.length !== Object.keys(EXPECTED_VIEWPORTS).length) {
    issues.push("viewport evidence count is incomplete");
  }
  for (const id of Object.keys(EXPECTED_VIEWPORTS)) {
    if (ids.filter((candidate) => candidate === id).length !== 1) {
      issues.push(`viewport ${id} is missing or duplicated`);
    }
  }
  for (const viewport of viewports) validateViewport(viewport, issues);

  const commands = array(value.commands);
  for (const expected of EXPECTED_COMMANDS) {
    const matching = commands.filter((entry) => record(entry).name === expected);
    if (matching.length !== 1) {
      issues.push(`command ${expected} is missing or duplicated`);
      continue;
    }
    const command = record(matching[0]);
    if (
      command.exitCode !== 0
      || command.passed !== true
      || !positiveFinite(command.durationMs)
      || !nonEmptyString(command.command)
      || !nonEmptyString(command.artifactDir)
    ) {
      issues.push(`command ${expected} did not pass with complete evidence`);
    }
  }

  const safety = record(value.safety);
  if (array(safety.prohibitedActionsTriggered).length > 0) {
    issues.push("a prohibited destructive or external action was triggered");
  }

  return issues;
}

function artifact(): UnknownRecord {
  return JSON.parse(readFileSync(RESULT_PATH, "utf8")) as UnknownRecord;
}

describe("ToonStudio V12 production browser QA evidence", () => {
  it("pins a strict passing /studio result for desktop and both mobile boundaries", () => {
    expect(validateStudioV12BrowserQaArtifact(artifact())).toEqual([]);
  });

  it("rejects missing viewports, overflow, zero canvas, and route drift", () => {
    const missing = structuredClone(artifact());
    missing.viewports = array(missing.viewports).slice(0, 2);
    expect(validateStudioV12BrowserQaArtifact(missing)).toContain(
      "viewport narrow-mobile-320x568 is missing or duplicated",
    );

    const overflow = structuredClone(artifact());
    record(array(overflow.viewports)[1]).page = {
      ...record(record(array(overflow.viewports)[1]).page),
      horizontalOverflowPx: 12,
      scrollWidth: 402,
      clientWidth: 390,
    };
    expect(validateStudioV12BrowserQaArtifact(overflow)).toContain(
      "viewport mobile-390x844 has horizontal overflow",
    );

    const zeroCanvas = structuredClone(artifact());
    record(array(zeroCanvas.viewports)[0]).canvas = {
      ...record(record(array(zeroCanvas.viewports)[0]).canvas),
      width: 0,
    };
    expect(validateStudioV12BrowserQaArtifact(zeroCanvas)).toContain(
      "viewport desktop-1440x900 primary canvas host is zero-sized",
    );

    const routeDrift = structuredClone(artifact());
    record(array(routeDrift.viewports)[0]).routePathname = "/studio-v12";
    record(routeDrift.route).parallelRouteObserved = true;
    expect(validateStudioV12BrowserQaArtifact(routeDrift)).toEqual(
      expect.arrayContaining([
        "top-level route authority drifted from /studio",
        "viewport desktop-1440x900 route drifted",
      ]),
    );
  });

  it("rejects every observed error, failed interaction, and failed verifier", () => {
    const withErrors = structuredClone(artifact());
    record(record(array(withErrors.viewports)[0]).errors).console = ["boom"];
    expect(validateStudioV12BrowserQaArtifact(withErrors)).toContain(
      "viewport desktop-1440x900 error axis console is not empty",
    );

    const failedInteraction = structuredClone(artifact());
    record(array(failedInteraction.viewports)[1]).interaction = {
      ...record(record(array(failedInteraction.viewports)[1]).interaction),
      passed: false,
    };
    expect(validateStudioV12BrowserQaArtifact(failedInteraction)).toContain(
      "viewport mobile-390x844 safe interaction failed",
    );

    const failedCommand = structuredClone(artifact());
    record(array(failedCommand.commands)[0]).exitCode = 1;
    expect(validateStudioV12BrowserQaArtifact(failedCommand)).toContain(
      "command verify:studio-launch did not pass with complete evidence",
    );
  });

  it("rejects fabricated zeroes for unavailable GPU or memory axes", () => {
    for (const axis of UNAVAILABLE_AXES) {
      const fabricated = structuredClone(artifact());
      record(record(array(fabricated.viewports)[0]).unavailableMetrics)[axis] = 0;
      expect(validateStudioV12BrowserQaArtifact(fabricated)).toContain(
        `viewport desktop-1440x900 unavailable axis ${axis} must be explicit null`,
      );
    }
  });
});
