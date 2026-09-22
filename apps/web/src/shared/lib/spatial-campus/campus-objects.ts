import type { CampusDistrictId } from "./campus-model";

export type CampusObjectExposure = "public" | "private";
export type CampusObjectKind =
  | "market-resource"
  | "story"
  | "community-post"
  | "project"
  | "recipe"
  | "event"
  | "work";

export interface CampusObject {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly thumbnail?: string;
  readonly exposure?: CampusObjectExposure;
  readonly kind?: CampusObjectKind;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.%~-]{0,179}$/u;
const SAFE_STATIC_IMAGE = /^\/(?:assets|brand)\/[A-Za-z0-9_./~-]+$/u;
const SAFE_RECIPE = /^[A-Za-z0-9][A-Za-z0-9_.~-]{0,100}$/u;

function safeSegment(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value);
    return decoded !== "." && decoded !== ".."
      && !/[\\/%]/u.test(decoded)
      && ![...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  } catch {
    return false;
  }
}
export function canonicalCampusObjectCandidate(item: CampusObject): CampusObject | null {
  if (!item || typeof item.id !== "string" || !SAFE_ID.test(item.id)
    || typeof item.title !== "string" || !item.title.trim() || item.title.length > 300
    || typeof item.href !== "string" || !item.href.startsWith("/") || item.href.startsWith("//")) return null;
  const url = new URL(item.href, "https://campus.invalid");
  if (url.origin !== "https://campus.invalid" || url.hash) return null;
  if (url.pathname.split("/").filter(Boolean).some((segment) => !safeSegment(segment))) return null;
  let thumbnail: string | undefined;
  if (item.thumbnail && SAFE_STATIC_IMAGE.test(item.thumbnail) && !item.thumbnail.split("/").includes("..")) {
    thumbnail = item.thumbnail;
  }
  return {
    id: item.id,
    title: item.title.trim(),
    href: `${url.pathname}${url.search}`,
    ...(item.exposure === "private" || item.exposure === "public" ? { exposure: item.exposure } : {}),
    ...(item.kind ? { kind: item.kind } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  };
}

function matchesDistrict(item: CampusObject, districtId: CampusDistrictId): boolean {
  const url = new URL(item.href, "https://campus.invalid");
  const path = url.pathname;
  const noQuery = url.search === "";
  const publicScene = districtId === "market" || districtId === "library" || districtId === "gallery"
    || districtId === "academy" || districtId === "plaza";
  if (publicScene && item.exposure === "private") return false;
  if (districtId === "market") return noQuery && /^\/market\/resource\/[^/]+\/?$/u.test(path);
  if (districtId === "library") return noQuery && /^\/(?:title|author)\/[^/]+\/?$/u.test(path);
  if (districtId === "gallery") return noQuery && /^\/(?:community\/post|showcase\/(?:work|series))\/[^/]+\/?$/u.test(path);
  if (districtId === "production") return item.exposure === "private" && noQuery
    && /^\/production\/projects\/[^/]+\/overview\/?$/u.test(path);
  if (districtId === "atelier") return item.exposure === "private" && noQuery
    && /^\/studio\/p\/[^/]+\/overview\/?$/u.test(path);
  if (districtId === "academy" && path === "/learn/recipes") {
    const keys = [...url.searchParams.keys()];
    return keys.length === 1 && keys[0] === "lesson" && SAFE_RECIPE.test(url.searchParams.get("lesson") ?? "");
  }
  if (districtId === "plaza") return noQuery && /^\/(?:events|opportunities)(?:\/[^/]+)?\/?$/u.test(path);
  return false;
}

/** Canonical, in-memory display references for the current district. No domain record or write function crosses this seam. */
export function campusSceneObjects(
  input: readonly CampusObject[],
  districtId: CampusDistrictId,
  limit = 24,
): readonly CampusObject[] {
  const seen = new Set<string>();
  const output: CampusObject[] = [];
  for (const raw of input.slice(0, 96)) {
    const item = canonicalCampusObjectCandidate(raw);
    if (!item || !matchesDistrict(item, districtId)) continue;
    const identity = `${item.kind ?? "item"}:${item.id}:${item.href}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    output.push(item);
    if (output.length >= Math.max(1, Math.min(24, Math.floor(limit)))) break;
  }
  return output;
}

/** Backward-compatible public projection used by earlier market tests and adapters. */
export function campusPublicObjects(input: readonly CampusObject[]): readonly CampusObject[] {
  return (["market", "library", "gallery", "academy", "plaza"] as const)
    .flatMap((district) => campusSceneObjects(input, district))
    .filter((item, index, values) => item.exposure !== "private"
      && values.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 24);
}
