import { STUDIO_ILLUSTRATION_PACK } from "../catalog/studio-illustration-pack";

/** 원본 경로·픽셀 크기·알파·배치·출처를 함께 보존하는 제품 번들 이미지 카탈로그. */

export const STUDIO_RASTER_ASSET_KINDS = ["prop-cluster", "bubble-decoration", "effect-overlay", "texture"] as const;
export type StudioRasterAssetKind = (typeof STUDIO_RASTER_ASSET_KINDS)[number];

export const STUDIO_RASTER_ASSET_COLLECTIONS = ["daily", "school", "fantasy", "urban", "scifi", "coastal", "romance"] as const;
export type StudioRasterAssetCollection = (typeof STUDIO_RASTER_ASSET_COLLECTIONS)[number];

export const STUDIO_RASTER_ASSET_PLACEMENTS = ["frame-center", "frame-bottom-center"] as const;
export type StudioRasterAssetPlacement = (typeof STUDIO_RASTER_ASSET_PLACEMENTS)[number];

export const STUDIO_RASTER_ASSET_BLEND_MODES = ["source-over", "multiply", "screen", "overlay"] as const;
export type StudioRasterAssetBlendMode = (typeof STUDIO_RASTER_ASSET_BLEND_MODES)[number];

export const STUDIO_RASTER_INTERNAL_LICENSE_REF = "LicenseRef-ToonSpectrum-BuiltIn-AI-Raster-v1" as const;

declare const promptSha256Brand: unique symbol;
export type StudioRasterPromptSha256 = string & {
  readonly [promptSha256Brand]: "StudioRasterPromptSha256";
};

export interface StudioRasterAssetLicense {
  readonly licenseRef: typeof STUDIO_RASTER_INTERNAL_LICENSE_REF;
  readonly scope: "project-internal";
  readonly redistribution: "bundled-with-product";
  readonly attributionRequired: false;
}

export interface StudioRasterAssetProvenance {
  readonly origin: "ai-generated";
  readonly provider: "openai";
  readonly pipeline: "built-in-image-generation";
  readonly model: "gpt-image-2" | "unverified";
  readonly modelVersionVerified?: false;
  readonly generatedOn: `${number}-${number}-${number}`;
  /** SHA-256 of the generation prompt. This is not a file-content digest. */
  readonly promptSha256: StudioRasterPromptSha256;
  /** 최종 이미지 편집 지시문의 SHA-256. 원문 보존 위치는 promptRetention으로 구분한다. */
  readonly editPromptSha256?: StudioRasterPromptSha256;
  readonly promptRetention: "sha256-only" | "source-manifest";
  readonly promptSource?: "/assets/studio/illustration-20260926/PROMPTS.json";
  readonly postProcessing: readonly ("built-in-image-edit" | "local-chroma-key-removal")[];
  readonly humanReviewed: boolean;
  readonly assistantReviewed?: true;
}

export type StudioRasterAssetId = `builtin-raster-${string}`;
export type StudioRasterAssetPath =
  | `/assets/studio/props/${StudioRasterAssetCollection}/${string}.webp`
  | `/assets/studio/illustration-20260926/${string}.png`;

export interface StudioRasterAsset {
  readonly id: StudioRasterAssetId;
  readonly label: string;
  readonly description: string;
  readonly kind: StudioRasterAssetKind;
  readonly collection: StudioRasterAssetCollection;
  readonly src: StudioRasterAssetPath;
  readonly mimeType: "image/webp" | "image/png";
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly repeatable?: boolean;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly tags: readonly string[];
  readonly defaultPlacement: StudioRasterAssetPlacement;
  readonly defaultBlendMode: StudioRasterAssetBlendMode;
  readonly defaultOpacity: number;
  readonly license: StudioRasterAssetLicense;
  readonly provenance: StudioRasterAssetProvenance;
}

