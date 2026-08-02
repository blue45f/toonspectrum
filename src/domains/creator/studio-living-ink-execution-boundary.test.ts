import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runtime = readFileSync(new URL("./studio-living-ink-webgl2-runtime.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("./studio-living-ink.worker.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("./studio-living-ink-provider.ts", import.meta.url), "utf8");
const validation = readFileSync(
  new URL("./studio-living-ink-execution-validation.ts", import.meta.url),
  "utf8",
);
const browserGate = readFileSync(
  new URL("../../../scripts/studio-living-ink-execution-browser.ts", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../../../scripts/verify-studio-living-ink-execution.mjs", import.meta.url),
  "utf8",
);

describe("Living Ink actual execution boundary", () => {
  it("owns reviewed half-float physics and an RGBA8 readback authority", () => {
    for (const token of [
      "gl.RGBA16F",
      "gl.RG16F",
      "gl.R16F",
      "VELOCITY_FRAGMENT",
      "VORTICITY_FRAGMENT",
      "PRESSURE_FRAGMENT",
      "WET_FRAGMENT",
      "PIGMENT_FRAGMENT",
      "EXCHANGE_FRAGMENT",
      "DISPLAY_FRAGMENT",
      "createDisplaySurface",
      "rgba8-staging-fbo",
    ]) expect(runtime).toContain(token);
    expect(runtime).not.toContain("Math.random");
    expect(runtime).toContain("settlePressureIterations");
    expect(runtime).toContain("fixDurationSeconds");
  });

  it("keeps continuous Gaussian segments, selection orientation and ping-pong identity explicit", () => {
    expect(runtime).toContain("float along = clamp");
    expect(runtime).toContain("private syncDoubleDirty");
    expect(runtime.match(/this\.syncDoubleDirty\(/g)?.length).toBeGreaterThanOrEqual(9);
    expect(runtime).toContain("this.advanceDirtyHalo();");
    expect(runtime).toContain("height - 1 - (selection.bounds.y + row)");
    expect(runtime).toContain("accepted = clamp(settle * coverage");
    expect(runtime).toContain("strokeDeposit");
    expect(runtime).toContain("MERGE_DEPOSIT_FRAGMENT");
    expect(runtime).toContain("startAmount");
    expect(runtime).toContain("startRadius");
    expect(runtime).toContain("continuous-stroke-deposit-merge");
    expect(runtime).not.toContain("gl.blendEquation");
  });

  it("preserves the reviewed 1.2 second Fix evolution while isolating fixed pigment from Water", () => {
    const mobileDilution = runtime.indexOf("mobileContribution.rgb *= 1.0 - saturatedCenterDilution");
    const fixedComposition = runtime.indexOf(
      "combined = fixedContribution + mobileContribution",
      mobileDilution,
    );
    expect(mobileDilution).toBeGreaterThan(0);
    expect(fixedComposition).toBeGreaterThan(mobileDilution);
    expect(runtime).toContain("fixedOpticalDensity *= 1.0 + fixedPigmentEdge * edgeAmount * 0.65");
    expect(runtime).toContain("dryingFront * mobileCenterDensity");
    expect(runtime).toContain("STUDIO_LIVING_INK_EXECUTION_LIMITS.fixDurationSeconds");
    expect(runtime).toContain("operation.kind === \"fix\"");
    expect(runtime).not.toContain("fullyFixed");
    expect(runtime).not.toContain("operation.kind === \"fix\") ticks = 0");
    expect(browserGate).toContain('await render(fixProvider, "fixed-pigment", "fixed-before")');
    expect(browserGate).toContain('await render(fixProvider, "fixed-pigment", "fixed-after")');
    expect(browserGate).toContain("maximumRgbDifference(fixedBefore.image, fixedAfter.image)");
    expect(verifier).toContain("fixed pigment changed under water scrub/advance");
    expect(verifier).toContain("result.fixedInvariant?.maximumRgbDifference !== 0");
  });

  it("gates organic wash quality and continuous-stroke artifacts against actual pixels", () => {
    for (const token of [
      "normalizedHighFrequencyEdgeCurvature",
      "continuousCapsule",
      "selfIntersectionLuminanceRatio",
      "minimumWashBandToMaximumRatio",
      "whiteCenterLuminanceDeltaFromPaper",
      "workerCrashRecovery",
      "isolatedBloomAsymmetry",
      "deferredPresentation",
    ]) expect(browserGate).toContain(token);
    expect(verifier).toContain("INKWASH_ORACLE");
    expect(verifier).toContain("watercolour bloom expansion");
    expect(verifier).toContain("continuous capsule exposes periodic dab seams");
    expect(verifier).toContain("actual Chromium Worker crash");
    expect(verifier).toContain("two to four smooth capillary lobes");
    expect(verifier).toContain("simulation ACK batching dropped input");
  });

  it("serializes all input and rolls failed or cancelled mutations back before acknowledgement", () => {
    expect(worker).toContain("queue = queue.then(() => handle(request), () => handle(request))");
    expect(worker).toContain("await rebuildAcceptedJournal();");
    expect(worker).toContain("rollback failed and the runtime was sealed unavailable");
    expect(worker).toContain("queuedApplyRequests");
    expect(worker).toContain("cancelAcknowledgements");
    expect(worker).toContain("{ ...entry.options, present: false }");
    expect(worker).toContain('applied.kind !== "living-ink/applied"');
  });

  it("applies every coalesced operation while deferring presentation and strictly parses persisted input", () => {
    expect(runtime).toContain("options.present === false");
    expect(runtime).toContain('kind: "living-ink/applied"');
    expect(runtime).toContain("displayReadbackCount: 0");
    expect(runtime).toContain("imageBitmapCount: 0");
    expect(provider).toContain('response.type !== "living-ink/applied"');
    expect(worker).toContain("parseStudioLivingInkExecutionOperation");
    expect(worker).toContain("parseStudioLivingInkExecutionApplyOptions");
    expect(validation).toContain("parseStudioLivingInkExecutionSelection");
    expect(validation).toContain("coverage.length !== expected");
    expect(validation).not.toContain("Math.random");
  });

  it("closes invalid/stale frames and states the GPU determinism boundary truthfully", () => {
    expect(provider).toContain("validFrameResponse");
    expect(provider).toContain("response.frame.image.close()");
    expect(provider).toContain("failedWorker?.terminate()");
    expect(provider).toContain("worker.onerror");
    expect(runtime).toContain('determinism: "same-runtime-replay"');
    expect(runtime).toContain("crossDeviceBitExact: false");
    expect(runtime).toContain('displayReadbackOrientation: "webgl-bottom-left-row-major"');
    expect(browserGate).toContain("bottomUpHash");
    expect(browserGate).toContain("normalizedDisplayHashMatchesReceipt");
  });
});
