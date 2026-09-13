import { readFile, rename, writeFile } from "node:fs/promises";

import { parseMaterialCatalog } from "../apps/web/src/domains/creator-resources/material-atlas/model";

import { assembleMaterialCatalog, fetchMaterialJson, MATERIAL_ENDPOINTS, normalizeAmbientCG, normalizePolyHaven } from "./material-catalog-source";

import type { MaterialAsset } from "../apps/web/src/domains/creator-resources/material-atlas/model";

const output = new URL("../apps/web/src/domains/creator-resources/material-atlas/catalog.json", import.meta.url);
const mode = process.argv.slice(2);
if (mode.length !== 1 || !["--check", "--refresh"].includes(mode[0])) throw new Error("Use --check (offline) or --refresh (11 fixed API requests after reviewing provider policy). Never run automatically during build.");
if (mode[0] === "--check") {
  const catalog = parseMaterialCatalog(JSON.parse(await readFile(output, "utf8")) as unknown);
  if (!catalog) throw new Error("Material catalog failed validation");
  console.log(JSON.stringify({ mode: "offline-check", assets: catalog.assets.length, fetchedAt: catalog.fetchedAt }));
} else {
  const poly: MaterialAsset[][] = [];
  const ambient: MaterialAsset[][] = [];
  for (const endpoint of MATERIAL_ENDPOINTS) {
    const raw = await fetchMaterialJson(endpoint);
    const isPoly = endpoint.startsWith("https://api.polyhaven.com/");
    const rows = isPoly ? normalizePolyHaven(raw) : normalizeAmbientCG(raw);
    if (!rows.length) throw new Error(`No valid assets from ${endpoint}; preserving previous snapshot`);
    (isPoly ? poly : ambient).push(rows);
    console.log(`${new URL(endpoint).hostname}: ${rows.length} validated records`);
  }
  const catalog = assembleMaterialCatalog(poly, ambient, new Date().toISOString());
  const temporary = new URL(`./catalog.json.${process.pid}.tmp`, output);
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, output);
  console.log(JSON.stringify({ mode: "refresh", requests: MATERIAL_ENDPOINTS.length, assets: catalog.assets.length,
    providers: Object.fromEntries(["polyhaven", "ambientcg"].map((provider) => [provider, catalog.assets.filter((asset) => asset.provider === provider).length])), fetchedAt: catalog.fetchedAt }));
}
