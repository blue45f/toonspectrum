/**
 * First-party CC0 environment catalog for Studio BG3D.
 *
 * Entries are immutable deployment metadata. Runtime bytes still pass through the same SHA-256,
 * GLB structure, device-budget, and Three.js admission path as a user-imported model.
 */

export const STUDIO_BG3D_ENVIRONMENT_PACK_ID =
  "toonspectrum-bg3d-environment-pack-v1" as const;
export const STUDIO_BG3D_ENVIRONMENT_PACK_VERSION = 1 as const;

export type StudioBg3dEnvironmentTheme =
  | "home"
  | "hospitality"
  | "urban"
  | "education"
  | "fantasy"
  | "science-fiction";

export interface StudioBg3dEnvironmentAsset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly theme: StudioBg3dEnvironmentTheme;
  readonly tags: readonly string[];
  readonly fileName: `${string}.glb`;
  readonly url: `/assets/3d/environments/${string}.glb`;
  readonly thumbnailUrl: `/assets/3d/environments/thumbnails/${string}.png`;
  readonly byteSize: number;
  readonly sha256: `sha256:${string}`;
  /** Width, height, and depth in the glTF Y-up metre convention. */
  readonly bounds: readonly [number, number, number];
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly fovDegrees: number;
  };
  readonly normalization: "authored-metres";
  readonly provenance: {
    readonly origin: "original-procedural";
    readonly author: "ToonSpectrum";
    readonly generator: "scripts/blender/generate_environment_pack_v3.py";
    readonly blenderVersion: "5.2";
    readonly license: "CC0-1.0";
    readonly licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/";
    readonly attributionRequired: false;
    readonly commercialUse: true;
    readonly externalResources: 0;
  };
}

const PROVENANCE = Object.freeze({
  origin: "original-procedural",
  author: "ToonSpectrum",
  generator: "scripts/blender/generate_environment_pack_v3.py",
  blenderVersion: "5.2",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionRequired: false,
  commercialUse: true,
  externalResources: 0,
} as const);

function defineEnvironment(
  input: Omit<StudioBg3dEnvironmentAsset, "normalization" | "provenance">,
): StudioBg3dEnvironmentAsset {
  return Object.freeze({
    ...input,
    tags: Object.freeze([...input.tags]),
    bounds: Object.freeze([...input.bounds]) as readonly [number, number, number],
    camera: Object.freeze({
      position: Object.freeze([...input.camera.position]) as readonly [number, number, number],
      target: Object.freeze([...input.camera.target]) as readonly [number, number, number],
      fovDegrees: input.camera.fovDegrees,
    }),
    normalization: "authored-metres",
    provenance: PROVENANCE,
  });
}

