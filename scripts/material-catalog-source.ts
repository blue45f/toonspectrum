import {
  asRecord, cleanMaterialText, MATERIAL_CATALOG_SCHEMA, materialSourceUrl, materialTextList,
  parseMaterialAsset, parseMaterialCatalog, safeMaterialThumbnail,
} from "../apps/web/src/domains/creator-resources/material-atlas/model";

import type { MaterialAsset, MaterialCatalog, MaterialKind } from "../apps/web/src/domains/creator-resources/material-atlas/model";

export const MATERIAL_USER_AGENT = "ToonStudio-MaterialAtlas/1.0 (+https://www.toonstudio.cloud)";
export const MATERIAL_MAX_RESPONSE_BYTES = 6_000_000;
export const MATERIAL_FETCH_TIMEOUT_MS = 15_000;
export const MATERIAL_ENDPOINTS = [
  "https://api.polyhaven.com/assets?t=textures", "https://api.polyhaven.com/assets?t=models", "https://api.polyhaven.com/assets?t=hdris",
  ...["wood", "brick", "concrete", "metal", "fabric", "ground", "tiles", "rock"].map((term) => `https://ambientcg.com/api/v2/full_json?type=Material&q=${term}&limit=6&include=labelData,previewData`),
];
export function normalizePolyHaven(value: unknown): MaterialAsset[] {
  const rows = asRecord(value);
  if (!rows) throw new Error("Poly Haven catalog is not an object");
  return Object.entries(rows).slice(0, 10_000).flatMap(([sourceId, raw]) => {
    const row = asRecord(raw);
    if (!row || (row.type !== 0 && row.type !== 1 && row.type !== 2)) return [];
    const kind: MaterialKind = row.type === 0 ? "hdri" : row.type === 1 ? "texture" : "model";
    const asset = parseMaterialAsset({
      id: `polyhaven:${sourceId}`, provider: "polyhaven", sourceId, title: cleanMaterialText(row.name), kind,
      tags: materialTextList([...(Array.isArray(row.tags) ? row.tags : []), ...(Array.isArray(row.categories) ? row.categories : [])]),
      authors: Object.keys(asRecord(row.authors) ?? {}), sourceUrl: materialSourceUrl("polyhaven", sourceId),
      thumbnailUrl: safeMaterialThumbnail("polyhaven", sourceId, row.thumbnail_url), license: "CC0-1.0",
    });
    return asset ? [asset] : [];
  });
}
export function normalizeAmbientCG(value: unknown): MaterialAsset[] {
  const result = asRecord(value);
  if (!result || !Array.isArray(result.foundAssets)) throw new Error("ambientCG catalog is not a foundAssets response");
  return result.foundAssets.slice(0, 100).flatMap((raw) => {
    const row = asRecord(raw);
    if (!row || row.dataType !== "Material" || typeof row.assetId !== "string") return [];
    const asset = parseMaterialAsset({
      id: `ambientcg:${row.assetId}`, provider: "ambientcg", sourceId: row.assetId,
      title: cleanMaterialText(row.displayName) || cleanMaterialText(row.assetId), kind: "texture",
      tags: materialTextList([...(Array.isArray(row.tags) ? row.tags : []), row.displayCategory]), authors: ["ambientCG"],
      sourceUrl: materialSourceUrl("ambientcg", row.assetId), thumbnailUrl: asRecord(row.previewImage)?.["256-WEBP"], license: "CC0-1.0",
    });
    return asset ? [asset] : [];
  });
}
export function selectDiverseMaterials(assets: MaterialAsset[], count = 32): MaterialAsset[] {
  const sorted = [...assets].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const selected = new Map<string, MaterialAsset>();
  const terms = ["wood", "brick", "concrete", "metal", "fabric", "ground", "tile", "rock", "forest", "night", "sunset", "studio", "chair", "table", "book", "bottle", "plant", "wall", "floor", "street", "rust", "worn"];
  for (const term of terms) {
    const match = sorted.find((asset) => !selected.has(asset.id) && `${asset.title} ${asset.tags.join(" ")}`.toLowerCase().includes(term));
    if (match && selected.size < count) selected.set(match.id, match);
  }
  for (const asset of sorted) { if (selected.size >= count) break; selected.set(asset.id, asset); }
  return [...selected.values()];
}
export function assembleMaterialCatalog(poly: MaterialAsset[][], ambient: MaterialAsset[][], fetchedAt: string): MaterialCatalog {
  const candidates = [...poly.flatMap((assets) => selectDiverseMaterials(assets)), ...ambient.flat()];
  const assets = [...new Map(candidates.map((asset) => [asset.id, asset])).values()];
  if (!assets.some((asset) => asset.provider === "ambientcg") || !["texture", "model", "hdri"].every((kind) => assets.some((asset) => asset.provider === "polyhaven" && asset.kind === kind))) throw new Error("A source or material category is missing; preserving the previous snapshot");
  const catalog = parseMaterialCatalog({ schema: MATERIAL_CATALOG_SCHEMA, fetchedAt, assets });
  if (!catalog) throw new Error("Generated catalog failed its contract; preserving the previous snapshot");
  return catalog;
}
export async function fetchMaterialJson(url: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!MATERIAL_ENDPOINTS.includes(url)) throw new Error("Unapproved material API endpoint");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MATERIAL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": MATERIAL_USER_AGENT }, redirect: "error", signal: controller.signal });
    if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      await response.body?.cancel();
      throw new Error(`Material API rejected: HTTP ${response.status}; no automatic retry or paid fallback`);
    }
    if (Number(response.headers.get("content-length")) > MATERIAL_MAX_RESPONSE_BYTES) {
      await response.body?.cancel(); throw new Error("Material API response exceeds the byte limit");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Material API returned an empty stream");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MATERIAL_MAX_RESPONSE_BYTES) { controller.abort(); await reader.cancel(); throw new Error("Material API response exceeds the byte limit"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown;
  } finally { clearTimeout(timer); }
}
