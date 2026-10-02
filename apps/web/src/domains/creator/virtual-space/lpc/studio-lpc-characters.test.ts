import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "../studio-virtual-space-art-style";
import {
  StudioCharacterAssetResidency,
  studioCharacterActionSheetMatches,
  studioCharacterPoseSheetMatches,
  studioCharacterStaticAsset,
  studioCharacterStaticSheetMatches,
  studioCharacterVisualAssets,
  studioCharacterWalkTextureKey,
  type StudioCharacterTextureAsset,
} from "../studio-virtual-space-character-assets";
import {
  STUDIO_CHARACTER_SKINS,
  resolveStudioCharacterAppearance,
  studioCharacterActionClip,
  studioCharacterAppearanceForAvatarIndex,
  studioCharacterSkinByKey,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
} from "../studio-virtual-space-character-skins";
import { STUDIO_NPC_CAST, studioNpcCastSkinByKey, studioNpcCastTextureUrls } from "../studio-virtual-space-npc-cast";
import {
  STUDIO_LPC_ANIMATION_COLUMNS,
  STUDIO_LPC_ANIMATION_KEYS,
  STUDIO_LPC_ASSET_ROOT,
  STUDIO_LPC_CHARACTERS,
  STUDIO_LPC_CREDIT_AUTHORS,
  STUDIO_LPC_DIRECTIONS,
  STUDIO_LPC_LICENSE_USES,
  STUDIO_LPC_FRAME,
  STUDIO_LPC_NPC_ART_STYLES,
  STUDIO_LPC_PIXEL_SCALE,
  STUDIO_LPC_PLAYER_SKINS,
  STUDIO_LPC_PRESENTATION,
  STUDIO_LPC_SEATED_PRESENTATION,
  STUDIO_LPC_SOURCE_FRAME,
  studioLpcAtlas,
  studioLpcCharacterSheetUrls,
  studioLpcFrameIndex,
  studioLpcNpcSkin,
  studioLpcSheetUrl,
  studioLpcSkinKey,
} from "./studio-lpc-characters";

interface ManifestFile {
  readonly file: string;
  readonly url: string;
  readonly format: "webp" | "png";
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly alternatives: { readonly webp: number; readonly png: number };
  /** 합성 뒤 지운 외톨이 픽셀 수(원본 시트의 얼룩 점). */
  readonly despeckledPixels: number;
}
interface ManifestBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
interface ManifestCharacter {
  readonly id: string;
  readonly kind: "npc" | "player";
  readonly npcKey?: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly bodyType: string;
  readonly skin: string;
  readonly geometry: { readonly standDown: ManifestBounds; readonly footBottom: number; readonly headTop: number; readonly chairSitDown: ManifestBounds };
  readonly layers: readonly { readonly item: string; readonly credit: string; readonly license: string; readonly zPos: number }[];
  readonly files: Readonly<Record<string, ManifestFile>>;
}
interface Manifest {
  readonly version: number;
  readonly source: { readonly repository: string; readonly commit: string; readonly generator: string };
  readonly usage: { readonly ko: string; readonly en: string };
  readonly frame: { readonly sourceWidth: number; readonly sourceHeight: number; readonly pixelScale: number; readonly width: number; readonly height: number };
  readonly directions: readonly string[];
  readonly animations: Readonly<Record<string, { readonly columns: number; readonly rows: number; readonly cycle: readonly number[] }>>;
  readonly characters: readonly ManifestCharacter[];
  readonly totals: { readonly files: number; readonly bytes: number };
}
interface CreditEntry {
  readonly id: string;
  readonly sourcePath: string;
  readonly chosenLicense: string;
  readonly chosenLicenseUrl: string;
  readonly offeredLicenses: readonly string[];
  readonly authors: readonly string[];
  readonly urls: readonly string[];
  readonly files: readonly string[];
  readonly usedBy: readonly string[];
}
interface Credits {
  readonly version: number;
  readonly source: { readonly commit: string };
  readonly policy: { readonly ko: string; readonly en: string };
  readonly authors: readonly string[];
  readonly entries: readonly CreditEntry[];
}