export const STUDIO_BG3D_ENVIRONMENT_ASSETS = Object.freeze([
  defineEnvironment({
    id: "ts-bg3d-compact_apartment_interior-v1",
    name: "콤팩트 아파트",
    description: "주방·거실·침실·식사 공간이 한 프레임에 이어지는 오픈 월 소형 주거 세트",
    theme: "home",
    tags: ["apartment", "interior", "home", "아파트", "원룸", "실내"],
    fileName: "compact_apartment_interior.glb",
    url: "/assets/3d/environments/compact_apartment_interior.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/compact_apartment_interior.png",
    byteSize: 1_520_948,
    sha256: "sha256:c5409d3c3050725fa14afc67f5d63168ead262d352bcd7294018dd8cf11cdde9",
    bounds: [7, 3.2, 6],
    camera: { position: [8.8, 6.8, 9.6], target: [0, 1.25, 0], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-stylized_cafe_interior-v1",
    name: "스타일라이즈드 카페",
    description: "서비스 바·에스프레소 머신·진열장·12석 테이블을 갖춘 밝은 카페 세트",
    theme: "hospitality",
    tags: ["cafe", "coffee", "restaurant", "카페", "커피숍", "실내"],
    fileName: "stylized_cafe_interior.glb",
    url: "/assets/3d/environments/stylized_cafe_interior.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/stylized_cafe_interior.png",
    byteSize: 2_476_104,
    sha256: "sha256:f0e038d48f6906c1316e3cbb633cb92c72a0053091acdb28a83d11b74e9cee2a",
    bounds: [9, 3.6, 7],
    camera: { position: [11.4, 8.1, 12.8], target: [0, 1.35, 0.4], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-urban_neon_alley-v1",
    name: "어반 네온 골목",
    description: "양면 건물·비상계단·배관·간판·젖은 노면을 따라 전후 이동 가능한 야간 골목",
    theme: "urban",
    tags: ["alley", "neon", "cyberpunk", "street", "골목", "야경", "도시"],
    fileName: "urban_neon_alley.glb",
    url: "/assets/3d/environments/urban_neon_alley.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/urban_neon_alley.png",
    byteSize: 2_971_100,
    sha256: "sha256:4506e1d3fe34bfcd2dd754f237047c33d5a749218cdf7fb71266b98374e358e3",
    bounds: [6.8, 7, 14],
    camera: { position: [0, 5.7, 19], target: [0, 2.55, -1], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-classroom_art_studio-v1",
    name: "미술 교실 스튜디오",
    description: "8개 이젤·드로잉 스툴·조각대·물감 수납·개수대를 갖춘 미술 수업 공간",
    theme: "education",
    tags: ["classroom", "art", "studio", "school", "교실", "미술실", "학교"],
    fileName: "classroom_art_studio.glb",
    url: "/assets/3d/environments/classroom_art_studio.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/classroom_art_studio.png",
    byteSize: 2_167_224,
    sha256: "sha256:b0e14d9e45b8181798a09fc675d6c3aadf46bae5a2b24200fe751518c55016d8",
    bounds: [10, 4, 8],
    camera: { position: [12.8, 9.4, 14.2], target: [0, 1.45, 0], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-fantasy_ruin_courtyard-v1",
    name: "판타지 유적 안뜰",
    description: "부서진 열주·3개 석조 아치·룬 분수·덩굴이 둘러싼 원형 판타지 코트야드",
    theme: "fantasy",
    tags: ["fantasy", "ruin", "courtyard", "magic", "판타지", "유적", "마법"],
    fileName: "fantasy_ruin_courtyard.glb",
    url: "/assets/3d/environments/fantasy_ruin_courtyard.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/fantasy_ruin_courtyard.png",
    byteSize: 2_081_960,
    sha256: "sha256:cd7b7aaa142c473b8373c9d666edc2d130ee0735a2290502489d721f1d87cb22",
    bounds: [11.4, 6, 11.4],
    camera: { position: [14.7, 11.2, 16.5], target: [0, 2, 0], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-scifi_command_corridor-v1",
    name: "SF 커맨드 복도",
    description: "반복 리브·서비스 패널·12석 지휘 베이·홀로그램을 잇는 장거리 우주선 복도",
    theme: "science-fiction",
    tags: ["scifi", "corridor", "command", "spaceship", "SF", "우주선", "복도"],
    fileName: "scifi_command_corridor.glb",
    url: "/assets/3d/environments/scifi_command_corridor.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/scifi_command_corridor.png",
    byteSize: 3_486_400,
    sha256: "sha256:a2eff1b6d07f8e09ef2f1deebc240dd5ccb591384bce59d5f092cc4dd0d59821",
    bounds: [7, 4.5, 16],
    camera: { position: [0, 4.9, 20.5], target: [0, 2, -2.8], fovDegrees: 44 },
  }),
] as const satisfies readonly StudioBg3dEnvironmentAsset[]);

const ENVIRONMENT_BY_ID = new Map(
  STUDIO_BG3D_ENVIRONMENT_ASSETS.map((asset) => [asset.id, asset] as const),
);
const ENVIRONMENT_BY_HASH = new Map(
  STUDIO_BG3D_ENVIRONMENT_ASSETS.map((asset) => [asset.sha256, asset] as const),
);

export function getStudioBg3dEnvironmentAsset(
  id: string,
): StudioBg3dEnvironmentAsset | null {
  return ENVIRONMENT_BY_ID.get(id) ?? null;
}

export function getStudioBg3dEnvironmentAssetByHash(
  hash: string,
): StudioBg3dEnvironmentAsset | null {
  return ENVIRONMENT_BY_HASH.get(hash as `sha256:${string}`) ?? null;
}

export function isStudioBg3dEnvironmentAssetId(id: string): boolean {
  return ENVIRONMENT_BY_ID.has(id);
}
