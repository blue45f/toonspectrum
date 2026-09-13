import { createResourceEngine } from "../apps/api/src/modules/creator-resources/resource-engine";
import { parseSearchResult } from "../apps/web/src/shared/lib/creator-resources";

// Explicit manual smoke check: two bounded, keyless requests; no scheduled jobs.
const engine = createResourceEngine({ fetch: (url, init) => fetch(url, init), env: () => ({}) });
let failed = false;
for (const provider of ["aic", "cleveland"] as const) {
  const result = await engine.search({ provider, q: "armor", page: 1 });
  const valid = parseSearchResult(result);
  console.log(JSON.stringify({ provider, status: result.status, count: result.items.length,
    validContract: Boolean(valid), source: result.items[0]?.sourceUrl, image: result.items[0]?.imageUrl }));
  if (!valid || !result.items.length || result.status === "unavailable") failed = true;
}
if (failed) process.exitCode = 1;
