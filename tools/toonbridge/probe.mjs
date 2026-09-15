#!/usr/bin/env node

import { probeAllTools } from "./catalog.mjs";

const probes = probeAllTools();
const rows = probes.map((probe) => ({
  tool: probe.toolId,
  state: probe.state,
  executable: probe.executable ? "yes" : "no",
  version: probe.version?.split("\n")[0]?.slice(0, 80) ?? "-",
  reason: probe.reason,
}));
console.table(rows);
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(probes, null, 2)}\n`);
}
