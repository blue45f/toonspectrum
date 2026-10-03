/**
 * 가상 공간 배경 테마 시스템 (트랙 H · 비주얼 웨이브)
 *
 * 아트 스타일(이미지 팩 교체)과 별개의 축이다. 테마는 공간 자체의 스타일만 바꾼다:
 * 구역 바닥 패턴·색, 벽 틴트, 월드 밖 배경 그라데이션, 섬 절벽·광장 석재색, 장식 변형.
 *
 * - 전면 틴트·오버레이·워시는 넣지 않는다 (2026-10-02 사용자 확정: 화면 전체에 깔리는
 *   앰비언트 효과는 제거 대상이며 재도입 금지). 주야 사이클 틴트 상한 0.22 규칙과도 무관하게,
 *   이 모듈은 전역 오버레이 알파를 만들지 않는다.
 * - 날씨·파티클 렌더에는 관여하지 않는다. 테마가 어두워도(네온 나이트) 색 자체가 어두울 뿐
 *   블러·헤이즈·반투명 막을 씌우지 않아 선명도가 유지된다.
 * - 적용 지점: 캠퍼스 런타임(벽·바닥·절벽·광장·장식)이 테마를 읽고, 캔버스가 카메라 배경색과
 *   호스트 배경 그라데이션을 테마에서 가져간다. 방 단위 공유가 아니라 이 브라우저의 로컬
 *   적용이며 선택은 localStorage에 저장돼 재입장 시 유지된다.
 */
import type { StudioCampusZoneTone } from "./studio-virtual-space-campus-blueprint";

export const STUDIO_SPACE_THEME_KEYS = [
  "modern-office",
  "cozy-wood",
  "neon-night",
  "garden-terrace",
  "library",
] as const;
export type StudioSpaceThemeKey = (typeof STUDIO_SPACE_THEME_KEYS)[number];

export const DEFAULT_STUDIO_SPACE_THEME: StudioSpaceThemeKey = "modern-office";
export const STUDIO_SPACE_THEME_STORAGE_KEY = "toonspectrum:virtual-space-theme:v1";

/** 프로시저럴 바닥 텍스처 패턴. 캠퍼스 텍스처 모듈이 패턴별로 타일을 그린다. */
export const STUDIO_SPACE_THEME_FLOOR_PATTERNS = [
  "planks",
  "marble",
  "carpet",
  "deck",
  "lawn",
  "slate",
  "stone",
  "sand",
  "checker",
] as const;
export type StudioSpaceThemeFloorPattern = (typeof STUDIO_SPACE_THEME_FLOOR_PATTERNS)[number];

export interface StudioSpaceThemeFloorSpec {
  readonly pattern: StudioSpaceThemeFloorPattern;
  /** 바닥 기본색. */
  readonly base: number;
  /** 패턴 선·점·결에 쓰는 보조색. */
  readonly accent: number;
}

/** 구역 톤 전체를 키로 가지는 맵. 톤이 빠지면 그 구역만 기본 스타일로 남아 테마가 반쪽이 되므로 전 톤 명시를 강제한다. */
export type StudioSpaceThemeToneMap<T> = Readonly<Record<StudioCampusZoneTone, T>>;

export interface StudioSpaceTheme {
  readonly key: StudioSpaceThemeKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 월드 밖 배경 그라데이션 (위→아래 CSS hex 3단). */
  readonly backgroundGradient: readonly [string, string, string];
  /** Phaser 카메라 배경색 (맵 밖 영역). */
  readonly backgroundColor: number;
  /** 구역 톤별 벽 틴트. */
  readonly wallTints: StudioSpaceThemeToneMap<number>;
  /** 구역 톤별 바닥 스펙. */
  readonly floors: StudioSpaceThemeToneMap<StudioSpaceThemeFloorSpec>;
  /** 섬 절벽 바위색. */
  readonly cliff: number;
  /** 광장 바닥 석재색. */
  readonly plazaStone: number;
  /** 장식 변형 식별자 (간판·매트·난간 등 장식 텍스처 변형의 기준값). */
  readonly decorVariant: string;
  /** 장식 포인트색 (문턱 매트·난간·썸네일 표시에 쓴다). */
  readonly decorAccent: number;
}

