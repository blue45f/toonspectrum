import { canonicalJson } from "@toonspectrum/studio-project-model";
import { studioWorldManifestSchema, type StudioWorldAssetIntegrity } from "@toonspectrum/studio-project-model/world-publication";
import { studioWorldTemplatePackageSchema, type StudioWorldTemplatePackage } from "./studio-world-template-contract";

import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest as World } from "./studio-virtual-space-world-manifest";
import { resolveStudioWorldSpawn } from "./studio-virtual-space-world-pathfinding";
import { readStudioWorldAssetBytes } from "./world-publication/studio-world-asset-bytes";
import { STUDIO_WORLD_BROWSER_ASSETS, type StudioWorldAssetDependencies } from "./world-publication/studio-world-publication-assets";
import { studioWorldDigest } from "./world-publication/studio-world-publication-client";

export const STUDIO_WORLD_PACKAGE_MAX_TEXT = 2 * 1024 * 1024 + 8192;
export type WorldStarterTemplate = "solo" | "team" | "review";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Template application cannot silently remove or relax any existing private boundary. */
export function retainStudioWorldPrivacy(current: World, candidate: World): World {
  const privateZones = current.acousticZones?.filter((zone) => zone.policy === "private" || Boolean(zone.doorId)) ?? [];
  if (privateZones.length && privateZones.some((zone) =>
    !candidate.acousticZones?.some((next) => canonicalJson(next) === canonicalJson(zone)))) throw new Error("Existing private boundaries must be retained. Edit door policy separately.");
  return { ...candidate, id: current.id, version: current.version };
}
export function createStudioWorldStarterTemplate(kind: WorldStarterTemplate, current: World): World {
  const base = clone(DEFAULT_STUDIO_WORLD_MANIFEST);
  const npcs = kind === "team" ? base.npcs : kind === "solo" ? base.npcs.filter((npc) => npc.id === base.npcs[0]?.id)
    : base.npcs.filter((npc) => npc.skinKey === "silver" || npc.id === base.npcs[0]?.id);
  const target = kind === "review" ? base.interactions.find((item) => item.action === "review")?.point
    : kind === "solo" ? base.interactions.find((item) => item.action === "canvas")?.point : base.spawns[0]?.point;
  const point = target ? resolveStudioWorldSpawn(base, target) : undefined;
  const candidate: World = { ...base, id: current.id, version: current.version, npcs,
    spawns: point ? [{ id: "template-entry", point, facing: "down" }] : base.spawns,
    acousticZones: current.acousticZones?.some((zone) => zone.policy === "private" || zone.doorId) ? clone(current.acousticZones) : base.acousticZones };
  if (validateStudioWorldManifest(candidate).length) throw new Error("Template conflicts with the current room or private boundary geometry");
  return retainStudioWorldPrivacy(current, candidate);
}

/** Fetch/decode each required image once, hash actual bounded bytes, then return data-only pins. */
export async function pinStudioWorldAssets(world: World, signal: AbortSignal,
  deps: StudioWorldAssetDependencies = STUDIO_WORLD_BROWSER_ASSETS): Promise<World> {
  const structural = studioWorldManifestSchema.safeParse(world);
  if (!structural.success || validateStudioWorldManifest(world).length) throw new Error("Validate the world before packaging");
  const sources = [...new Set([world.backgroundUrl, ...world.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : [])])];
  if (sources.length > 64) throw new Error("A package may contain at most 64 referenced images");
  const pins: StudioWorldAssetIntegrity[] = [], budget = { bytes: 0 };
  for (const url of sources) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const response = await deps.fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    const bytes = await readStudioWorldAssetBytes(response, signal, budget, world.assetIntegrity?.find((item) => item.url === url));
    const objectUrl = deps.createUrl(bytes.blob);
    try { await deps.decode(objectUrl, signal); } finally { deps.revokeUrl(objectUrl); }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    pins.push({ url, sha256: bytes.sha256, bytes: bytes.blob.size, mediaType: bytes.blob.type as StudioWorldAssetIntegrity["mediaType"] });
  }
  return { ...world, assetIntegrity: pins };
}
export async function createStudioWorldTemplatePackage(world: World, details: Pick<StudioWorldTemplatePackage, "packageId" | "packageVersion" | "title" | "description" | "rights">,
  signal: AbortSignal, deps: StudioWorldAssetDependencies = STUDIO_WORLD_BROWSER_ASSETS): Promise<StudioWorldTemplatePackage> {
  const manifest = await pinStudioWorldAssets(world, signal, deps);
  const result = studioWorldTemplatePackageSchema.parse({ ...details, contract: "studio-world-template-package-v1", createdAt: new Date().toISOString(),
    manifest, manifestHash: await studioWorldDigest(manifest) });
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return result;
}
/** Local parsing does not contact referenced hosts. */
export async function parseStudioWorldTemplatePackage(raw: string): Promise<StudioWorldTemplatePackage> {
  if (new TextEncoder().encode(raw).byteLength > STUDIO_WORLD_PACKAGE_MAX_TEXT) throw new Error("Package exceeds text budget");
  const parsed = studioWorldTemplatePackageSchema.parse(JSON.parse(raw));
  if (await studioWorldDigest(parsed.manifest) !== parsed.manifestHash) throw new Error("World package content was modified");
  return parsed;
}
/** Call only after explicit consent to read the listed asset hosts. */
export async function verifyStudioWorldTemplatePackage(raw: string, signal: AbortSignal,
  deps: StudioWorldAssetDependencies = STUDIO_WORLD_BROWSER_ASSETS): Promise<StudioWorldTemplatePackage> {
  const parsed = await parseStudioWorldTemplatePackage(raw);
  await pinStudioWorldAssets(parsed.manifest, signal, deps);
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return parsed;
}
