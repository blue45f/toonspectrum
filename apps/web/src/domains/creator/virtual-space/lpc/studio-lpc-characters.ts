/**
 * LPC 픽셀 캐릭터(NPC 8명·플레이어 프리셋 12종)를 가상 스튜디오 캐릭터 스킨으로 연결한다.
 *
 * 시트는 `scripts/virtual-studio/build-lpc-characters.mjs`가 오픈소스 Universal LPC 생성기의 레이어를 겹쳐 만든
 * `public/assets/virtual-studio/characters-lpc-v1/<id>/{walk,idle,sit,emote,run}.webp`이다(64px 원본 × 2배 최근접 확대).
 * 행은 LPC 순서(위·왼쪽·아래·오른쪽)이고, 걷기 시트 0열(서기)은 정지 프레임, 1~8열은 걷기 순환이다.
 * 기존 렌더 경로(걷기 클립·idle 프레임·sit/wave 포즈·talk 동작)에 그대로 맞추며 캔버스를 바꾸지 않는다.
 * 목록·라벨은 생성 manifest.json과 테스트로 대조한다.
 */
import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import type { StudioCharacterAtlasLayout } from "../studio-virtual-space-character-atlas";
import type {
  StudioCharacterAtlasClip,
  StudioCharacterFramePresentation,
  StudioCharacterPoseSheet,
  StudioCharacterSkin,
} from "../studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "../studio-virtual-space-model";

export const STUDIO_LPC_ASSET_ROOT = "/assets/virtual-studio/characters-lpc-v1";
export const STUDIO_LPC_MANIFEST_URL = `${STUDIO_LPC_ASSET_ROOT}/manifest.json`;
export const STUDIO_LPC_CREDITS_URL = `${STUDIO_LPC_ASSET_ROOT}/credits.json`;
export const STUDIO_LPC_CREDITS_MARKDOWN_URL = `${STUDIO_LPC_ASSET_ROOT}/CREDITS.md`;
export const STUDIO_LPC_GENERATOR_URL = "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator";

/**
 * credits.json 요약: 작가(같은 사람의 다른 표기는 합침)와 라이선스별 레이어 수.
 * 화면 크레딧이 네트워크 없이 바로 보이도록 정적으로 두고, 테스트가 생성 결과(credits.json)와 대조한다.
 */