const PUBLIC = resolve(process.cwd(), "apps/web/public");
const ROOT = join(PUBLIC, STUDIO_LPC_ASSET_ROOT.replace(/^\//u, ""));
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as Manifest;
const credits = JSON.parse(readFileSync(join(ROOT, "credits.json"), "utf8")) as Credits;
const creditsMarkdown = readFileSync(join(ROOT, "CREDITS.md"), "utf8");
/** 출처 표기만 요구하는 허용 라이선스. CC-BY-SA·GPL 전용 레이어는 쓰지 않는다. */
const ALLOWED = new Set(["OGA-BY 3.0", "OGA-BY 3.0+", "OGA-BY 4.0", "CC0", "CC-BY 4.0", "CC-BY 3.0+", "CC-BY 3.0", "CC-BY"]);
const BUDGET_BYTES = 4 * 1024 * 1024;

const diskPath = (url: string) => join(PUBLIC, url.replace(/^\//u, ""));
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** 무손실 WebP(VP8L) 머리에서 크기를 읽는다. 디코더 없이 선언 크기와 실제 파일을 대조한다. */
function webpLosslessSize(data: Buffer): { width: number; height: number } {
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 16)).toBe("WEBPVP8L");
  expect(data[20]).toBe(0x2f);
  const bits = data.readUInt32LE(21);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

describe("LPC 캐릭터 산출물 manifest", () => {
  it("프레임·방향·애니메이션 규격이 스킨 상수와 같다", () => {
    expect(manifest.version).toBe(1);
    expect(manifest.frame).toEqual({
      sourceWidth: STUDIO_LPC_SOURCE_FRAME, sourceHeight: STUDIO_LPC_SOURCE_FRAME,
      pixelScale: STUDIO_LPC_PIXEL_SCALE, width: STUDIO_LPC_FRAME, height: STUDIO_LPC_FRAME,
    });
    expect(manifest.directions).toEqual(STUDIO_LPC_DIRECTIONS);
    expect(Object.keys(manifest.animations)).toEqual(STUDIO_LPC_ANIMATION_KEYS);
    for (const animation of STUDIO_LPC_ANIMATION_KEYS) {
      expect(manifest.animations[animation]).toMatchObject({ columns: STUDIO_LPC_ANIMATION_COLUMNS[animation], rows: 4 });
    }
    expect(manifest.animations.walk?.cycle).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(manifest.source.repository).toMatch(/Universal-LPC-Spritesheet-Character-Generator$/u);
    expect(manifest.source.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(manifest.source.generator).toBe("scripts/virtual-studio/build-lpc-characters.mjs");
    expect(manifest.usage.ko).toContain("LPC_REPO=");
    expect(existsSync(resolve(process.cwd(), manifest.source.generator))).toBe(true);
  });

  it("NPC 8명과 플레이어 프리셋 12종의 id·역할·라벨이 런타임 등록부와 같다", () => {
    expect(manifest.characters.map(({ id, kind, npcKey, labelKo, labelEn }) => ({ id, kind, ...(npcKey ? { npcKey } : {}), labelKo, labelEn })))
      .toEqual(STUDIO_LPC_CHARACTERS.map((character) => ({ ...character })));
    expect(STUDIO_LPC_CHARACTERS.filter((character) => character.kind === "npc").map((character) => character.npcKey))
      .toEqual(STUDIO_NPC_CAST.map((skin) => skin.key));
    expect(STUDIO_LPC_CHARACTERS.filter((character) => character.kind === "player")).toHaveLength(12);
    const players = manifest.characters.filter((character) => character.kind === "player");
    // 성별·피부색이 한쪽으로 몰리지 않게 나눈다.
    expect(new Set(players.map((character) => character.bodyType))).toEqual(new Set(["female", "male"]));
    expect(players.filter((character) => character.bodyType === "female").length).toBe(6);
    expect(new Set(players.map((character) => character.skin)).size).toBeGreaterThanOrEqual(8);
  });

  it("모든 시트가 선언한 URL·크기·바이트·해시와 일치하고 총 용량 예산 안에 있다", () => {
    let bytes = 0;
    const declared = new Set<string>(["manifest.json", "credits.json", "CREDITS.md"]);
    for (const character of manifest.characters) {
      expect(Object.keys(character.files)).toEqual(STUDIO_LPC_ANIMATION_KEYS);
      expect(Object.values(character.files).map((file) => file.url)).toEqual(studioLpcCharacterSheetUrls(character.id));
      for (const animation of STUDIO_LPC_ANIMATION_KEYS) {
        const file = character.files[animation];
        if (!file) throw new Error(`${character.id}/${animation} 시트가 manifest에 없습니다.`);
        const atlas = studioLpcAtlas(animation);
        expect(file.url).toBe(studioLpcSheetUrl(character.id, animation));
        expect([file.width, file.height]).toEqual([atlas.width, atlas.height]);
        expect(file.format).toBe("webp");
        expect(file.bytes).toBeLessThanOrEqual(file.alternatives.png);
        // 얼룩 점 정리는 원본의 고립 점만 지운다(세부 묘사를 지우지 않도록 시트마다 몇 점 이하).
        expect(file.despeckledPixels, file.url).toBeLessThanOrEqual(4);
        const data = readFileSync(diskPath(file.url));
        expect(data.byteLength, file.url).toBe(file.bytes);
        expect(sha256(data), file.url).toBe(file.sha256);
        expect(webpLosslessSize(data), file.url).toEqual({ width: atlas.width, height: atlas.height });
        bytes += file.bytes;
        declared.add(file.file);
      }
    }
    expect(bytes).toBe(manifest.totals.bytes);
    expect(manifest.totals.files).toBe(manifest.characters.length * STUDIO_LPC_ANIMATION_KEYS.length);
    // 저장소에는 선언한 파일만 있고(원본 LPC 레이어를 복사하지 않음) 전체가 4MB 예산 안이다.
    const files = walkFiles(ROOT).map((path) => path.slice(ROOT.length + 1).split("\\").join("/"));
    expect(new Set(files)).toEqual(declared);
    const total = walkFiles(ROOT).reduce((sum, path) => sum + statSync(path).size, 0);
    expect(total).toBeLessThan(BUDGET_BYTES);
  });

  it("측정한 발·의자 기준이 스킨 표시 좌표와 맞는다", () => {
    for (const character of manifest.characters) {
      // 서 있는 발바닥은 모든 캐릭터에서 62px(원점 originY)이다.
      expect(character.geometry.standDown.bottom, character.id).toBe(Math.round(STUDIO_LPC_PRESENTATION.originY * STUDIO_LPC_SOURCE_FRAME));
      expect(character.geometry.footBottom, character.id).toBeLessThanOrEqual(STUDIO_LPC_SOURCE_FRAME);
      expect(character.geometry.headTop, character.id).toBeGreaterThanOrEqual(4);
      // 의자 앉기 프레임의 엉덩이 기준은 발과 머리 사이에 있다.
      const seat = (STUDIO_LPC_SEATED_PRESENTATION.seatOriginY ?? 0) * STUDIO_LPC_SOURCE_FRAME;
      expect(seat).toBeGreaterThan(character.geometry.chairSitDown.top + 20);
      expect(seat).toBeLessThan(character.geometry.chairSitDown.bottom);
    }
  });
});

describe("LPC 크레딧", () => {
  const entries = new Map(credits.entries.map((entry) => [entry.id, entry]));

  it("사용한 모든 레이어가 크레딧에 있고 허용 라이선스(OGA-BY 우선·CC0·CC-BY)만 선택했다", () => {
    for (const character of manifest.characters) {
      for (const layer of character.layers) {
        const entry = entries.get(layer.credit);
        expect(entry, `${character.id}: ${layer.item}`).toBeDefined();
        expect(entry?.usedBy, layer.item).toContain(character.id);
        expect(layer.license).toBe(entry?.chosenLicense);
      }
    }
    for (const entry of credits.entries) {
      expect(ALLOWED.has(entry.chosenLicense), entry.id).toBe(true);
      expect(entry.offeredLicenses, entry.id).toContain(entry.chosenLicense);
      if (entry.offeredLicenses.includes("OGA-BY 3.0")) expect(entry.chosenLicense, entry.id).toBe("OGA-BY 3.0");
      expect(entry.chosenLicenseUrl, entry.id).toMatch(/^https:\/\//u);
      expect(entry.authors.length, entry.id).toBeGreaterThan(0);
      expect(entry.urls.length, entry.id).toBeGreaterThan(0);
      expect(entry.files.length, entry.id).toBeGreaterThan(0);
      for (const user of entry.usedBy) expect(manifest.characters.some((character) => character.id === user), user).toBe(true);
    }
    expect(credits.source.commit).toBe(manifest.source.commit);
    expect(credits.policy.ko).toContain("OGA-BY 3.0");
  });

  it("작가 요약은 레이어별 작가 전원을 한 번씩(같은 사람의 다른 표기는 합쳐) 담고 CREDITS.md에 모두 적혀 있다", () => {
    // "Eliza Wyatt (ElizaWy)"·"ElizaWy"처럼 괄호 별명이나 대소문자만 다른 표기는 한 사람이다.
    const handle = (name: string) => (/\(([^()]+)\)\s*$/u.exec(name)?.[1] ?? name).trim().toLowerCase();
    const summary = credits.authors.map(handle);
    expect(new Set(summary).size, "요약 목록에 같은 사람이 두 번 있다").toBe(summary.length);
    expect(new Set(summary)).toEqual(new Set(credits.entries.flatMap((entry) => entry.authors.map(handle))));
    for (const author of credits.authors) expect(creditsMarkdown).toContain(author);
    for (const author of credits.entries.flatMap((entry) => entry.authors)) expect(creditsMarkdown).toContain(author);
    for (const entry of credits.entries) {
      expect(creditsMarkdown).toContain(`### ${entry.sourcePath}`);
      for (const url of entry.urls) expect(creditsMarkdown).toContain(url);
    }
    expect(creditsMarkdown).toContain("OGA-BY 3.0");
  });

  it("화면 크레딧 요약(작가·라이선스별 레이어 수)이 생성된 credits.json과 같다", () => {
    expect([...STUDIO_LPC_CREDIT_AUTHORS]).toEqual(credits.authors);
    const uses = new Map<string, { url: string; layers: number }>();
    for (const entry of credits.entries) {
      const use = uses.get(entry.chosenLicense) ?? { url: entry.chosenLicenseUrl, layers: 0 };
      expect(use.url, entry.id).toBe(entry.chosenLicenseUrl);
      uses.set(entry.chosenLicense, { url: use.url, layers: use.layers + 1 });
    }
    expect(Object.fromEntries(STUDIO_LPC_LICENSE_USES.map(({ license, url, layers }) => [license, { url, layers }])))
      .toEqual(Object.fromEntries(uses));
    expect(STUDIO_LPC_LICENSE_USES.every((use) => ALLOWED.has(use.license))).toBe(true);
  });
});

describe("LPC 스킨 연결", () => {
  const seoha = studioCharacterSkinByKey(studioLpcSkinKey("player-seoha"));

  it("플레이어 프리셋은 기존 인덱스·자동 배정을 바꾸지 않고 선택 목록 끝에 붙는다", () => {
    const keys = STUDIO_CHARACTER_SKINS.map((skin) => skin.key);
    expect(keys.slice(0, 5)).toEqual(["pink", "silver", "dark", "purple", "imagegen25"]);
    expect(keys.slice(-STUDIO_LPC_PLAYER_SKINS.length)).toEqual(STUDIO_LPC_PLAYER_SKINS.map((skin) => skin.key));
    expect(STUDIO_LPC_PLAYER_SKINS.every((skin) => skin.selectionOnly && skin.pixelArt === "lpc" && skin.sharedMotionSheets)).toBe(true);
    expect(seoha.key).toBe("lpc-player-seoha");
    for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) expect(studioCharacterSkinForArtStyle(seoha, style)).toBe(seoha);
  });

  it("방향별 걷기 순환·서기 프레임·의자 앉기·양손 인사·대화 호흡을 LPC 시트 칸에 연결한다", () => {
    for (const facing of STUDIO_LPC_DIRECTIONS) {
      const clip = studioCharacterWalkClip(seoha, facing);
      expect(clip).toMatchObject({ textureUrl: studioLpcSheetUrl("player-seoha", "walk"), frameWidth: 128, frameHeight: 128,
        start: studioLpcFrameIndex("walk", facing, 1), end: studioLpcFrameIndex("walk", facing, 8), technique: "drawn" });
      expect(clip?.distancePerCycle).toBeGreaterThan(0);
      expect(clip?.frames).toHaveLength(8);
      const idle = studioCharacterStaticAsset(seoha, facing);
      expect(idle).toMatchObject({ type: "spritesheet", frame: studioLpcFrameIndex("walk", facing, 0), presentation: STUDIO_LPC_PRESENTATION });
      expect(studioCharacterStaticSheetMatches(idle, 1152, 512)).toBe(true);
      expect(studioCharacterStaticSheetMatches(idle, 1151, 512)).toBe(false);
      const talk = studioCharacterActionClip(seoha, facing, "talk");
      expect(talk?.textureUrl).toBe(studioLpcSheetUrl("player-seoha", "idle"));
      expect(talk && studioCharacterActionSheetMatches(talk, 256, 512)).toBe(true);
      expect(studioCharacterActionClip(seoha, facing, "draw")).toBeUndefined();
    }
    const sit = seoha.poses?.sit;
    const wave = seoha.poses?.wave;
    expect(sit?.textureUrl).toBe(studioLpcSheetUrl("player-seoha", "sit"));
    expect(sit?.directionFrames).toEqual({ up: 2, left: 5, down: 8, right: 11 });
    expect(sit && studioCharacterPoseSheetMatches(sit, 384, 512)).toBe(true);
    expect(sit?.frames[8]?.seatOriginY).toBe(STUDIO_LPC_SEATED_PRESENTATION.seatOriginY);
    expect(wave?.textureUrl).toBe(studioLpcSheetUrl("player-seoha", "emote"));
    expect(wave?.directionFrames.down).toBe(8);
  });

  it("방향이 바뀌어도 동작별 시트 하나만 올리고 앉기·인사·대화는 필요할 때만 불러온다", () => {
    const keys = new Set(STUDIO_LPC_DIRECTIONS.map((facing) => studioCharacterWalkTextureKey(seoha, facing)));
    expect(keys).toEqual(new Set(["studio-player-lpc-player-seoha-walk-sheet"]));
    for (const facing of STUDIO_LPC_DIRECTIONS) {
      expect(studioCharacterVisualAssets(seoha, facing, "walk")).toEqual([studioCharacterStaticAsset(seoha, facing)]);
    }
    const idle = studioCharacterStaticAsset(seoha, "down");
    expect(idle.animationKeys).toHaveLength(4);
    expect(studioCharacterVisualAssets(seoha, "down", "sit").map((asset) => asset.url))
      .toEqual([studioLpcSheetUrl("player-seoha", "walk"), studioLpcSheetUrl("player-seoha", "sit")]);
    expect(studioCharacterVisualAssets(seoha, "left", "wave").map((asset) => asset.url))
      .toEqual([studioLpcSheetUrl("player-seoha", "walk"), studioLpcSheetUrl("player-seoha", "emote")]);
    const talkLeft = studioCharacterVisualAssets(seoha, "left", "talk");
    const talkUp = studioCharacterVisualAssets(seoha, "up", "talk");
    expect(talkLeft[1]?.key).toBe("studio-player-lpc-player-seoha-talk-sheet");
    expect(talkUp[1]?.key).toBe(talkLeft[1]?.key);
    expect(studioCharacterVisualAssets(seoha, "down", "draw")).toEqual([idle]);

    const pending = new Map<string, (success: boolean) => void>();
    const load = vi.fn((asset: StudioCharacterTextureAsset, complete: (success: boolean) => void) => {
      pending.set(asset.key, complete);
      return () => undefined;
    });
    const residency = new StudioCharacterAssetResidency({ has: () => false, load, remove: vi.fn() });
    for (const facing of STUDIO_LPC_DIRECTIONS) residency.use("self", studioCharacterVisualAssets(seoha, facing, "walk"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("LPC 텍스처는 모두 최근접(NEAREST) 필터 힌트를 갖고 일러스트 스킨은 장면 기본 필터를 유지한다", () => {
    for (const skin of [...STUDIO_LPC_PLAYER_SKINS, ...STUDIO_NPC_CAST.flatMap((source) => studioLpcNpcSkin(source.key) ?? [])]) {
      for (const facing of STUDIO_LPC_DIRECTIONS) {
        for (const state of ["idle", "walk", "talk", "sit", "wave"] as const) {
          for (const asset of studioCharacterVisualAssets(skin, facing, state)) expect(asset.textureFilter, `${skin.key}/${facing}/${state}`).toBe("nearest");
        }
      }
    }
    const illustrated = STUDIO_CHARACTER_SKINS.filter((skin) => !skin.pixelArt);
    expect(illustrated.length).toBeGreaterThan(0);
    for (const skin of illustrated) expect(studioCharacterStaticAsset(skin, "down").textureFilter, skin.key).toBeUndefined();
  });

  it("공유 등록부는 실제 동작(걷기·대화·앉기·인사)만 알리고 피어도 같은 스킨으로 해석한다", () => {
    const index = STUDIO_CHARACTER_SKINS.findIndex((skin) => skin.key === seoha.key);
    const appearance = studioCharacterAppearanceForAvatarIndex(index);
    expect(appearance.skinKey).toBe(seoha.key);
    expect([...appearance.capabilities].sort()).toEqual(["idle", "sit", "talk", "walk-down", "walk-left", "walk-right", "walk-up", "wave"]);
    const resolved = resolveStudioCharacterAppearance({ avatarIndex: 0, appearance }, "peer", "sit");
    expect(resolved.skin).toBe(seoha);
    expect(resolved.clip).toBe("sit");
  });
});

describe("LPC NPC 적용 범위", () => {
  it("픽셀 아틀리에(retro)에서는 같은 역할의 LPC NPC로, 다른 스타일은 기존 일러스트 NPC로 해석한다", () => {
    expect([...STUDIO_LPC_NPC_ART_STYLES]).toEqual(["retro"]);
    for (const source of STUDIO_NPC_CAST) {
      const lpc = studioLpcNpcSkin(source.key);
      expect(lpc?.key).toBe(studioLpcSkinKey(source.key));
      expect(lpc?.labelKo).toBe(source.labelKo);
      for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
        const skin = studioNpcCastSkinByKey(source.key, style);
        if (STUDIO_LPC_NPC_ART_STYLES.has(style)) expect(skin).toBe(lpc);
        else expect(skin.pixelArt).toBeUndefined();
      }
    }
    const retroUrls = studioNpcCastTextureUrls("retro");
    const expected = new Set(STUDIO_NPC_CAST.flatMap((source) => (["walk", "idle", "sit", "emote"] as const)
      .map((animation) => studioLpcSheetUrl(source.key, animation))));
    expect(retroUrls).toEqual(expected);
    for (const url of retroUrls) expect(existsSync(diskPath(url)), url).toBe(true);
    // NPC 시트는 플레이어 선택 목록과 겹치지 않는다.
    const playerSheets = new Set(STUDIO_LPC_PLAYER_SKINS.flatMap((skin) => Object.values(skin.clips ?? {}).map((clip) => clip?.textureUrl)));
    expect([...retroUrls].filter((url) => playerSheets.has(url))).toEqual([]);
  });
});