const floor = (pattern: StudioSpaceThemeFloorPattern, base: number, accent: number): StudioSpaceThemeFloorSpec =>
  Object.freeze({ pattern, base, accent });

export const STUDIO_SPACE_THEMES: readonly StudioSpaceTheme[] = Object.freeze([
  {
    key: "modern-office",
    labelKo: "모던 오피스",
    labelEn: "Modern Office",
    descriptionKo: "밝은 대리석과 밝은 우드, 차분한 카펫으로 정리한 지금의 스튜디오 기본 모습이에요.",
    descriptionEn: "The studio's default look: bright marble, pale wood and calm carpet.",
    backgroundGradient: ["#bfe0f7", "#e8f3fb", "#f7fafc"],
    backgroundColor: 0xdceefb,
    wallTints: {
      marble: 0xd9cdb8, wood: 0x8f6f58, oak: 0x7d8796, cafe: 0xa0704f, carpet: 0x9a6a5c,
      stone: 0x8c93a1, stage: 0x3c3f6e, mosaic: 0xc9c0b0, sand: 0xb58a5a, lavender: 0x5b4b8a, grass: 0x8a9a72,
    },
    floors: {
      marble: floor("marble", 0xe9e2d2, 0xcabfa8),
      wood: floor("planks", 0xd9b98f, 0xb28c5c),
      oak: floor("planks", 0xb9906a, 0x8f6c48),
      cafe: floor("planks", 0xa5714a, 0x7d5233),
      carpet: floor("carpet", 0x8d7f92, 0x6f6178),
      stone: floor("stone", 0xb9b2a4, 0x948c7c),
      stage: floor("planks", 0x3a3e63, 0x2b2e4a),
      mosaic: floor("checker", 0xe6ddca, 0x9a8f78),
      sand: floor("sand", 0xe6cf9e, 0xcbb27e),
      lavender: floor("carpet", 0xa493c4, 0x8474ab),
      grass: floor("lawn", 0x8fc97a, 0x6cab52),
    },
    cliff: 0x6c5a4c,
    plazaStone: 0xd9d2c3,
    decorVariant: "brushed-metal",
    decorAccent: 0x8d93a6,
  },
  {
    key: "cozy-wood",
    labelKo: "코지 우드",
    labelEn: "Cozy Wood",
    descriptionKo: "원목 벽과 따뜻한 바닥, 러그 같은 카펫으로 산장 로지처럼 포근하게 바꾼 테마예요.",
    descriptionEn: "Warm timber walls, honeyed floors and rug-like carpet for a lodge feel.",
    backgroundGradient: ["#f3d9ae", "#f7e8cf", "#fbf3e2"],
    backgroundColor: 0xf5e3c2,
    wallTints: {
      marble: 0xcfa87e, wood: 0x9a6b42, oak: 0x8a5f3a, cafe: 0xa5713d, carpet: 0x8a5a40,
      stone: 0xb08a5e, stage: 0x6e4630, mosaic: 0xc7a171, sand: 0xbd9260, lavender: 0xa97c5f, grass: 0x9a7c50,
    },
    floors: {
      marble: floor("planks", 0xd8b184, 0xb28a58),
      wood: floor("planks", 0xc49a66, 0x9c7443),
      oak: floor("planks", 0xa87c4e, 0x82592f),
      cafe: floor("deck", 0x9c6a3d, 0x75502c),
      carpet: floor("carpet", 0x9c5a48, 0x7c4234),
      stone: floor("planks", 0xbb9668, 0x94744a),
      stage: floor("planks", 0x5f4128, 0x453019),
      mosaic: floor("checker", 0xd9b98c, 0x8a5f3a),
      sand: floor("deck", 0xd3ab77, 0xb28c58),
      lavender: floor("carpet", 0xa8765c, 0x86573f),
      grass: floor("lawn", 0x9cc46e, 0x7aa653),
    },
    cliff: 0x8a6a4e,
    plazaStone: 0xd8bd97,
    decorVariant: "warm-wood",
    decorAccent: 0xb98a2e,
  },
  {
    key: "neon-night",
    labelKo: "네온 나이트",
    labelEn: "Neon Night",
    descriptionKo: "짙은 슬레이트 바닥과 어두운 벽, 시안 포인트로 빛나는 야간 크리에이터 허브예요. 어둡지만 막을 씌우지 않아 선명해요.",
    descriptionEn: "Deep slate floors, dark walls and cyan accents for a night creator hub — dark, never hazed.",
    backgroundGradient: ["#070b18", "#101a33", "#1b2840"],
    backgroundColor: 0x0d1526,
    wallTints: {
      marble: 0x39466b, wood: 0x2c3a5e, oak: 0x2a3350, cafe: 0x34284f, carpet: 0x3a2a55,
      stone: 0x2e3a58, stage: 0x3b2a6e, mosaic: 0x35477a, sand: 0x2a3350, lavender: 0x4a2a6e, grass: 0x1f3a3f,
    },
    floors: {
      marble: floor("slate", 0x27324e, 0x38dfff),
      wood: floor("slate", 0x232c46, 0x2f6f8f),
      oak: floor("slate", 0x202940, 0x35507a),
      cafe: floor("slate", 0x2a2344, 0xb35cff),
      carpet: floor("carpet", 0x33234f, 0x4a2f73),
      stone: floor("slate", 0x252f4a, 0x3d5a8a),
      stage: floor("slate", 0x1d1838, 0xff7aa8),
      mosaic: floor("checker", 0x2c3a5e, 0x141c30),
      sand: floor("slate", 0x27324e, 0x2a9db5),
      lavender: floor("carpet", 0x3c2560, 0xb35cff),
      grass: floor("slate", 0x1c3038, 0x39b98c),
    },
    cliff: 0x232a44,
    plazaStone: 0x39466b,
    decorVariant: "neon-glow",
    decorAccent: 0x38dfff,
  },
  {
    key: "garden-terrace",
    labelKo: "가든 테라스",
    labelEn: "Garden Terrace",
    descriptionKo: "잔디와 데크, 테라코타 벽으로 온실 테라스처럼 싱그럽게 바꾼 테마예요.",
    descriptionEn: "Lawns, deck boards and terracotta walls for a fresh greenhouse terrace.",
    backgroundGradient: ["#cdeec2", "#e6f6da", "#f4fbef"],
    backgroundColor: 0xdff3d2,
    wallTints: {
      marble: 0xe3d9bd, wood: 0xa8b57e, oak: 0x93a86f, cafe: 0xc08552, carpet: 0xa3ad7a,
      stone: 0xb5bfa0, stage: 0x7a8a4f, mosaic: 0xd9d2ae, sand: 0xc9a061, lavender: 0xa8b57e, grass: 0x8fae62,
    },
    floors: {
      marble: floor("stone", 0xdcd6ba, 0xb5ad8d),
      wood: floor("deck", 0xb9906a, 0x8f6c48),
      oak: floor("deck", 0xa87c50, 0x82603a),
      cafe: floor("deck", 0xb3814f, 0x8a5f33),
      carpet: floor("lawn", 0x93cc74, 0x71ab54),
      stone: floor("stone", 0xcac2a4, 0xa39a7c),
      stage: floor("deck", 0x8a6f42, 0x6b5430),
      mosaic: floor("checker", 0xe4dfc2, 0x8fae62),
      sand: floor("sand", 0xecd3a0, 0xd0b57f),
      lavender: floor("lawn", 0xa4cf82, 0x7fb45f),
      grass: floor("lawn", 0x8fc97a, 0x68a84e),
    },
    cliff: 0x7a8a5a,
    plazaStone: 0xcfd8b8,
    decorVariant: "garden-ivy",
    decorAccent: 0x3d9452,
  },
  {
    key: "library",
    labelKo: "클래식 라이브러리",
    labelEn: "Classic Library",
    descriptionKo: "짙은 원목과 버건디 카펫, 흑백 체커 대리석으로 오래된 서재처럼 묵직하게 바꾼 테마예요.",
    descriptionEn: "Dark timber, burgundy carpet and black-and-white checker marble for an old library.",
    backgroundGradient: ["#3a3f35", "#574a38", "#6e5c42"],
    backgroundColor: 0x4a4132,
    wallTints: {
      marble: 0x8a7a5c, wood: 0x5f4630, oak: 0x54402c, cafe: 0x64452c, carpet: 0x5c2e35,
      stone: 0x6e6250, stage: 0x3f3428, mosaic: 0x7d7264, sand: 0x8a6f4a, lavender: 0x54453a, grass: 0x4f5a42,
    },
    floors: {
      marble: floor("marble", 0xcfc4a8, 0x8a7c5e),
      wood: floor("planks", 0x7d5a38, 0x5c4023),
      oak: floor("planks", 0x6e4e2f, 0x4f3519),
      cafe: floor("planks", 0x75522f, 0x573b1e),
      carpet: floor("carpet", 0x74333c, 0x55242b),
      stone: floor("stone", 0x9a8d76, 0x77694f),
      stage: floor("planks", 0x4a3823, 0x332612),
      mosaic: floor("checker", 0xe8e2d2, 0x2e2a26),
      sand: floor("carpet", 0x8a6f4a, 0x6b5433),
      lavender: floor("carpet", 0x63454a, 0x483035),
      grass: floor("carpet", 0x55614a, 0x3f4a36),
    },
    cliff: 0x4c4438,
    plazaStone: 0xb8a888,
    decorVariant: "classic-brass",
    decorAccent: 0xb98a2e,
  },
]);