export interface StudioRasterAssetFilter {
  /** All normalized query tokens must occur in the label, description, taxonomy, or tags. */
  readonly query?: string;
  /** Exact normalized tag filters. Every requested tag must be present. */
  readonly tags?: readonly string[];
  readonly kinds?: readonly StudioRasterAssetKind[];
  readonly collections?: readonly StudioRasterAssetCollection[];
  readonly placements?: readonly StudioRasterAssetPlacement[];
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

function asPromptSha256(value: string): StudioRasterPromptSha256 {
  if (!SHA256_HEX.test(value)) {
    throw new TypeError("Studio raster prompt hash must be 64 lowercase hexadecimal characters.");
  }
  return value as StudioRasterPromptSha256;
}

const BUILTIN_LICENSE: StudioRasterAssetLicense = Object.freeze({
  licenseRef: STUDIO_RASTER_INTERNAL_LICENSE_REF,
  scope: "project-internal",
  redistribution: "bundled-with-product",
  attributionRequired: false,
});

function provenance(promptSha256: string, editPromptSha256?: string): StudioRasterAssetProvenance {
  return Object.freeze({
    origin: "ai-generated",
    provider: "openai",
    pipeline: "built-in-image-generation",
    model: "gpt-image-2",
    generatedOn: "2026-07-11",
    promptSha256: asPromptSha256(promptSha256),
    ...(editPromptSha256 ? { editPromptSha256: asPromptSha256(editPromptSha256) } : {}),
    promptRetention: "sha256-only",
    postProcessing: editPromptSha256
      ? (["built-in-image-edit", "local-chroma-key-removal"] as const)
      : (["local-chroma-key-removal"] as const),
    humanReviewed: true,
  });
}

const SHARED_IMAGE_METADATA = {
  kind: "prop-cluster",
  mimeType: "image/webp",
  width: 1536,
  height: 1024,
  hasAlpha: true,
  defaultBlendMode: "source-over",
  defaultOpacity: 1,
  license: BUILTIN_LICENSE,
} as const;

export const STUDIO_LEGACY_RASTER_ASSETS = Object.freeze([
  {
    ...SHARED_IMAGE_METADATA,
    id: "builtin-raster-daily-cafe-table-for-two",
    label: "카페 테이블 2인 세트",
    description: "의자 두 개, 원형 테이블, 커피와 케이크가 한 장에 담긴 일상·데이트 장면용 소품 세트",
    collection: "daily",
    src: "/assets/studio/props/daily/webtoon_cafe_table_for_two.webp",
    tags: [
      "일상",
      "카페",
      "테이블",
      "의자",
      "커피",
      "케이크",
      "디저트",
      "데이트",
      "cafe",
      "table",
      "chair",
      "coffee",
      "dessert",
      "date",
    ],
    defaultPlacement: "frame-bottom-center",
    provenance: provenance("ca2d63544261ced0ac4574e81511f07a1c76d7e6e250188f4445ff0ad3a42758"),
  },
  {
    ...SHARED_IMAGE_METADATA,
    id: "builtin-raster-school-desk-study-cluster",
    label: "교실 책상 학습 소품 세트",
    description: "학교 책상과 의자, 교재, 노트, 연필, 필통이 정돈된 학원·교실 장면용 소품 세트",
    collection: "school",
    src: "/assets/studio/props/school/webtoon_school_desk_study_cluster.webp",
    tags: [
      "학교",
      "학원",
      "교실",
      "책상",
      "의자",
      "교재",
      "책",
      "노트",
      "연필",
      "필통",
      "공부",
      "school",
      "classroom",
      "desk",
      "study",
      "book",
      "stationery",
    ],
    defaultPlacement: "frame-bottom-center",
    provenance: provenance(
      "c8d0f0f9cb9dadca26334a7f9ab177ab845557aa89c452cc6160c31171401d74",
      "f3b2a1c692ad2abc0a7b9dbf81d9ac4b537971c43175877f900d31b5456452ae"
    ),
  },
  {
    ...SHARED_IMAGE_METADATA,
    id: "builtin-raster-fantasy-royal-letter-seal-cluster",
    label: "왕실 편지와 밀랍 봉인 세트",
    description: "장식 편지지, 봉투, 왕관 밀랍 인장, 깃펜, 잉크와 반지로 구성된 로맨스 판타지 소품 세트",
    collection: "fantasy",
    src: "/assets/studio/props/fantasy/webtoon_royal_letter_seal_cluster.webp",
    tags: [
      "판타지",
      "로맨스 판타지",
      "로판",
      "왕실",
      "편지",
      "편지지",
      "봉투",
      "밀랍",
      "봉인",
      "인장",
      "깃펜",
      "잉크",
      "반지",
      "fantasy",
      "royal",
      "letter",
      "envelope",
      "wax seal",
      "quill",
      "ink",
    ],
    defaultPlacement: "frame-center",
    provenance: provenance("8d27e67ecc3f362e80cabc9c2fc563d11075d39448d297dd9256f5b6e6f0047d"),
  },
  {
    ...SHARED_IMAGE_METADATA,
    id: "builtin-raster-urban-street-fixture-cluster",
    label: "도시 거리 시설물 세트",
    description: "광고판, 볼라드, 배전함, 가로등, 화분과 교통콘을 모은 현대 도시·골목 장면용 소품 세트",
    collection: "urban",
    src: "/assets/studio/props/urban/webtoon_street_fixture_cluster.webp",
    tags: [
      "도시",
      "거리",
      "골목",
      "광고판",
      "간판",
      "볼라드",
      "배전함",
      "가로등",
      "화분",
      "교통콘",
      "거리 소품",
      "urban",
      "street",
      "sign",
      "billboard",
      "bollard",
      "streetlight",
      "utility box",
      "planter",
      "traffic cone",
    ],
    defaultPlacement: "frame-bottom-center",
    provenance: provenance("85173f61ef38f85e612ce371f8bb9678cef171ee0e6926f55a5989be2d4aba96"),
  },
] as const satisfies readonly StudioRasterAsset[]);

export const STUDIO_ILLUSTRATION_RASTER_ASSETS: readonly StudioRasterAsset[] = Object.freeze(
  STUDIO_ILLUSTRATION_PACK.assets.flatMap((asset): StudioRasterAsset[] => {
    if (asset.kind === "background") return [];
    // 실제 투명 픽셀과 프롬프트 기록을 검증한 원본만 삽입 목록에 올린다.
    if ((!asset.hasAlpha && asset.kind !== "texture") || !asset.promptSha256) return [];
    const filename = asset.src.split("/").at(-1)?.replace(/\.png$/u, "");
    if (!filename) return [];
    return [{
      id: `builtin-raster-${asset.id}`,
      label: asset.title,
      description: asset.kind === "bubble-decoration"
        ? "장식 일러스트와 별도로 편집할 수 있는 대사를 함께 배치합니다."
        : asset.kind === "texture"
          ? "원본 질감을 이미지 레이어로 배치하고 불투명도와 합성 방식을 조정할 수 있습니다."
          : asset.kind === "effect-overlay"
            ? "투명한 효과 원본을 장면 위에 배치하고 크기·합성 방식을 조정할 수 있습니다."
            : "투명 배경 원본으로 보존한 장면 소품 일러스트입니다.",
      kind: asset.kind,
      collection: asset.collection,
      src: `/assets/studio/illustration-20260926/${filename}.png`,
      mimeType: "image/png",
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      sha256: asset.sha256,
      hasAlpha: asset.hasAlpha,
      ...(asset.repeatable === undefined ? {} : { repeatable: asset.repeatable }),
      tags: asset.tags,
      defaultPlacement: asset.kind === "prop-cluster" ? "frame-bottom-center" : "frame-center",
      defaultBlendMode: asset.defaultBlendMode ?? "source-over",
      defaultOpacity: 1,
      license: BUILTIN_LICENSE,
      provenance: {
        origin: "ai-generated",
        provider: "openai",
        pipeline: "built-in-image-generation",
        model: "unverified",
        modelVersionVerified: false,
        generatedOn: "2026-09-26",
        promptSha256: asPromptSha256(asset.promptSha256),
        ...(asset.editPromptSha256 ? { editPromptSha256: asPromptSha256(asset.editPromptSha256) } : {}),
        promptRetention: "source-manifest",
        promptSource: "/assets/studio/illustration-20260926/PROMPTS.json",
        postProcessing: asset.postProcessing,
        humanReviewed: false,
        assistantReviewed: true,
      },
    }];
  }),
);

export const STUDIO_RASTER_ASSETS: readonly StudioRasterAsset[] = Object.freeze([
  ...STUDIO_LEGACY_RASTER_ASSETS,
  ...STUDIO_ILLUSTRATION_RASTER_ASSETS,
]);

function normalizeSearchValue(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function tokenizeQuery(value: string): string[] {
  return normalizeSearchValue(value)
    .split(/[\s,;/|·]+/u)
    .filter(Boolean);
}

function allows<T extends string>(allowed: readonly T[] | undefined, value: T): boolean {
  return !allowed?.length || allowed.includes(value);
}

/**
 * Filters without mutating or reordering the catalog. Query tokens use inclusive substring search;
 * explicit tags use normalized exact matching so callers can build deterministic filter chips.
 */
export function filterStudioRasterAssets(
  assets: readonly StudioRasterAsset[],
  filter: StudioRasterAssetFilter = {}
): readonly StudioRasterAsset[] {
  const queryTokens = tokenizeQuery(filter.query ?? "");
  const requiredTags = (filter.tags ?? []).map(normalizeSearchValue).filter(Boolean);
  const hasTaxonomyFilter = Boolean(
    filter.kinds?.length || filter.collections?.length || filter.placements?.length
  );

  if (queryTokens.length === 0 && requiredTags.length === 0 && !hasTaxonomyFilter) return assets;

  return assets.filter((asset) => {
    if (!allows(filter.kinds, asset.kind)) return false;
    if (!allows(filter.collections, asset.collection)) return false;
    if (!allows(filter.placements, asset.defaultPlacement)) return false;

    const normalizedTags = asset.tags.map(normalizeSearchValue);
    const tagSet = new Set(normalizedTags);
    if (!requiredTags.every((tag) => tagSet.has(tag))) return false;

    if (queryTokens.length === 0) return true;
    const searchable = normalizeSearchValue(
      [asset.label, asset.description, asset.kind, asset.collection, ...normalizedTags].join(" ")
    );
    return queryTokens.every((token) => searchable.includes(token));
  });
}
