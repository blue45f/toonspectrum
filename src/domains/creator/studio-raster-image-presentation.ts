/**
 * Opt-in browser-verification receipt for an exact raster source reaching the visible Konva layer.
 *
 * Production does not install this probe. The native-raster Playwright verifier arms it before a
 * measured operation; product mutation code then records the exact element/src pair it is about to
 * commit, and StudioKonvaImageNode acknowledges only that same pair after the layer's real draw.
 */

export const STUDIO_RASTER_IMAGE_PRESENTATION_PROBE_VERSION = 1 as const;

export interface StudioRasterImagePresentationIdentity {
  readonly elementId: string;
  readonly src: string;
}

export interface StudioRasterImagePresentationExpectation
  extends StudioRasterImagePresentationIdentity {
  readonly epoch: number;
}

export interface StudioRasterImagePresentationReceipt
  extends StudioRasterImagePresentationIdentity {
  readonly expectationEpoch: number;
  readonly presentedAt: number;
  readonly presentedWallClockMs: number;
  readonly receiptEpoch: number;
  readonly renderCounters: Readonly<Record<string, number>>;
}

export interface StudioRasterImagePresentationProbe {
  readonly version: typeof STUDIO_RASTER_IMAGE_PRESENTATION_PROBE_VERSION;
  expectationEpoch: number;
  expected: StudioRasterImagePresentationExpectation | null;
  receiptEpoch: number;
  receipt: StudioRasterImagePresentationReceipt | null;
}

declare global {
  interface Window {
    __studioRasterImagePresentationProbe?: StudioRasterImagePresentationProbe;
    __studioHotPathRenderCounters?: Record<string, number>;
  }
}

function activeProbe(): StudioRasterImagePresentationProbe | null {
  if (typeof window === "undefined") return null;
  const probe = window.__studioRasterImagePresentationProbe;
  return probe?.version === STUDIO_RASTER_IMAGE_PRESENTATION_PROBE_VERSION ? probe : null;
}

export function expectStudioRasterImagePresentation(
  identity: StudioRasterImagePresentationIdentity,
): StudioRasterImagePresentationExpectation | null {
  const probe = activeProbe();
  if (!probe) return null;
  const expected = {
    elementId: identity.elementId,
    epoch: probe.expectationEpoch + 1,
    src: identity.src,
  } satisfies StudioRasterImagePresentationExpectation;
  probe.expectationEpoch = expected.epoch;
  probe.expected = expected;
  return expected;
}

export function expectedStudioRasterImagePresentation(
  identity: StudioRasterImagePresentationIdentity,
): StudioRasterImagePresentationExpectation | null {
  const expected = activeProbe()?.expected;
  return expected
    && expected.elementId === identity.elementId
    && expected.src === identity.src
    ? expected
    : null;
}

export function acknowledgeStudioRasterImagePresentation(
  expected: StudioRasterImagePresentationExpectation,
): StudioRasterImagePresentationReceipt | null {
  const probe = activeProbe();
  if (
    !probe
    || probe.expected?.epoch !== expected.epoch
    || probe.expected.elementId !== expected.elementId
    || probe.expected.src !== expected.src
  ) {
    return null;
  }
  if (probe.receipt?.expectationEpoch === expected.epoch) return probe.receipt;
  const receipt = {
    elementId: expected.elementId,
    expectationEpoch: expected.epoch,
    presentedAt: performance.now(),
    presentedWallClockMs: Date.now(),
    receiptEpoch: probe.receiptEpoch + 1,
    renderCounters: { ...(window.__studioHotPathRenderCounters ?? {}) },
    src: expected.src,
  } satisfies StudioRasterImagePresentationReceipt;
  probe.receiptEpoch = receipt.receiptEpoch;
  probe.receipt = receipt;
  return receipt;
}