export function isStudioSpaceThemeKey(value: unknown): value is StudioSpaceThemeKey {
  return typeof value === "string" && (STUDIO_SPACE_THEME_KEYS as readonly string[]).includes(value);
}

export function studioSpaceTheme(key: StudioSpaceThemeKey): StudioSpaceTheme {
  return STUDIO_SPACE_THEMES.find((theme) => theme.key === key) ?? STUDIO_SPACE_THEMES[0]!;
}

/** 구역의 벽 틴트: 테마가 톤별로 정한 값을 쓰고, 해석할 수 없으면 블루프린트 기본값으로 되돌린다. */
export function studioSpaceThemeWallTint(
  theme: StudioSpaceTheme,
  zone: { readonly tone: StudioCampusZoneTone; readonly wallTint: number },
): number {
  return theme.wallTints[zone.tone] ?? zone.wallTint;
}

/** 구역 톤의 바닥 스펙. */
export function studioSpaceThemeFloorSpec(
  theme: StudioSpaceTheme,
  tone: StudioCampusZoneTone,
): StudioSpaceThemeFloorSpec {
  return theme.floors[tone];
}

const hex = (color: number): string => `#${(color & 0xff_ff_ff).toString(16).padStart(6, "0")}`;

/** 테마 선택 UI 썸네일용 색 견본 (전부 CSS로 그릴 수 있는 문자열 값). */
export interface StudioSpaceThemeSwatch {
  /** 배경 그라데이션 CSS. */
  readonly gradientCss: string;
  /** 대표 바닥색 (로비 톤 기준). */
  readonly floor: string;
  /** 대표 벽색 (로비 톤 기준). */
  readonly wall: string;
  /** 장식 포인트색. */
  readonly accent: string;
}

export function studioSpaceThemeSwatch(theme: StudioSpaceTheme): StudioSpaceThemeSwatch {
  const [top, middle, bottom] = theme.backgroundGradient;
  return Object.freeze({
    gradientCss: `linear-gradient(180deg, ${top} 0%, ${middle} 55%, ${bottom} 100%)`,
    floor: hex(theme.floors.marble.base),
    wall: hex(theme.wallTints.marble),
    accent: hex(theme.decorAccent),
  });
}

export function readStudioSpaceTheme(): StudioSpaceThemeKey {
  if (typeof window === "undefined") return DEFAULT_STUDIO_SPACE_THEME;
  try {
    const value = window.localStorage.getItem(STUDIO_SPACE_THEME_STORAGE_KEY);
    return isStudioSpaceThemeKey(value) ? value : DEFAULT_STUDIO_SPACE_THEME;
  } catch {
    return DEFAULT_STUDIO_SPACE_THEME;
  }
}

export function writeStudioSpaceTheme(value: StudioSpaceThemeKey): boolean {
  if (typeof window === "undefined" || !isStudioSpaceThemeKey(value)) return false;
  try {
    window.localStorage.setItem(STUDIO_SPACE_THEME_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
