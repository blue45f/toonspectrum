import manifest from "./creator-essentials.generated.json";

export type EssentialsLocale = string;
type EssentialsAuthoredLocale = "ko" | "en";
export const ESSENTIALS_KINDS = ["effect-2d", "pose-2d", "pose-3d", "prop-3d"] as const;
export type EssentialsKind = (typeof ESSENTIALS_KINDS)[number];
export interface CreatorEssential {
  readonly id: string;
  readonly kind: EssentialsKind;
  readonly label: Readonly<Record<EssentialsAuthoredLocale, string>>;
  readonly tags: readonly string[];
  readonly url: string;
  readonly preview: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}
export const ESSENTIALS_LABELS: Readonly<Record<EssentialsKind, Readonly<Record<EssentialsAuthoredLocale, string>>>> = {
  "effect-2d": { ko: "효과·말풍선·프레임", en: "Effects, balloons & frames" },
  "pose-2d": { ko: "2D 포즈 참고", en: "2D pose sheets" },
  "pose-3d": { ko: "3D 데생 인형", en: "3D mannequins" },
  "prop-3d": { ko: "3D 배경·소품", en: "3D backgrounds & props" },
};
export const CREATOR_ESSENTIALS: readonly CreatorEssential[] = Object.freeze(
  manifest.assets.map((asset) => Object.freeze({ ...asset, kind: asset.kind as EssentialsKind })),
);
export const ESSENTIALS_MAX_BYTES = 4 * 1024 * 1024;
const PATH = /^\/creator-essentials\/[a-z0-9-]+(?:\.preview)?\.(?:svg|glb|png)$/u;
export const isEssentialsPath = (value: string): boolean => PATH.test(value);

/** URL values are untrusted; unknown categories always resolve to the complete inventory. */
export function essentialsKind(value: string | null): EssentialsKind | "all" {
  return ESSENTIALS_KINDS.includes(value as EssentialsKind) ? value as EssentialsKind : "all";
}
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").trim();
export function filterCreatorEssentials(query: string, kind: EssentialsKind | "all"): readonly CreatorEssential[] {
  const tokens = normalize(query.slice(0, 160)).split(/\s+/u).filter(Boolean);
  return CREATOR_ESSENTIALS.filter((asset) => {
    if (kind !== "all" && asset.kind !== kind) return false;
    const searchable = normalize([asset.id, asset.label.ko, asset.label.en, ...asset.tags].join(" "));
    return tokens.every((token) => searchable.includes(token));
  });
}
export function essentialsEditorHref(asset: Pick<CreatorEssential, "kind">): string {
  return asset.kind.endsWith("3d") ? "/studio/bg3d" : "/studio/canvas";
}
export function essentialsFormat(asset: Pick<CreatorEssential, "kind">): "GLB" | "SVG" {
  return asset.kind.endsWith("3d") ? "GLB" : "SVG";
}
export function essentialsByteLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
