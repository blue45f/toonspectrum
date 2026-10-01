#!/usr/bin/env node
/**
 * 가상 스튜디오 LPC 캐릭터 스프라이트 생성기.
 *
 * 오픈소스 Universal LPC Spritesheet Character Generator 저장소(sheet_definitions·palette_definitions·
 * spritesheets·CREDITS.csv)를 읽어 몸·머리·표정·머리카락·옷 레이어를 zPos 순서로 겹치고, LPC 생성기와 같은
 * 팔레트 재색칠(원본 팔레트 색 ±1 일치 → 대상 팔레트 색)을 적용해 NPC·플레이어 프리셋 시트를 만든다.
 * LPC 원본은 저장소에 복사하지 않는다. 결과 시트·manifest.json·credits.json·CREDITS.md만 커밋한다.
 *
 * 사용:
 *   LPC_REPO=/path/to/universal-lpc-spritesheet-character-generator node scripts/virtual-studio/build-lpc-characters.mjs
 *   LPC_REPO=... node scripts/virtual-studio/build-lpc-characters.mjs --check     # 다시 만들어 커밋본과 바이트 비교(쓰기 없음)
 *   LPC_REPO=... node scripts/virtual-studio/build-lpc-characters.mjs --preview /tmp/lpc-preview.png  # 검수용 모음 이미지
 *
 * 라이선스: 레이어(파일)마다 sheet_definitions의 credits(=CREDITS.csv 원천) 중 OGA-BY 3.0을 우선 선택하고,
 * 없으면 CC0·CC-BY만 허용한다. CC-BY-SA·GPL만 있는 레이어가 섞이면 생성을 중단한다.
 * 결정성: 입력(LPC 커밋·이 파일)이 같으면 같은 바이트를 만든다(시간·난수·로캘 의존 없음, 무손실 인코딩 후 재복호 검증).
 * 출력: apps/web/public/assets/virtual-studio/characters-lpc-v1/<캐릭터 id>/{walk,idle,sit,emote,run}.(webp|png)
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../..");
export const OUTPUT_DIR = join(ROOT, "apps/web/public/assets/virtual-studio/characters-lpc-v1");
export const PUBLIC_URL_ROOT = "/assets/virtual-studio/characters-lpc-v1";
const SCRIPT_PATH = relative(ROOT, fileURLToPath(import.meta.url)).split(sep).join("/");

/** LPC 원본 프레임(64px)과 출력 배율. 2배 최근접 확대본은 선형 필터로 축소·확대돼도 픽셀 경계가 번지지 않는다. */
export const SOURCE_FRAME = 64;
export const PIXEL_SCALE = 2;
export const FRAME = SOURCE_FRAME * PIXEL_SCALE;
/** LPC 시트 행 순서(위·왼쪽·아래·오른쪽). */
export const DIRECTIONS = Object.freeze(["up", "left", "down", "right"]);

/**
 * 내보내는 애니메이션. columns는 LPC 원본 열 수이며 원본 크기와 다르면 중단한다.
 * cycle은 LPC 생성기 미리보기 순환(sources/state/constants.ts ANIMATION_CONFIGS)과 같다.
 */
export const ANIMATIONS = Object.freeze([
  { key: "walk", columns: 9, cycle: [1, 2, 3, 4, 5, 6, 7, 8], standColumn: 0, frameRate: 10,
    noteKo: "0열은 서 있는 자세, 1~8열이 걷기 순환", noteEn: "Column 0 is the standing pose; columns 1-8 loop" },
  { key: "idle", columns: 2, cycle: [0, 0, 1], frameRate: 3,
    noteKo: "제자리 호흡", noteEn: "Breathing in place" },
  { key: "sit", columns: 3, cycle: [0, 1, 2], frameRate: 1, chairColumn: 2,
    noteKo: "0 무릎 꿇기·1 바닥 앉기·2 의자 앉기", noteEn: "0 kneel, 1 floor sit, 2 chair sit" },
  { key: "emote", columns: 3, cycle: [0, 1, 2], frameRate: 2, cheerColumn: 2,
    noteKo: "0 허리에 손·1 차렷·2 양손 들기", noteEn: "0 hands on hips, 1 attention, 2 both arms up" },
  { key: "run", columns: 8, cycle: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 12,
    noteKo: "달리기 순환", noteEn: "Run loop" },
]);

/**
 * 라이선스 선택 우선순위. OGA-BY 3.0을 우선 선택하고(출처 표기만 필요, DRM 플랫폼 허용),
 * 그 외에는 CC0·CC-BY만 허용한다. 목록에 없는 라이선스(CC-BY-SA·GPL)는 선택하지 않는다.
 */
export const LICENSE_PREFERENCE = Object.freeze([
  "OGA-BY 3.0", "OGA-BY 3.0+", "OGA-BY 4.0", "CC0", "CC-BY 4.0", "CC-BY 3.0+", "CC-BY 3.0", "CC-BY",
]);
export const LICENSE_URLS = Object.freeze({
  "OGA-BY 3.0": "https://static.opengameart.org/OGA-BY-3.0.txt",
  "OGA-BY 3.0+": "https://static.opengameart.org/OGA-BY-3.0.txt",
  "OGA-BY 4.0": "https://static.opengameart.org/OGA-BY-4.0.txt",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY 3.0+": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY": "https://creativecommons.org/licenses/by/4.0/",
});

/* ------------------------------------------------------------------ */
/* 캐릭터 설계                                                          */
/* ------------------------------------------------------------------ */

/**
 * 색 키 형식: "<material>.<version>.<color>" | "<version>.<color>" | "<color>"(재료 기본 버전).
 * 레이어: { item: sheet_definitions 파일 이름, colors?: { [type_name]: 색 키 }, variant?: 변형 이름,
 *          remap?: { from: 원본 팔레트 색 키, to: 대상 팔레트 색 키 } (변형 전용 아이템을 팔레트로 다시 칠할 때) }.
 * colors의 키는 아이템 recolors 항목의 type_name(없으면 아이템 type_name)이다. 몸 색을 따르는 아이템은 skin을 쓴다.
 */
const NPC = "npc";
const PLAYER = "player";