export interface StudioLpcLicenseUse {
  readonly license: string;
  readonly url: string;
  readonly layers: number;
}
export const STUDIO_LPC_CREDIT_AUTHORS: readonly string[] = Object.freeze([
  "Benjamin K. Smith (BenCreating)", "bluecarrot16", "Durrani", "Eliza Wyatt (ElizaWy)", "Evert", "JaidynReiman",
  "Joe White", "Johannes Sjölund (wulax)", "kcilds/Rocetti/Eredah", "Lanea Zimmerman (Sharm)", "Mandi Paugh",
  "Manuel Riecke (MrBeast)", "Matthew Krohn (makrohn)", "MuffinElZangano", "Nila122", "Pierre Vigier (pvigier)",
  "Stephen Challener (Redshrike)", "thecilekli", "TheraHedwig", "William.Thompsonj",
]);
export const STUDIO_LPC_LICENSE_USES: readonly StudioLpcLicenseUse[] = Object.freeze([
  { license: "OGA-BY 3.0", url: "https://static.opengameart.org/OGA-BY-3.0.txt", layers: 43 },
  { license: "OGA-BY 3.0+", url: "https://static.opengameart.org/OGA-BY-3.0.txt", layers: 1 },
  { license: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/", layers: 9 },
  { license: "CC-BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", layers: 1 },
].map((item) => Object.freeze(item)));

/** LPC 원본 64px 프레임을 2배 최근접 확대했다. 선형 필터로 다시 확대·축소돼도 픽셀 경계가 번지지 않는다. */
export const STUDIO_LPC_SOURCE_FRAME = 64;
export const STUDIO_LPC_PIXEL_SCALE = 2;
export const STUDIO_LPC_FRAME = STUDIO_LPC_SOURCE_FRAME * STUDIO_LPC_PIXEL_SCALE;

/** LPC 시트 행 순서. */
export const STUDIO_LPC_DIRECTIONS: readonly StudioVirtualSpaceFacing[] = Object.freeze(["up", "left", "down", "right"]);
const DIRECTION_ROW: Readonly<Record<StudioVirtualSpaceFacing, number>> = Object.freeze({ up: 0, left: 1, down: 2, right: 3 });

export type StudioLpcAnimationKey = "walk" | "idle" | "sit" | "emote" | "run";

/** 애니메이션별 열 수(LPC 원본과 같다). 걷기 0열=서기, 앉기 2열=의자, 이모트 2열=양손 들기. */
export const STUDIO_LPC_ANIMATION_COLUMNS: Readonly<Record<StudioLpcAnimationKey, number>> = Object.freeze({
  walk: 9, idle: 2, sit: 3, emote: 3, run: 8,
});
export const STUDIO_LPC_ANIMATION_KEYS = Object.freeze(Object.keys(STUDIO_LPC_ANIMATION_COLUMNS) as StudioLpcAnimationKey[]);
const WALK_STAND_COLUMN = 0;
const WALK_CYCLE = Object.freeze({ first: 1, last: 8 });
const SIT_CHAIR_COLUMN = 2;
const EMOTE_CHEER_COLUMN = 2;

/**
 * 원본 64px에서 발바닥은 62px, 서 있는 머리 꼭대기는 머리 모양에 따라 13~15px이다.
 * 몸(약 48px)이 기존 캐릭터와 같은 높이(시각 높이의 약 0.96배)가 되도록 프레임을 시각 높이의 1.28배로 그린다.
 * 의자 앉기는 엉덩이(49px)를 좌석 부착점으로 쓴다.
 */
export const STUDIO_LPC_PRESENTATION: StudioCharacterFramePresentation = Object.freeze({
  originX: 0.5,
  originY: 62 / STUDIO_LPC_SOURCE_FRAME,
  displayHeightRatio: 1.28,
});
export const STUDIO_LPC_SEATED_PRESENTATION: StudioCharacterFramePresentation = Object.freeze({
  ...STUDIO_LPC_PRESENTATION,
  seatOriginY: 49 / STUDIO_LPC_SOURCE_FRAME,
});

/** 걷기 한 순환(두 걸음)에 해당하는 이동 거리(월드 px). 원본 약 64px 보폭 × 표시 배율에 맞췄다. */
export const STUDIO_LPC_WALK_DISTANCE_PER_CYCLE = 100;

export type StudioLpcNpcKey =
  | "npc-concierge" | "npc-producer" | "npc-editor" | "npc-artist"
  | "npc-archivist" | "npc-cafe" | "npc-security" | "npc-host";

export interface StudioLpcCharacter {
  readonly id: string;
  readonly kind: "npc" | "player";
  /** NPC면 기존 NPC 정의의 skinKey(대화·초상화 identity)와 같다. */
  readonly npcKey?: StudioLpcNpcKey;
  readonly labelKo: string;
  readonly labelEn: string;
}

function character(value: StudioLpcCharacter): StudioLpcCharacter {
  return Object.freeze(value);
}

export const STUDIO_LPC_CHARACTERS: readonly StudioLpcCharacter[] = Object.freeze([
  character({ id: "npc-concierge", kind: "npc", npcKey: "npc-concierge", labelKo: "모아 · 컨시어지", labelEn: "Moa · Concierge" }),
  character({ id: "npc-producer", kind: "npc", npcKey: "npc-producer", labelKo: "윤 · 프로듀서", labelEn: "Yoon · Producer" }),
  character({ id: "npc-editor", kind: "npc", npcKey: "npc-editor", labelKo: "솔 · 리뷰 에디터", labelEn: "Sol · Review editor" }),
  character({ id: "npc-artist", kind: "npc", npcKey: "npc-artist", labelKo: "하루 · 아틀리에 메이트", labelEn: "Haru · Atelier mate" }),
  character({ id: "npc-archivist", kind: "npc", npcKey: "npc-archivist", labelKo: "담 · 에셋 아키비스트", labelEn: "Dam · Asset archivist" }),
  character({ id: "npc-cafe", kind: "npc", npcKey: "npc-cafe", labelKo: "린 · 카페 매니저", labelEn: "Rin · Cafe manager" }),
  character({ id: "npc-security", kind: "npc", npcKey: "npc-security", labelKo: "준 · 공간 안전 요원", labelEn: "Jun · Space safety" }),
  character({ id: "npc-host", kind: "npc", npcKey: "npc-host", labelKo: "나비 · 이벤트 진행자", labelEn: "Nabi · Event host" }),
  character({ id: "player-seoha", kind: "player", labelKo: "서하 · 웹툰 작가", labelEn: "Seoha · Webtoon artist" }),
  character({ id: "player-doyun", kind: "player", labelKo: "도윤 · 콘티 작가", labelEn: "Doyun · Storyboard artist" }),
  character({ id: "player-amara", kind: "player", labelKo: "아마라 · 배경 작가", labelEn: "Amara · Background artist" }),
  character({ id: "player-luka", kind: "player", labelKo: "루카 · 채색 어시스턴트", labelEn: "Luka · Color assistant" }),
  character({ id: "player-hana", kind: "player", labelKo: "하나 · 스토리 PD", labelEn: "Hana · Story PD" }),
  character({ id: "player-teo", kind: "player", labelKo: "테오 · 3D 아티스트", labelEn: "Teo · 3D artist" }),
  character({ id: "player-mio", kind: "player", labelKo: "미오 · 캐릭터 디자이너", labelEn: "Mio · Character designer" }),
  character({ id: "player-minjae", kind: "player", labelKo: "민재 · 편집 PD", labelEn: "Minjae · Editorial PD" }),
  character({ id: "player-noor", kind: "player", labelKo: "누르 · 식자 담당", labelEn: "Noor · Lettering artist" }),
  character({ id: "player-jeongho", kind: "player", labelKo: "정호 · 시니어 작가", labelEn: "Jeongho · Senior artist" }),
  character({ id: "player-lea", kind: "player", labelKo: "레아 · 일러스트레이터", labelEn: "Lea · Illustrator" }),
  character({ id: "player-kai", kind: "player", labelKo: "카이 · 사운드 디렉터", labelEn: "Kai · Sound director" }),
]);

/**
 * LPC NPC를 쓰는 공간 아트 스타일. 16비트 RPG 도시인 픽셀 아틀리에(retro)에서는 NPC도 LPC 픽셀 캐릭터로 맞추고,
 * 다른 스타일은 기존 일러스트 NPC를 유지한다(월드 스크린샷 비교 후 결정한 선택형 적용).
 */
export const STUDIO_LPC_NPC_ART_STYLES: ReadonlySet<StudioVirtualArtStyleKey> = new Set<StudioVirtualArtStyleKey>(["retro"]);

export function studioLpcSkinKey(id: string): string {
  return `lpc-${id}`;
}

export function studioLpcSheetUrl(id: string, animation: StudioLpcAnimationKey): string {
  return `${STUDIO_LPC_ASSET_ROOT}/${id}/${animation}.webp`;
}

/** 원본 크기와 격자를 정수로 선언해 로더가 다른 크기의 시트를 받으면 거부하게 한다. */
export function studioLpcAtlas(animation: StudioLpcAnimationKey): StudioCharacterAtlasLayout {
  const columns = STUDIO_LPC_ANIMATION_COLUMNS[animation];
  return Object.freeze({
    width: columns * STUDIO_LPC_FRAME,
    height: STUDIO_LPC_DIRECTIONS.length * STUDIO_LPC_FRAME,
    columns,
    rows: STUDIO_LPC_DIRECTIONS.length,
    slicing: "rounded-grid",
  });
}

/** 시트 안에서 방향 행·열의 Phaser 프레임 번호(행 우선). */
export function studioLpcFrameIndex(animation: StudioLpcAnimationKey, facing: StudioVirtualSpaceFacing, column: number): number {
  return DIRECTION_ROW[facing] * STUDIO_LPC_ANIMATION_COLUMNS[animation] + column;
}

function presentations(count: number, presentation: StudioCharacterFramePresentation): readonly StudioCharacterFramePresentation[] {
  return Object.freeze(Array.from({ length: count }, () => presentation));
}

function sheet(id: string, animation: StudioLpcAnimationKey) {
  return { textureUrl: studioLpcSheetUrl(id, animation), frameWidth: STUDIO_LPC_FRAME, frameHeight: STUDIO_LPC_FRAME, atlas: studioLpcAtlas(animation) };
}

function walkClip(id: string, facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  const start = studioLpcFrameIndex("walk", facing, WALK_CYCLE.first);
  const end = studioLpcFrameIndex("walk", facing, WALK_CYCLE.last);
  return Object.freeze({
    ...sheet(id, "walk"), start, end, frameRate: 10, repeat: -1,
    distancePerCycle: STUDIO_LPC_WALK_DISTANCE_PER_CYCLE, technique: "drawn",
    frames: presentations(end - start + 1, STUDIO_LPC_PRESENTATION),
  });
}

/** 대화 중에는 LPC 제자리 호흡 2프레임을 천천히 반복한다. */
function talkClip(id: string, facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  const start = studioLpcFrameIndex("idle", facing, 0);
  return Object.freeze({
    ...sheet(id, "idle"), start, end: start + 1, frameRate: 2, repeat: -1, technique: "drawn",
    frames: presentations(2, STUDIO_LPC_PRESENTATION),
  });
}

function pose(id: string, animation: "sit" | "emote", column: number, presentation: StudioCharacterFramePresentation): StudioCharacterPoseSheet {
  const columns = STUDIO_LPC_ANIMATION_COLUMNS[animation];
  return Object.freeze({
    ...sheet(id, animation),
    directionFrames: Object.freeze(Object.fromEntries(STUDIO_LPC_DIRECTIONS.map((facing) => [
      facing, studioLpcFrameIndex(animation, facing, column),
    ])) as Record<StudioVirtualSpaceFacing, number>),
    frames: presentations(columns * STUDIO_LPC_DIRECTIONS.length, presentation),
  });
}

function byFacing<T>(make: (facing: StudioVirtualSpaceFacing) => T): Readonly<Record<StudioVirtualSpaceFacing, T>> {
  return Object.freeze({ down: make("down"), left: make("left"), right: make("right"), up: make("up") });
}

/**
 * LPC 캐릭터 스킨. 모든 방향이 동작별 시트 하나를 공유하므로 텍스처는 동작마다 한 번만 올린다.
 * 정지 프레임은 걷기 시트의 서기 열(걷기 순환 밖)이며 표시 좌표를 `idlePresentation`으로 명시한다.
 */
export function createStudioLpcSkin(source: StudioLpcCharacter): StudioCharacterSkin {
  const walkUrl = studioLpcSheetUrl(source.id, "walk");
  return Object.freeze({
    key: studioLpcSkinKey(source.id),
    labelKo: source.labelKo,
    labelEn: source.labelEn,
    // 새 프리셋이 기존 자동 identity 배정을 바꾸지 않도록 명시 선택에만 노출한다.
    selectionOnly: true,
    pixelArt: "lpc",
    sharedMotionSheets: true,
    directional: Object.freeze({ down: walkUrl, left: walkUrl, right: walkUrl, up: walkUrl }),
    clips: Object.freeze({
      "walk-down": walkClip(source.id, "down"),
      "walk-left": walkClip(source.id, "left"),
      "walk-right": walkClip(source.id, "right"),
      "walk-up": walkClip(source.id, "up"),
    }),
    idleFrames: byFacing((facing) => studioLpcFrameIndex("walk", facing, WALK_STAND_COLUMN)),
    idlePresentation: STUDIO_LPC_PRESENTATION,
    actions: Object.freeze({ talk: byFacing((facing) => talkClip(source.id, facing)) }),
    poses: Object.freeze({
      sit: pose(source.id, "sit", SIT_CHAIR_COLUMN, STUDIO_LPC_SEATED_PRESENTATION),
      wave: pose(source.id, "emote", EMOTE_CHEER_COLUMN, STUDIO_LPC_PRESENTATION),
    }),
  });
}

/** 플레이어 선택 목록에 붙는 LPC 프리셋 12종(기존 인덱스를 바꾸지 않게 목록 끝에 붙인다). */
export const STUDIO_LPC_PLAYER_SKINS: readonly StudioCharacterSkin[] = Object.freeze(
  STUDIO_LPC_CHARACTERS.filter((item) => item.kind === "player").map(createStudioLpcSkin),
);

const NPC_SKINS: ReadonlyMap<string, StudioCharacterSkin> = new Map(
  STUDIO_LPC_CHARACTERS.flatMap((item) => item.npcKey ? [[item.npcKey, createStudioLpcSkin(item)] as const] : []),
);

/** NPC identity(skinKey)에 대응하는 LPC 스킨. 없는 역할이면 undefined. */
export function studioLpcNpcSkin(npcKey: string): StudioCharacterSkin | undefined {
  return NPC_SKINS.get(npcKey);
}

/** 이 아트 스타일에서 LPC NPC를 쓰면 그 스킨을, 아니면 undefined를 돌려준다. */
export function studioLpcNpcSkinForArtStyle(npcKey: string, artStyle: StudioVirtualArtStyleKey): StudioCharacterSkin | undefined {
  return STUDIO_LPC_NPC_ART_STYLES.has(artStyle) ? studioLpcNpcSkin(npcKey) : undefined;
}

/** 한 캐릭터가 쓰는 시트 URL 전체(프리로드·무결성 검사용). */
export function studioLpcCharacterSheetUrls(id: string): readonly string[] {
  return STUDIO_LPC_ANIMATION_KEYS.map((animation) => studioLpcSheetUrl(id, animation));
}
