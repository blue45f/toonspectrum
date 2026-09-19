import { heapSlopeBytesPerHour } from "./studio-memory-growth-policy.mjs";

/** Build report telemetry without changing the heap samples used by the failure policy. */
export function createStudioSoakCheckpoint({ atMs, cycle, heap, heapSamples, failures }) {
  const finiteSamples = heapSamples.filter((sample) => (
    Number.isFinite(sample.atMs) && Number.isFinite(sample.usedBytes)
  ));
  const hasWindow = finiteSamples.length >= 2
    && finiteSamples.some((sample) => sample.atMs !== finiteSamples[0].atMs);
  const slope = hasWindow ? heapSlopeBytesPerHour(finiteSamples) : null;

  return {
    atMs,
    cycle,
    heapBytes: heap?.usedBytes ?? null,
    heapSlopeBytesPerHour: Number.isFinite(slope) ? slope : null,
    domNodes: null,
    eventListeners: null,
    failures,
  };
}
