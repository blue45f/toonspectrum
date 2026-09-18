import manifest from "./studio-2d-generated-scene-manifest.json";

export interface GeneratedStudio2dAsset {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly genre: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly tags: readonly string[];
  readonly environment: "실내" | "실외";
  readonly timeOfDay: "낮" | "노을" | "밤";
  readonly containsPeople: false;
  readonly containsText: false;
  readonly recommended: boolean;
  readonly review: {
    readonly method: "full-image" | "contact-sheet";
    readonly status: "usable" | "small-panel-only";
    readonly reviewedAt: string;
    readonly notes: readonly string[];
  };
  readonly provenance: {
    readonly kind: "gpt-image-2.5";
    readonly licenseStatus: "first-party-generated";
    readonly provider: string;
    readonly model: string;
    readonly promptHash: string;
    readonly recipeId: string;
    readonly generatedAt: string;
  };
  readonly mediaType: "image/png";
  readonly style: "webtoon-illustration";
  readonly legacySrc: null;
  readonly sourceManifest: string;
}

export interface GeneratedStudio2dScene {
  readonly id: string;
  readonly label: string;
  readonly genre: string;
  readonly imgSrc: string;
  readonly width: number;
  readonly height: number;
}

const assets = manifest.assets as unknown as readonly GeneratedStudio2dAsset[];

export const GENERATED_GPT25_ASSET_METADATA: readonly GeneratedStudio2dAsset[] =
  Object.freeze(assets.slice());

export const GENERATED_GPT25_BG_SCENES: readonly GeneratedStudio2dScene[] =
  Object.freeze(assets.map(({ id, label, genre, src, width, height }) => Object.freeze({
    id,
    label,
    genre,
    imgSrc: src,
    width,
    height,
  })));

export const GENERATED_GPT25_MARKETPLACE_ID_PREFIX = "gpt25/";

export function findGeneratedStudio2dAsset(reference: string): GeneratedStudio2dAsset | null {
  const id = reference.startsWith(GENERATED_GPT25_MARKETPLACE_ID_PREFIX)
    ? reference.slice(GENERATED_GPT25_MARKETPLACE_ID_PREFIX.length)
    : reference;
  return GENERATED_GPT25_ASSET_METADATA.find((asset) => asset.id === id) ?? null;
}