export const CAST = Object.freeze([
  /* NPC 8명: 대화 초상화(portraits-v1)의 머리 색·옷 색·분위기에 맞춘다. */
  {
    id: "npc-concierge", kind: NPC, npcKey: "npc-concierge", labelKo: "모아 · 컨시어지", labelEn: "Moa · Concierge",
    lookKo: "라벤더 단발·남색 정장·청록 리본", lookEn: "Lavender bob, navy suit, cyan bow",
    body: "female", skin: "lpcr.porcelain", eyes: "lpcr.purple",
    layers: [
      { item: "hair_bob", colors: { hair: "all.lpcr.amethyst" } },
      { item: "torso_clothes_longsleeve2_buttoned", colors: { clothes: "all.lpcr.white" } },
      { item: "torso_clothes_longsleeve2_cardigan", colors: { clothes: "all.lpcr.navy" } },
      { item: "neck_bowtie2", colors: { neck: "all.lpcr.cyan" } },
      { item: "legs_formal", colors: { legs: "all.lpcr.navy" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.black" } },
    ],
  },
  {
    id: "npc-producer", kind: NPC, npcKey: "npc-producer", labelKo: "윤 · 프로듀서", labelEn: "Yoon · Producer",
    lookKo: "검은 머리·안경·짙은 재킷", lookEn: "Black hair, glasses, dark jacket",
    body: "male", skin: "lpcr.ivory", eyes: "lpcr.black",
    layers: [
      { item: "hair_parted3", colors: { hair: "lpcr.black" } },
      { item: "facial_glasses", variant: "black" },
      { item: "torso_clothes_longsleeve2_buttoned", colors: { clothes: "all.lpcr.white" } },
      { item: "torso_clothes_longsleeve2_cardigan", colors: { clothes: "all.lpcr.charcoal" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.charcoal" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.black" } },
    ],
  },
  {
    id: "npc-editor", kind: NPC, npcKey: "npc-editor", labelKo: "솔 · 리뷰 에디터", labelEn: "Sol · Review editor",
    lookKo: "검은 긴 머리 묶음·안경·크림 니트", lookEn: "Long black ponytail, glasses, cream knit",
    body: "female", skin: "lpcr.porcelain", eyes: "lpcr.brown",
    layers: [
      { item: "hair_ponytail2", colors: { hair: "lpcr.raven" } },
      { item: "facial_glasses", variant: "black" },
      { item: "torso_clothes_longsleeve2", colors: { clothes: "all.lpcr.dove" } },
      { item: "legs_formal", colors: { legs: "all.lpcr.umber" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "npc-artist", kind: NPC, npcKey: "npc-artist", labelKo: "하루 · 아틀리에 메이트", labelEn: "Haru · Atelier mate",
    lookKo: "주황 머리·남색 줄무늬 긴팔·멜빵바지", lookEn: "Orange hair, navy-striped long sleeves, overalls",
    body: "male", skin: "lpcr.peach", eyes: "lpcr.brown",
    layers: [
      { item: "hair_halfmessy", colors: { hair: "carrot" } },
      // 초상화의 남색·흰색 줄무늬 셔츠: 흰 긴팔을 2px 간격 남색 줄무늬로 다시 칠한다(applyStripes).
      { item: "torso_clothes_longsleeve2", colors: { clothes: "all.lpcr.white" }, stripes: { color: "all.lpcr.navy", band: 2 } },
      { item: "torso_aprons_overalls", variant: "blue" },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  {
    id: "npc-archivist", kind: NPC, npcKey: "npc-archivist", labelKo: "담 · 에셋 아키비스트", labelEn: "Dam · Asset archivist",
    lookKo: "은회색 머리·안경·올리브 카디건", lookEn: "Silver hair, glasses, olive cardigan",
    body: "male", skin: "lpcr.ivory", eyes: "lpcr.gray",
    layers: [
      { item: "hair_idol", colors: { hair: "lpcr.silver" } },
      { item: "facial_glasses", variant: "brass" },
      { item: "torso_clothes_longsleeve2_buttoned", colors: { clothes: "all.lpcr.white" } },
      { item: "torso_clothes_longsleeve2_cardigan", colors: { clothes: "all.lpcr.fern" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.oak" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "npc-cafe", kind: NPC, npcKey: "npc-cafe", labelKo: "린 · 카페 매니저", labelEn: "Rin · Cafe manager",
    lookKo: "갈색 단발·크림 셔츠·민트 앞치마", lookEn: "Brown bob, cream shirt, mint apron",
    body: "female", skin: "lpcr.peach", eyes: "lpcr.brown",
    layers: [
      { item: "hair_bob", colors: { hair: "lpcr.chestnut" } },
      { item: "torso_clothes_longsleeve2_buttoned", colors: { clothes: "all.lpcr.dove" } },
      // 앞치마형 아이템은 걷기만 있어 모든 동작이 있는 멜빵 앞판(흰 변형)을 민트 팔레트로 다시 칠한다.
      { item: "torso_aprons_overalls", variant: "white", remap: { from: "cloth.ulpc.white", to: "all.lpcr.mint" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "npc-security", kind: NPC, npcKey: "npc-security", labelKo: "준 · 공간 안전 요원", labelEn: "Jun · Space safety",
    lookKo: "짙은 남색 머리·하늘색 단추 제복·남색 바지", lookEn: "Dark navy hair, sky-blue buttoned uniform, navy trousers",
    body: "male", skin: "lpcr.porcelain", eyes: "lpcr.black",
    layers: [
      // 초상화처럼 어두운 남색 앞머리. 견장은 어깨 갑옷처럼 보여 빼고 단추 제복으로 역할을 드러낸다.
      { item: "hair_plain", colors: { hair: "lpcr.blue" } },
      { item: "torso_clothes_longsleeve2_buttoned", colors: { clothes: "all.lpcr.sky" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.navy" } },
      { item: "feet_boots_basic", colors: { shoes: "all.lpcr.black" } },
    ],
  },
  {
    id: "npc-host", kind: NPC, npcKey: "npc-host", labelKo: "나비 · 이벤트 진행자", labelEn: "Nabi · Event host",
    lookKo: "갈색 양갈래·코랄 핑크 재킷·흰 티", lookEn: "Brown twin tails, coral-pink jacket, white tee",
    body: "female", skin: "lpcr.peach", eyes: "lpcr.brown",
    layers: [
      // 양쪽 어깨로 늘어진 머리(왼쪽·오른쪽 두 아이템을 겹쳐 양갈래로 만든다).
      { item: "hair_shoulderl", colors: { hair: "lpcr.chestnut" } },
      { item: "hair_shoulderr", colors: { hair: "lpcr.chestnut" } },
      { item: "torso_clothes_tshirt", colors: { clothes: "all.lpcr.white" } },
      { item: "torso_clothes_longsleeve2_cardigan", colors: { clothes: "all.lpcr.pink" } },
      { item: "legs_shorts", colors: { legs: "all.lpcr.navy" } },
      { item: "feet_socks_high", colors: { socks: "all.lpcr.white" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  /* 플레이어 프리셋 12종: 성별·피부색·머리·옷을 고루 나눈 웹툰 작가·스태프. */
  {
    id: "player-seoha", kind: PLAYER, labelKo: "서하 · 웹툰 작가", labelEn: "Seoha · Webtoon artist",
    lookKo: "검은 긴 생머리·흰 티·남색 멜빵", lookEn: "Long black hair, white tee, navy overalls",
    body: "female", skin: "lpcr.ivory", eyes: "lpcr.black",
    layers: [
      { item: "hair_long_straight", colors: { hair: "lpcr.black" } },
      { item: "torso_clothes_tshirt", colors: { clothes: "all.lpcr.white" } },
      { item: "torso_aprons_overalls", variant: "navy" },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  {
    id: "player-doyun", kind: PLAYER, labelKo: "도윤 · 콘티 작가", labelEn: "Doyun · Storyboard artist",
    lookKo: "갈색 곱슬머리·머스터드 티·청바지", lookEn: "Brown curls, mustard tee, jeans",
    body: "male", skin: "lpcr.tan", eyes: "lpcr.brown",
    layers: [
      { item: "hair_curly_short2", colors: { hair: "lpcr.brown" } },
      { item: "torso_clothes_tshirt", colors: { clothes: "all.lpcr.mustard" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.denim" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  {
    id: "player-amara", kind: PLAYER, labelKo: "아마라 · 배경 작가", labelEn: "Amara · Background artist",
    lookKo: "아프로·청록 브이넥·부츠", lookEn: "Afro, teal V-neck, boots",
    body: "female", skin: "lpcr.coffee", eyes: "lpcr.brown",
    layers: [
      { item: "hair_afro", colors: { hair: "lpcr.black" } },
      { item: "torso_clothes_longsleeve2_vneck", colors: { clothes: "all.lpcr.teal" } },
      { item: "legs_pants2", colors: { legs: "all.lpcr.charcoal" } },
      { item: "feet_boots_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "player-luka", kind: PLAYER, labelKo: "루카 · 채색 어시스턴트", labelEn: "Luka · Color assistant",
    lookKo: "금발 뾰족 머리·하늘색 티·멜빵 반바지", lookEn: "Spiky blond hair, sky tee, suspenders",
    body: "male", skin: "lpcr.porcelain", eyes: "lpcr.blue",
    layers: [
      { item: "hair_spiked", colors: { hair: "lpcr.platinum" } },
      { item: "torso_clothes_tshirt", colors: { clothes: "all.lpcr.sky" } },
      { item: "torso_aprons_suspenders", variant: "charcoal" },
      { item: "legs_shorts", colors: { legs: "all.lpcr.oak" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  {
    id: "player-hana", kind: PLAYER, labelKo: "하나 · 스토리 PD", labelEn: "Hana · Story PD",
    lookKo: "올림머리·분홍 카디건·레깅스", lookEn: "Top bun, pink cardigan, leggings",
    body: "female", skin: "lpcr.honey", eyes: "lpcr.hazel",
    layers: [
      { item: "hair_bangs_bun", colors: { hair: "lpcr.ash_brown" } },
      { item: "torso_clothes_longsleeve2_cardigan", colors: { clothes: "all.lpcr.pink" } },
      { item: "legs_leggings", colors: { legs: "all.lpcr.midnight" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  {
    id: "player-teo", kind: PLAYER, labelKo: "테오 · 3D 아티스트", labelEn: "Teo · 3D artist",
    lookKo: "드레드록·연두 폴로·면바지", lookEn: "Dreadlocks, lime polo, chinos",
    body: "male", skin: "lpcr.brown", eyes: "lpcr.brown",
    layers: [
      { item: "hair_dreadlocks_short", colors: { hair: "lpcr.black" } },
      { item: "torso_clothes_longsleeve2_polo", colors: { clothes: "all.lpcr.spring" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.oak" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "player-mio", kind: PLAYER, labelKo: "미오 · 캐릭터 디자이너", labelEn: "Mio · Character designer",
    lookKo: "분홍 단발·검은 티·청바지", lookEn: "Pink lob, black tee, jeans",
    body: "female", skin: "lpcr.porcelain", eyes: "lpcr.green",
    layers: [
      { item: "hair_lob", colors: { hair: "ulpc.rose" } },
      { item: "torso_clothes_tshirt_vneck", colors: { clothes: "all.lpcr.black" } },
      { item: "legs_pants2", colors: { legs: "all.lpcr.denim" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.white" } },
    ],
  },
  {
    id: "player-minjae", kind: PLAYER, labelKo: "민재 · 편집 PD", labelEn: "Minjae · Editorial PD",
    lookKo: "짧은 수염·안경·흰 셔츠", lookEn: "Trimmed beard, glasses, white shirt",
    body: "male", skin: "lpcr.peach", eyes: "lpcr.black",
    layers: [
      { item: "hair_parted_side_bangs", colors: { hair: "lpcr.black" } },
      { item: "beards_trimmed", colors: { beard: "lpcr.black" } },
      { item: "facial_glasses", variant: "black" },
      { item: "torso_clothes_longsleeve2_buttoned", colors: { clothes: "all.lpcr.white" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.navy" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.black" } },
    ],
  },
  {
    id: "player-noor", kind: PLAYER, labelKo: "누르 · 식자 담당", labelEn: "Noor · Lettering artist",
    lookKo: "청록 히잡·크림 상의·남색 바지", lookEn: "Teal hijab, cream top, navy trousers",
    body: "female", skin: "lpcr.tawny", eyes: "lpcr.brown",
    layers: [
      { item: "hat_hood_hijab", colors: { hat: "all.lpcr.teal" } },
      { item: "torso_clothes_longsleeve2", colors: { clothes: "all.lpcr.dove" } },
      { item: "legs_pants2", colors: { legs: "all.lpcr.navy" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "player-jeongho", kind: PLAYER, labelKo: "정호 · 시니어 작가", labelEn: "Jeongho · Senior artist",
    lookKo: "흰머리·반달 안경·갈색 카디건", lookEn: "White hair, half-moon glasses, brown cardigan",
    body: "male", head: "heads_human_male_elderly", skin: "lpcr.ivory", eyes: "lpcr.gray",
    layers: [
      { item: "hair_balding", colors: { hair: "lpcr.white" } },
      { item: "facial_glasses_halfmoon", variant: "silver" },
      { item: "torso_clothes_longsleeve2_cardigan", colors: { clothes: "all.lpcr.oak" } },
      { item: "legs_pants", colors: { legs: "all.lpcr.charcoal" } },
      { item: "feet_shoes_basic", colors: { shoes: "all.lpcr.chocolate" } },
    ],
  },
  {
    id: "player-lea", kind: PLAYER, labelKo: "레아 · 일러스트레이터", labelEn: "Lea · Illustrator",
    lookKo: "생강색 웨이브·초록 티·부츠", lookEn: "Ginger waves, green tee, boots",
    body: "female", skin: "lpcr.porcelain", eyes: "lpcr.green",
    layers: [
      { item: "hair_wavy", colors: { hair: "ulpc.ginger" } },
      { item: "torso_clothes_tshirt_scoop", colors: { clothes: "all.lpcr.fern" } },
      { item: "legs_leggings", colors: { legs: "all.lpcr.black" } },
      { item: "feet_boots_basic", colors: { shoes: "all.lpcr.black" } },
    ],
  },
  {
    id: "player-kai", kind: PLAYER, labelKo: "카이 · 사운드 디렉터", labelEn: "Kai · Sound director",
    lookKo: "플랫톱·보라 티·검은 바지", lookEn: "Flat top, violet tee, black trousers",
    body: "male", skin: "lpcr.honey", eyes: "lpcr.black",
    layers: [
      { item: "hair_flat_top_fade", colors: { hair: "lpcr.black" } },
      { item: "torso_clothes_tshirt", colors: { clothes: "all.lpcr.indigo" } },
      { item: "legs_pants2", colors: { legs: "all.lpcr.black" } },
      { item: "feet_boots_basic", colors: { shoes: "all.lpcr.black" } },
    ],
  },
]);

/* ------------------------------------------------------------------ */
/* 순수 도우미(테스트 대상)                                              */
/* ------------------------------------------------------------------ */

/** CREDITS.csv(따옴표 필드 뒤 공백 허용)를 filename → 행으로 읽는다. */
export function parseCreditsCsv(text) {
  const rows = [];
  let field = "", row = [], quoted = false, started = false;
  const pushField = () => { row.push(field.trim()); field = ""; started = false; };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"") {
        if (text[index + 1] === "\"") { field += "\""; index += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === "\"" && !started) { quoted = true; started = true; continue; }
    if (char === ",") { pushField(); continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushField();
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      continue;
    }
    if (char !== " " || started) { field += char; started = true; }
  }
  if (field !== "" || row.length) { pushField(); if (row.some((value) => value !== "")) rows.push(row); }
  const [header, ...body] = rows;
  if (!header || header.join(",") !== "filename,notes,authors,licenses,urls") {
    throw new Error("CREDITS.csv 머리글이 filename,notes,authors,licenses,urls 형식이 아닙니다.");
  }
  const split = (value) => value.split(",").map((part) => part.trim()).filter(Boolean);
  return new Map(body.map(([filename, notes, authors, licenses, urls]) => [filename, {
    filename, notes: notes ?? "", authors: split(authors ?? ""), licenses: split(licenses ?? ""), urls: split(urls ?? ""),
  }]));
}

/** 허용 라이선스 중 우선순위가 가장 높은 하나. 없으면 null(사용 금지). */
export function chooseLicense(licenses) {
  for (const preferred of LICENSE_PREFERENCE) if (licenses.includes(preferred)) return preferred;
  return null;
}

/** LPC 생성기 searchCredit과 같은 규칙: 정확한 파일·디렉터리 일치 후 상위 경로로 올라가며 찾는다. */
export function resolveCredit(fileName, credits) {
  let candidate = fileName;
  for (;;) {
    const found = credits.find((credit) => credit.file === candidate || credit.file === `${candidate}.png` || `${credit.file}/` === candidate);
    if (found) return found;
    const index = candidate.lastIndexOf("/");
    if (index < 0) return null;
    candidate = candidate.slice(0, index);
  }
}

export function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (!match) throw new Error(`색 형식이 #RRGGBB가 아닙니다: ${hex}`);
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

/** LPC CPU 재색칠과 같은 규칙: 모든 대응표를 한 목록으로 펼쳐 각 픽셀을 ±tolerance로 순서대로 비교한다. */
export function recolorRgba(data, mappings, tolerance = 1) {
  const pairs = [];
  for (const { source, target } of mappings) {
    if (source.length !== target.length) throw new Error(`팔레트 색 수가 다릅니다: ${source.length} ≠ ${target.length}`);
    source.forEach((hex, index) => pairs.push([hexToRgb(hex), hexToRgb(target[index])]));
  }
  if (pairs.length === 0) return 0;
  let changed = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    for (const [from, to] of pairs) {
      if (Math.abs(r - from[0]) <= tolerance && Math.abs(g - from[1]) <= tolerance && Math.abs(b - from[2]) <= tolerance) {
        data[offset] = to[0]; data[offset + 1] = to[1]; data[offset + 2] = to[2];
        changed += 1;
        break;
      }
    }
  }
  return changed;
}

/** 캔버스 source-over와 같은 직선 알파 합성(정수 반올림, 결정적). */
export function compositeOver(target, source) {
  if (target.length !== source.length) throw new Error("합성할 두 버퍼의 크기가 다릅니다.");
  for (let offset = 0; offset < target.length; offset += 4) {
    const sa = source[offset + 3];
    if (sa === 0) continue;
    if (sa === 255) {
      target[offset] = source[offset]; target[offset + 1] = source[offset + 1];
      target[offset + 2] = source[offset + 2]; target[offset + 3] = 255;
      continue;
    }
    const da = target[offset + 3];
    const outA = sa + da * (255 - sa) / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = (source[offset + channel] * sa + target[offset + channel] * da * (255 - sa) / 255) / outA;
      target[offset + channel] = Math.round(value);
    }
    target[offset + 3] = Math.round(outA);
  }
}

/**
 * 가로 줄무늬: 같은 레이어를 두 팔레트로 칠한 두 버퍼(target=바탕색, alt=줄무늬색)를 프레임 칸마다
 * 몸통 윗선(가운데 열에서 가장 위의 불투명 행)부터 band행씩 번갈아 고른다. 걷기 상하 흔들림에도 줄이
 * 옷과 함께 움직이고(프레임 기준선이 몸과 같이 움직임), 들어 올린 팔은 기준선 계산에서 뺀다.
 * 첫 band행(목둘레)은 바탕색이다. 투명 픽셀은 건드리지 않는다.
 */
export function applyStripes(target, alt, width, height, band, frame = SOURCE_FRAME) {
  if (target.length !== alt.length || target.length !== width * height * 4) throw new Error("줄무늬 버퍼 크기가 다릅니다.");
  if (!Number.isInteger(band) || band < 1) throw new Error(`줄무늬 두께는 1 이상의 정수여야 합니다: ${band}`);
  const torsoLeft = Math.floor(frame * 3 / 8), torsoRight = Math.ceil(frame * 5 / 8);
  let striped = 0;
  for (let cellY = 0; cellY < height; cellY += frame) {
    for (let cellX = 0; cellX < width; cellX += frame) {
      let top = -1;
      for (let y = cellY; y < cellY + frame && top < 0; y += 1) {
        for (let x = cellX + torsoLeft; x < cellX + torsoRight; x += 1) {
          if (target[(y * width + x) * 4 + 3] !== 0) { top = y; break; }
        }
      }
      if (top < 0) continue;
      for (let y = top; y < cellY + frame; y += 1) {
        if (Math.floor((y - top) / band) % 2 === 0) continue;
        for (let x = cellX; x < cellX + frame; x += 1) {
          const offset = (y * width + x) * 4;
          if (target[offset + 3] === 0) continue;
          target[offset] = alt[offset]; target[offset + 1] = alt[offset + 1]; target[offset + 2] = alt[offset + 2];
          striped += 1;
        }
      }
    }
  }
  return striped;
}

/**
 * 합성 결과에서 8방향 이웃이 모두 투명한 외톨이 픽셀을 지운다(원본 시트의 얼룩 점, 예: 멜빵 걷기 시트의 한 점).
 * 프레임 경계를 넘는 이웃은 보지 않는다. 지운 픽셀 수를 돌려준다.
 */
export function removeIsolatedPixels(data, width, height, frame = SOURCE_FRAME) {
  const remove = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      const cellX = x - (x % frame), cellY = y - (y % frame);
      let neighbour = false;
      for (let dy = -1; dy <= 1 && !neighbour; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if ((dx === 0 && dy === 0) || nx < cellX || ny < cellY || nx >= cellX + frame || ny >= cellY + frame) continue;
          if (data[(ny * width + nx) * 4 + 3] !== 0) { neighbour = true; break; }
        }
      }
      if (!neighbour) remove.push((y * width + x) * 4);
    }
  }
  for (const offset of remove) data.fill(0, offset, offset + 4);
  return remove.length;
}

/** 정수 배율 최근접 확대. */
export function upscaleNearest(data, width, height, scale) {
  const out = Buffer.alloc(width * scale * height * scale * 4);
  for (let y = 0; y < height * scale; y += 1) {
    const sourceRow = Math.floor(y / scale) * width;
    for (let x = 0; x < width * scale; x += 1) {
      const from = (sourceRow + Math.floor(x / scale)) * 4;
      data.copy(out, (y * width * scale + x) * 4, from, from + 4);
    }
  }
  return out;
}

/** 투명이 아닌 픽셀의 경계 상자(원본 픽셀 단위). 비어 있으면 null. */
export function opaqueBounds(data, width, x0, y0, w, h) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x - x0); maxX = Math.max(maxX, x - x0);
      minY = Math.min(minY, y - y0); maxY = Math.max(maxY, y - y0);
    }
  }
  return Number.isFinite(minX) ? { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 } : null;
}

/**
 * 작가 이름 목록을 사람 기준으로 합친다. "Eliza Wyatt (ElizaWy)"·"ElizaWy"처럼 괄호 속 별명이 같거나
 * "bluecarrot16"·"Bluecarrot16"처럼 대소문자만 다른 표기는 한 사람이다. 실명이 들어간 가장 긴 표기를 쓰고,
 * 길이가 같으면 더 자주 쓰인 표기, 그다음 사전순 앞 표기를 고른다. 결과는 사전순(en)이다.
 */
export function normalizeAuthors(names) {
  const handle = (name) => (/\(([^()]+)\)\s*$/u.exec(name)?.[1] ?? name).trim().toLowerCase();
  const groups = new Map();
  for (const name of names) {
    const key = handle(name);
    const counts = groups.get(key) ?? new Map();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    groups.set(key, counts);
  }
  const chosen = [...groups.values()].map((counts) => [...counts.entries()]
    .sort(([a, countA], [b, countB]) => b.length - a.length || countB - countA || a.localeCompare(b, "en"))[0][0]);
  return chosen.sort((a, b) => a.localeCompare(b, "en"));
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/* ------------------------------------------------------------------ */
/* LPC 저장소 읽기                                                       */
/* ------------------------------------------------------------------ */

function fail(message) {
  console.error(`[build-lpc-characters] ${message}`);
  process.exit(1);
}

function walkFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

export function loadLpcRepository(repo) {
  const sheetsDir = join(repo, "sheet_definitions");
  const palettesDir = join(repo, "palette_definitions");
  for (const required of [sheetsDir, palettesDir, join(repo, "spritesheets"), join(repo, "CREDITS.csv")]) {
    if (!existsSync(required)) throw new Error(`LPC 저장소 구성이 아닙니다(${relative(repo, required)} 없음).`);
  }
  const items = new Map();
  for (const path of walkFiles(sheetsDir)) {
    const name = path.slice(path.lastIndexOf(sep) + 1);
    if (!name.endsWith(".json") || name.startsWith("meta_")) continue;
    const id = name.slice(0, -5);
    if (items.has(id)) throw new Error(`sheet_definitions 아이템 이름이 중복됩니다: ${id}`);
    items.set(id, { id, definitionPath: relative(repo, path).split(sep).join("/"), definition: JSON.parse(readFileSync(path, "utf8")) });
  }
  const materials = new Map();
  for (const path of walkFiles(palettesDir)) {
    const name = path.slice(path.lastIndexOf(sep) + 1);
    if (!name.endsWith(".json")) continue;
    const json = JSON.parse(readFileSync(path, "utf8"));
    if (name.startsWith("meta_")) {
      const key = name.slice(5, -5);
      if (json.type !== "material") continue;
      materials.set(key, { ...(materials.get(key) ?? { palettes: {} }), meta: json });
      continue;
    }
    const [material, version] = name.slice(0, -5).split("_");
    const entry = materials.get(material) ?? { palettes: {} };
    entry.palettes[version] = json;
    materials.set(material, entry);
  }
  const credits = parseCreditsCsv(readFileSync(join(repo, "CREDITS.csv"), "utf8"));
  const git = spawnSync("git", ["-C", repo, "log", "-1", "--format=%H %cI"], { encoding: "utf8" });
  const [commit, commitDate] = git.status === 0 ? git.stdout.trim().split(" ") : ["unknown", "unknown"];
  return { repo, items, materials, credits, commit, commitDate };
}

/** 색 키를 [재료, 버전, 색, 색 배열]로 푼다. 기본 재료는 아이템 recolor 항목의 재료다. */
export function resolvePalette(materials, key, fallbackMaterial) {
  const parts = key.split(".");
  let material = fallbackMaterial, version, color;
  if (parts.length === 3) [material, version, color] = parts;
  else if (parts.length === 2) {
    if (materials.has(parts[0]) && !materials.get(fallbackMaterial)?.palettes[parts[0]]) [material, color] = parts;
    else [version, color] = parts;
  } else [color] = parts;
  const entry = materials.get(material);
  if (!entry?.meta) throw new Error(`팔레트 재료를 찾지 못했습니다: ${key} (재료 ${material})`);
  version ??= entry.meta.default;
  const colors = entry.palettes[version]?.[color];
  if (!colors) {
    const available = Object.keys(entry.palettes[version] ?? {}).join(", ");
    throw new Error(`팔레트 색을 찾지 못했습니다: ${material}.${version}.${color} (가능: ${available})`);
  }
  return { material, version, color, key: `${material}.${version}.${color}`, colors };
}

function recolorEntries(definition) {
  const recolors = definition.recolors;
  if (!recolors) return [];
  const numbered = [];
  for (let index = 1; index < 10; index += 1) {
    const entry = recolors[`color_${index}`];
    if (!entry) break;
    numbered.push(entry);
  }
  return numbered.length ? numbered : [recolors];
}

function layerDefinitions(definition) {
  const layers = [];
  for (let index = 1; index < 10; index += 1) {
    const layer = definition[`layer_${index}`];
    if (!layer) break;
    layers.push({ number: index, layer });
  }
  return layers;
}

/** ${head} 같은 경로 틀을 다른 선택 아이템 이름(replace_in_path)으로 채운다. */
function fillPathTemplate(path, definition, selectedItems) {
  if (!path.includes("${")) return path;
  return path.replace(/\$\{([a-z_]+)\}/gu, (_whole, typeName) => {
    const owner = selectedItems.find((item) => item.definition.type_name === typeName);
    const name = owner?.definition.name?.replaceAll(" ", "_");
    const replacement = name ? definition.replace_in_path?.[typeName]?.[name] : undefined;
    if (!replacement) throw new Error(`${definition.name}: 경로 틀 \${${typeName}}을 채울 선택이 없습니다.`);
    return replacement;
  });
}

/** 캐릭터 선택(몸·머리·표정 + 설계 레이어)을 펼친다. */
export function characterSelections(character) {
  const head = character.head ?? (character.body === "male" ? "heads_human_male" : "heads_human_female");
  return [
    { item: "body", colors: { body: character.skin } },
    { item: head, colors: { head: character.skin, eyes: character.eyes } },
    { item: character.face ?? "face_neutral", colors: { expression: character.skin, eyes: character.eyes } },
    ...character.layers,
  ];
}

/** 한 애니메이션의 레이어 목록(파일·zPos·재색칠·크레딧)을 만든다. 금지 라이선스나 누락 파일이면 예외. */
export function planAnimationLayers(lpc, character, animation) {
  const selections = characterSelections(character);
  const selected = selections.map((selection) => {
    const entry = lpc.items.get(selection.item);
    if (!entry) throw new Error(`${character.id}: LPC 아이템이 없습니다: ${selection.item}`);
    return { selection, ...entry };
  });
  const planned = [];
  selected.forEach(({ selection, id, definition, definitionPath }, selectionIndex) => {
    const animations = definition.animations ?? ["spellcast", "thrust", "walk", "slash", "shoot", "hurt", "watering"];
    if (!animations.includes(animation.key)) {
      throw new Error(`${character.id}: ${id}에 ${animation.key} 애니메이션이 없습니다.`);
    }
    const entries = recolorEntries(definition);
    for (const { number, layer } of layerDefinitions(definition)) {
      if (layer.custom_animation) continue;
      const basePath = layer[character.body];
      if (!basePath) throw new Error(`${character.id}: ${id}는 ${character.body} 몸을 지원하지 않습니다.`);
      const path = fillPathTemplate(basePath, definition, selected);
      const templatePath = basePath;
      let file, mappings = [], recolor = null, stripe = null;
      if (entries.length) {
        file = `${path}${animation.key}.png`;
        const stripeMappings = [];
        recolor = entries.map((entry) => {
          const typeName = entry.type_name ?? definition.type_name;
          const target = selection.colors?.[typeName];
          if (!target) throw new Error(`${character.id}: ${id}의 ${typeName} 색이 지정되지 않았습니다.`);
          const base = entry.source
            ? { key: "custom-source", colors: entry.source }
            : resolvePalette(lpc.materials, entry.base ?? `${lpc.materials.get(entry.material)?.meta.default}.${lpc.materials.get(entry.material)?.meta.base}`, entry.material);
          const to = resolvePalette(lpc.materials, target, entry.material);
          mappings.push({ source: base.colors, target: to.colors });
          if (!selection.stripes) return { typeName, from: base.key, to: to.key };
          // 줄무늬 팔레트의 가장 어두운 색(외곽선)은 바탕 팔레트 외곽선으로 맞춰 줄마다 외곽선 색이 바뀌지 않게 한다.
          const stripeTo = resolvePalette(lpc.materials, selection.stripes.color, entry.material);
          stripeMappings.push({ source: base.colors, target: [to.colors[0], ...stripeTo.colors.slice(1)] });
          return { typeName, from: base.key, to: to.key, stripes: { to: stripeTo.key, band: selection.stripes.band } };
        });
        if (selection.stripes) stripe = { mappings: stripeMappings, band: selection.stripes.band };
      } else {
        if (selection.stripes) throw new Error(`${character.id}: ${id}는 팔레트 재색칠 아이템이 아니라 줄무늬를 넣을 수 없습니다.`);
        if (!selection.variant) throw new Error(`${character.id}: ${id}는 변형(variant)을 지정해야 합니다.`);
        if (!(definition.variants ?? []).includes(selection.variant)) {
          throw new Error(`${character.id}: ${id}에 ${selection.variant} 변형이 없습니다(가능: ${(definition.variants ?? []).join(", ")}).`);
        }
        file = `${path}${animation.key}/${selection.variant.replaceAll(" ", "_")}.png`;
        if (selection.remap) {
          const from = resolvePalette(lpc.materials, selection.remap.from, "cloth");
          const to = resolvePalette(lpc.materials, selection.remap.to, "cloth");
          mappings = [{ source: from.colors, target: to.colors }];
          recolor = [{ typeName: definition.type_name, from: from.key, to: to.key, variantRemap: selection.variant }];
        }
      }
      const absolute = join(lpc.repo, "spritesheets", file);
      if (!existsSync(absolute)) throw new Error(`${character.id}: 원본 시트가 없습니다: spritesheets/${file}`);
      const creditFile = `${path}${animation.key}`;
      const credit = resolveCredit(creditFile, definition.credits ?? []);
      if (!credit) throw new Error(`${character.id}: ${file}의 크레딧을 sheet_definitions에서 찾지 못했습니다.`);
      // CREDITS.csv는 경로 틀(${head})을 채우기 전 경로로 상위 크레딧을 찾기도 한다. 두 기록을 모두 만족해야 쓰고 작가는 합친다.
      const csvRow = lpc.credits.get(`${path}${animation.key}.png`) ?? lpc.credits.get(`${templatePath}${animation.key}.png`);
      const license = chooseLicense(credit.licenses);
      if (!license || (csvRow && !csvRow.licenses.includes(license))) {
        const offered = [...new Set([...credit.licenses, ...(csvRow?.licenses ?? [])])].join(", ");
        throw new Error(`${character.id}: ${file}은 허용 라이선스(OGA-BY·CC0·CC-BY)를 쓸 수 없습니다(${offered}). 다른 아이템을 고르세요.`);
      }
      const union = (first, second) => [...new Set([...(first ?? []), ...(second ?? [])])];
      planned.push({
        item: id, definitionPath, layer: number, zPos: layer.zPos ?? 100, order: selectionIndex * 10 + number,
        file, absolute, mappings, stripe, recolor, variant: selection.variant ?? null,
        credit: {
          file: credit.file, notes: credit.notes || csvRow?.notes || "",
          authors: union(credit.authors, csvRow?.authors), licenses: credit.licenses ?? [], urls: union(credit.urls, csvRow?.urls),
        },
        license,
      });
    }
  });
  // LPC 렌더러처럼 zPos 오름차순(낮을수록 뒤), 같은 zPos는 선택·레이어 순서를 유지한다.
  return planned.sort((a, b) => a.zPos - b.zPos || a.order - b.order);
}

/* ------------------------------------------------------------------ */
/* 렌더·인코딩                                                          */
/* ------------------------------------------------------------------ */

/** sharp는 워크스페이스 직접 의존성이 아니므로 pnpm 저장소에서 찾는다. */
export async function loadSharp() {
  const store = join(ROOT, "node_modules/.pnpm");
  const folder = existsSync(store) ? readdirSync(store).filter((name) => /^sharp@\d/u.test(name)).sort().at(-1) : undefined;
  if (!folder) throw new Error("sharp 패키지를 node_modules/.pnpm에서 찾지 못했습니다. `pnpm install` 후 다시 실행하세요.");
  const module = await import(pathToFileURL(join(store, folder, "node_modules/sharp/dist/index.mjs")).href);
  return module.default;
}

async function readRgba(sharp, path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`RGBA로 읽지 못했습니다: ${path}`);
  return { data, width: info.width, height: info.height };
}

export async function renderAnimation(sharp, layers, animation) {
  const width = animation.columns * SOURCE_FRAME, height = DIRECTIONS.length * SOURCE_FRAME;
  const canvas = Buffer.alloc(width * height * 4);
  for (const layer of layers) {
    const image = await readRgba(sharp, layer.absolute);
    if (image.width !== width || image.height !== height) {
      throw new Error(`${layer.file} 크기 ${image.width}×${image.height}가 ${animation.key} 규격 ${width}×${height}와 다릅니다.`);
    }
    const stripeSource = layer.stripe ? Buffer.from(image.data) : null;
    if (layer.mappings.length) {
      const changed = recolorRgba(image.data, layer.mappings);
      if (changed === 0) throw new Error(`${layer.file}: 재색칠 대상 색이 한 픽셀도 없습니다(원본 팔레트 불일치).`);
    }
    if (layer.stripe && stripeSource) {
      recolorRgba(stripeSource, layer.stripe.mappings);
      if (applyStripes(image.data, stripeSource, width, height, layer.stripe.band) === 0) {
        throw new Error(`${layer.file}: 줄무늬를 넣을 픽셀이 없습니다.`);
      }
    }
    compositeOver(canvas, image.data);
  }
  const despeckled = removeIsolatedPixels(canvas, width, height);
  return { data: canvas, width, height, despeckled };
}

/** 무손실 WebP와 PNG 중 작은 쪽. 인코딩 뒤 다시 읽어 픽셀이 같은지 확인한다. */
async function encodeSmallest(sharp, rgba, width, height) {
  const input = () => sharp(rgba, { raw: { width, height, channels: 4 } });
  const webp = await input().webp({ lossless: true, effort: 6, exact: true }).toBuffer();
  const png = await input().png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
  const best = webp.byteLength <= png.byteLength ? { format: "webp", buffer: webp } : { format: "png", buffer: png };
  const decoded = await readRgba(sharp, best.buffer);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3];
    if (decoded.data[offset + 3] !== alpha || (alpha !== 0 && (decoded.data[offset] !== rgba[offset]
      || decoded.data[offset + 1] !== rgba[offset + 1] || decoded.data[offset + 2] !== rgba[offset + 2]))) {
      throw new Error(`${best.format} 인코딩이 무손실이 아닙니다(오프셋 ${offset}).`);
    }
  }
  return { ...best, alternatives: { webp: webp.byteLength, png: png.byteLength } };
}

/** 걷기 0열(서기)·의자 앉기에서 발·엉덩이 기준을 잰다(원본 64px 단위). */
function measureGeometry(rendered) {
  const walk = rendered.get("walk");
  const sit = rendered.get("sit");
  const down = DIRECTIONS.indexOf("down");
  const stand = opaqueBounds(walk.data, walk.width, 0, down * SOURCE_FRAME, SOURCE_FRAME, SOURCE_FRAME);
  let footBottom = 0, headTop = SOURCE_FRAME;
  for (let row = 0; row < DIRECTIONS.length; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const bounds = opaqueBounds(walk.data, walk.width, column * SOURCE_FRAME, row * SOURCE_FRAME, SOURCE_FRAME, SOURCE_FRAME);
      if (!bounds) continue;
      footBottom = Math.max(footBottom, bounds.bottom);
      headTop = Math.min(headTop, bounds.top);
    }
  }
  const chair = sit ? opaqueBounds(sit.data, sit.width, 2 * SOURCE_FRAME, down * SOURCE_FRAME, SOURCE_FRAME, SOURCE_FRAME) : null;
  return { standDown: stand, footBottom, headTop, chairSitDown: chair };
}

/* ------------------------------------------------------------------ */
/* 산출물                                                               */
/* ------------------------------------------------------------------ */

function creditId(credit) {
  return credit.file.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase();
}

function markdownCredits(creditsJson) {
  const lines = [
    "# LPC 캐릭터 스프라이트 크레딧 (Credits)",
    "",
    "가상 스튜디오의 LPC 캐릭터 시트는 [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)의",
    "원본 레이어를 겹치고 팔레트로 다시 칠해 만든 2차 저작물입니다. 아래 작가 모두에게 감사드립니다.",
    "The LPC character sheets are derivative works composed and recolored from the layers below.",
    "",
    `- 라이선스 선택(License choice): ${creditsJson.policy.ko}`,
    `- 원본 저장소 커밋(Source commit): \`${creditsJson.source.commit}\``,
    `- 생성 스크립트(Generator): \`${creditsJson.source.generator}\``,
    "",
    "## 작가 (Artists)",
    "",
    creditsJson.authors.join(", "),
    "",
    "## 레이어별 출처 (Per-layer sources)",
    "",
  ];
  for (const entry of creditsJson.entries) {
    lines.push(`### ${entry.sourcePath}`);
    lines.push("");
    lines.push(`- 선택 라이선스(Chosen): [${entry.chosenLicense}](${entry.chosenLicenseUrl}) — 원본 제공 라이선스(Offered): ${entry.offeredLicenses.join(", ")}`);
    lines.push(`- 작가(Authors): ${entry.authors.join(", ")}`);
    if (entry.notes) lines.push(`- 메모(Notes): ${entry.notes}`);
    lines.push(`- 출처(URLs): ${entry.urls.map((url) => `<${url}>`).join(" ")}`);
    lines.push(`- 사용 캐릭터(Used by): ${entry.usedBy.join(", ")}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function buildAll(lpc, sharp) {
  const outputs = new Map();
  const creditMap = new Map();
  const characters = [];
  for (const character of CAST) {
    const rendered = new Map();
    const layersByAnimation = {};
    const files = {};
    for (const animation of ANIMATIONS) {
      const layers = planAnimationLayers(lpc, character, animation);
      const image = await renderAnimation(sharp, layers, animation);
      rendered.set(animation.key, image);
      const scaled = upscaleNearest(image.data, image.width, image.height, PIXEL_SCALE);
      const encoded = await encodeSmallest(sharp, scaled, image.width * PIXEL_SCALE, image.height * PIXEL_SCALE);
      const fileName = `${animation.key}.${encoded.format}`;
      outputs.set(`${character.id}/${fileName}`, encoded.buffer);
      files[animation.key] = {
        file: `${character.id}/${fileName}`, url: `${PUBLIC_URL_ROOT}/${character.id}/${fileName}`, format: encoded.format,
        width: image.width * PIXEL_SCALE, height: image.height * PIXEL_SCALE, bytes: encoded.buffer.byteLength,
        sha256: sha256(encoded.buffer), alternatives: encoded.alternatives, despeckledPixels: image.despeckled,
      };
      layersByAnimation[animation.key] = layers;
      for (const layer of layers) {
        const id = creditId(layer.credit);
        const record = creditMap.get(id) ?? { id, credit: { ...layer.credit, authors: [], urls: [] }, license: layer.license, files: new Set(), usedBy: new Set() };
        if (record.license !== layer.license) throw new Error(`${id}: 같은 크레딧에 다른 라이선스가 선택되었습니다.`);
        // 애니메이션마다 CREDITS.csv 행의 작가가 다를 수 있어 모두 합친다(처음 나온 순서 유지).
        record.credit.authors = [...new Set([...record.credit.authors, ...layer.credit.authors])];
        record.credit.urls = [...new Set([...record.credit.urls, ...layer.credit.urls])];
        record.credit.notes ||= layer.credit.notes;
        record.files.add(layer.file);
        record.usedBy.add(character.id);
        creditMap.set(id, record);
      }
    }
    const walkLayers = layersByAnimation.walk;
    characters.push({
      id: character.id, kind: character.kind, ...(character.npcKey ? { npcKey: character.npcKey } : {}),
      labelKo: character.labelKo, labelEn: character.labelEn, lookKo: character.lookKo, lookEn: character.lookEn,
      bodyType: character.body, skin: character.skin, eyes: character.eyes,
      geometry: measureGeometry(rendered),
      layers: walkLayers.map((layer) => ({
        item: layer.item, definition: layer.definitionPath, layer: layer.layer, zPos: layer.zPos,
        variant: layer.variant, recolor: layer.recolor, credit: creditId(layer.credit), license: layer.license,
      })),
      files,
    });
  }
  const entries = [...creditMap.values()].sort((a, b) => a.id.localeCompare(b.id, "en")).map((record) => ({
    id: record.id, sourcePath: record.credit.file, chosenLicense: record.license, chosenLicenseUrl: LICENSE_URLS[record.license],
    offeredLicenses: record.credit.licenses, authors: record.credit.authors, urls: record.credit.urls, notes: record.credit.notes,
    files: [...record.files].sort(), usedBy: [...record.usedBy].sort(),
  }));
  const source = { repository: "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator",
    commit: lpc.commit, commitDate: lpc.commitDate, generator: SCRIPT_PATH };
  const creditsJson = {
    version: 1, source,
    policy: {
      ko: "레이어마다 원본이 제공하는 라이선스 중 OGA-BY 3.0을 우선 선택하고, 없으면 CC0·CC-BY만 사용했습니다. CC-BY-SA·GPL만 제공되는 레이어는 쓰지 않았습니다.",
      en: "For each layer we chose OGA-BY 3.0 when offered, otherwise only CC0 or CC-BY. Layers offered only under CC-BY-SA or GPL were not used.",
      preference: LICENSE_PREFERENCE, licenseUrls: LICENSE_URLS,
    },
    // 레이어별 기록(entries)은 원본 표기를 그대로 두고, 요약 목록만 같은 사람의 다른 표기를 합친다.
    authors: normalizeAuthors(entries.flatMap((entry) => entry.authors)),
    entries,
  };
  const totalBytes = [...outputs.values()].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const manifest = {
    version: 1,
    description: "가상 스튜디오 LPC 픽셀 캐릭터 시트(NPC·플레이어 프리셋). Universal LPC 원본 레이어를 겹치고 팔레트로 다시 칠한 뒤 2배 최근접 확대했다.",
    source,
    usage: {
      ko: `LPC_REPO=<universal-lpc-spritesheet-character-generator 경로> node ${SCRIPT_PATH} (검증만: --check)`,
      en: `LPC_REPO=<path to universal-lpc-spritesheet-character-generator> node ${SCRIPT_PATH} (verify only: --check)`,
    },
    license: { policy: creditsJson.policy.ko, credits: `${PUBLIC_URL_ROOT}/credits.json`, creditsMarkdown: `${PUBLIC_URL_ROOT}/CREDITS.md` },
    frame: { sourceWidth: SOURCE_FRAME, sourceHeight: SOURCE_FRAME, pixelScale: PIXEL_SCALE, width: FRAME, height: FRAME },
    directions: DIRECTIONS,
    animations: Object.fromEntries(ANIMATIONS.map(({ key, ...rest }) => [key, { ...rest, rows: DIRECTIONS.length }])),
    characters,
    totals: { files: outputs.size, bytes: totalBytes },
  };
  outputs.set("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  outputs.set("credits.json", Buffer.from(`${JSON.stringify(creditsJson, null, 2)}\n`));
  outputs.set("CREDITS.md", Buffer.from(markdownCredits(creditsJson)));
  return { outputs, manifest };
}

export async function writePreview(sharp, outputs, path) {
  const tiles = [];
  for (const character of CAST) {
    const walk = [...outputs.entries()].find(([name]) => name.startsWith(`${character.id}/walk.`));
    const sit = [...outputs.entries()].find(([name]) => name.startsWith(`${character.id}/sit.`));
    const emote = [...outputs.entries()].find(([name]) => name.startsWith(`${character.id}/emote.`));
    if (!walk || !sit || !emote) continue;
    const down = DIRECTIONS.indexOf("down");
    const crop = (buffer, column, row) => sharp(buffer).extract({ left: column * FRAME, top: row * FRAME, width: FRAME, height: FRAME }).png().toBuffer();
    const row = await Promise.all([
      crop(walk[1], 0, down), crop(walk[1], 0, DIRECTIONS.indexOf("left")), crop(walk[1], 0, DIRECTIONS.indexOf("up")),
      crop(walk[1], 0, DIRECTIONS.indexOf("right")), crop(walk[1], 2, down), crop(walk[1], 6, down),
      crop(sit[1], 2, down), crop(sit[1], 2, DIRECTIONS.indexOf("right")), crop(emote[1], 2, down),
    ]);
    tiles.push(row);
  }
  const width = 9 * FRAME, height = tiles.length * FRAME;
  const composite = tiles.flatMap((row, rowIndex) => row.map((input, column) => ({ input, left: column * FRAME, top: rowIndex * FRAME })));
  await sharp({ create: { width, height, channels: 4, background: { r: 143, g: 167, b: 184, alpha: 1 } } })
    .composite(composite).png().toFile(path);
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const dryRun = args.includes("--dry-run");
  const previewIndex = args.indexOf("--preview");
  const preview = previewIndex >= 0 ? args[previewIndex + 1] : null;
  const repo = process.env.LPC_REPO;
  if (!repo) fail("LPC_REPO 환경변수가 없습니다. 예: LPC_REPO=/path/to/universal-lpc-spritesheet-character-generator node scripts/virtual-studio/build-lpc-characters.mjs");
  let lpc;
  try { lpc = loadLpcRepository(resolve(repo)); } catch (error) { fail(`${error.message} LPC_REPO 경로를 확인하세요.`); }
  const sharp = await loadSharp();
  let built;
  try { built = await buildAll(lpc, sharp); } catch (error) { fail(`${error.message}`); }
  const { outputs, manifest } = built;
  if (preview) await writePreview(sharp, outputs, resolve(preview));
  if (check) {
    const problems = [];
    for (const [name, buffer] of outputs) {
      const path = join(OUTPUT_DIR, name);
      if (!existsSync(path)) problems.push(`없음: ${name}`);
      else if (!readFileSync(path).equals(buffer)) problems.push(`다름: ${name}`);
    }
    const expected = new Set(outputs.keys());
    if (existsSync(OUTPUT_DIR)) {
      for (const path of walkFiles(OUTPUT_DIR)) {
        const name = relative(OUTPUT_DIR, path).split(sep).join("/");
        if (!expected.has(name)) problems.push(`남는 파일: ${name}`);
      }
    }
    if (problems.length) fail(`커밋된 산출물이 생성 결과와 다릅니다. 다시 생성하세요(위 사용법).\n  ${problems.join("\n  ")}`);
    console.log(`[build-lpc-characters] 확인 완료: ${outputs.size}개 파일이 생성 결과와 같습니다(${manifest.totals.bytes} bytes 시트).`);
    return;
  }
  if (dryRun) {
    console.log(`[build-lpc-characters] --dry-run: ${CAST.length}명 · ${outputs.size}개 파일 · 시트 ${manifest.totals.bytes} bytes (쓰지 않음)`);
    return;
  }
  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true });
  for (const [name, buffer] of outputs) {
    const path = join(OUTPUT_DIR, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
  }
  console.log(`[build-lpc-characters] ${CAST.length}명 · ${outputs.size}개 파일 · 시트 ${manifest.totals.bytes} bytes → ${relative(ROOT, OUTPUT_DIR)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
