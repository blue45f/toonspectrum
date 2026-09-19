/** Compare matched local runs without treating engine differences as a quality ranking. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const [before = "baseline", after = "optimized"] = process.argv.slice(2);
for (const label of [before, after]) assert.match(label, /^[a-z0-9-]{1,48}$/u);
const root = new URL("../.qa/engine-resume/", import.meta.url);
const load = async (label) => JSON.parse(await readFile(new URL(`native-brush-benchmark-${label}.json`, root), "utf8"));
const baseline = await load(before), candidate = await load(after);
assert.equal(baseline.browser, candidate.browser, "Browser versions differ");
assert.equal(baseline.host.cpu, candidate.host.cpu, "Hosts differ");
assert.equal(baseline.rows.length, candidate.rows.length);
const rows = candidate.rows.map((row) => {
  const previous = baseline.rows.find((item) => item.engine === row.engine && item.workload.id === row.workload.id);
  assert.ok(previous, "Missing baseline workload");
  assert.equal(previous.sourceHash, row.sourceHash, "Input changed");
  assert.deepEqual(previous.outputSize, row.outputSize, "Output resolution changed");
  assert.equal(previous.raw[0].pixelHash, row.raw[0].pixelHash, "Decoded output changed; speed cannot pass this gate alone");
  assert.ok(previous.raw.every((sample) => sample.pixelHash === row.raw[0].pixelHash));
  assert.ok(row.raw.every((sample) => sample.pixelHash === previous.raw[0].pixelHash));
  return { workload: row.workload.id, engine: row.engine, pixelIdentical: true,
    beforeP50Ms: previous.metrics.totalMs.p50, afterP50Ms: row.metrics.totalMs.p50,
    totalP50ReductionPercent: 100 * (1 - row.metrics.totalMs.p50 / previous.metrics.totalMs.p50),
    beforeP95Ms: previous.metrics.totalMs.p95, afterP95Ms: row.metrics.totalMs.p95,
    beforeRenderP50Ms: previous.metrics.renderToPngMs.p50, afterRenderP50Ms: row.metrics.renderToPngMs.p50,
    beforeBytes: previous.raw[0].pngBytes, afterBytes: row.raw[0].pngBytes };
});
const report = { baseline: before, candidate: after,
  trialsBefore: baseline.trials, trialsAfter: candidate.trials,
  method: "Sequential build comparisons with provider order rotated within each run; not randomized build A/B or a significance claim",
  rows };
await writeFile(new URL(`native-brush-comparison-${before}-${after}.json`, root), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
