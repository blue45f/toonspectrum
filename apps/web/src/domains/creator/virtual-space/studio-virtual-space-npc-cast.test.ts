import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import {
  STUDIO_NPC_CAST,
  STUDIO_NPC_PROCEDURAL_DEFINITIONS,
  studioNpcCastHasKey,
  studioNpcCastSkinByKey,
  studioNpcCastTextureUrls,
  studioProceduralNpcHasKey,
  studioProceduralNpcSkin,
  studioProceduralNpcSkinByKey,
  studioProceduralNpcTextureUrls,
} from "./studio-virtual-space-npc-cast";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import { STUDIO_NATIVE_NPC_KEYS } from "./studio-virtual-space-npc-native-art";
import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import { STUDIO_LPC_NPC_ART_STYLES, studioLpcNpcSkin } from "./lpc/studio-lpc-characters";

interface V5ManifestFile {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly size: readonly [number, number];
}
interface V5Manifest {
  readonly version: number;
  readonly sourceTechnique: string;
  readonly independentSource: boolean;
  readonly npcRoles: readonly string[];
  readonly styles: readonly string[];
  readonly frame: { readonly width: number; readonly height: number; readonly walkFrames: number; readonly actionFrames: number };
  readonly files: readonly V5ManifestFile[];
}

const root = resolve(process.cwd(), "apps/web/public/assets/virtual-studio");
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

function playerUrls(): Set<string> {
  const urls = new Set<string>();
  for (const skin of STUDIO_CHARACTER_SKINS) {
    Object.values(skin.directional).forEach((url) => urls.add(url));
    Object.values(skin.state ?? {}).forEach((url) => { if (url) urls.add(url); });
    Object.values(skin.clips ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    Object.values(skin.actions ?? {}).forEach((directions) => {
      Object.values(directions ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    });
  }
  return urls;
}

function diskPath(url: string): string {
  return resolve(process.cwd(), "apps/web/public", url.replace(/^\//u, ""));
}

describe("studio NPC 역할별 전용 작화", () => {
  it("uses eight stable NPC identities and never reuses selectable-player URLs", () => {
    expect(STUDIO_NPC_CAST).toHaveLength(8);
    expect(new Set(STUDIO_NPC_CAST.map((skin) => skin.key)).size).toBe(8);
    expect(STUDIO_NPC_CAST.every((skin) => skin.key.startsWith("npc-"))).toBe(true);
    expect([...studioNpcCastTextureUrls()].filter((url) => playerUrls().has(url))).toEqual([]);
  });

  it("기존 테마 원본과 신규 NPC 원본을 각각의 무결성 manifest로 검증한다", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "style-packs-v5/art-v5-manifest.json"), "utf8")) as V5Manifest;
    expect(manifest.version).toBe(5);
    expect(manifest.independentSource).toBe(true);
    expect(manifest.sourceTechnique).toMatch(/no cross-style pixel reuse/u);
    expect(manifest.npcRoles).toHaveLength(8);
    expect(manifest.styles).toEqual(["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]);
    expect(manifest.frame).toEqual({ width: 160, height: 160, walkFrames: 4, actionFrames: 4 });
    const records = new Map(manifest.files.map((item) => [
      `/assets/virtual-studio/style-packs-v5/${item.file}`,
      item,
    ]));
    const nativeManifest = JSON.parse(readFileSync(resolve(root, "experience-v8/npc-art-manifest.json"), "utf8")) as {
      readonly files: readonly { readonly file: string; readonly bytes: number; readonly sha256: string }[];
    };
    const nativeRecords = new Map(nativeManifest.files.map((item) => [`/assets/virtual-studio/experience-v8/${item.file}`, item]));

    for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
      // 픽셀 아틀리에는 LPC NPC 시트를 쓴다(해시·크기는 lpc/studio-lpc-characters.test.ts가 manifest로 검증).
      if (STUDIO_LPC_NPC_ART_STYLES.has(style)) continue;
      const urls = studioNpcCastTextureUrls(style);
      expect(urls.size).toBe(104); // 기존 4종×25파일 + 방향·행동이 한 원본을 공유하는 신규 4종.
      for (const url of urls) {
        const record = records.get(url) ?? nativeRecords.get(url);
        expect(record, `${style}: ${url}`).toBeDefined();
        const path = diskPath(url);
        expect(existsSync(path), path).toBe(true);
        const data = readFileSync(path);
        expect(data.byteLength).toBe(record?.bytes);
        expect(sha256(data)).toBe(record?.sha256);
      }
    }
  });

  it("독립 NPC 4종은 플레이어 선택과 분리하고 공간 테마가 달라도 원본 역할 작화를 유지한다", () => {
    for (const key of STUDIO_NATIVE_NPC_KEYS) {
      expect(STUDIO_CHARACTER_SKINS.some((skin) => skin.key === key)).toBe(false);
      const original = studioNpcCastSkinByKey(key, "webtoon");
      for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
        // 픽셀 아틀리에만 같은 역할의 LPC 픽셀 NPC로 바뀐다.
        expect(studioNpcCastSkinByKey(key, style)).toBe(STUDIO_LPC_NPC_ART_STYLES.has(style) ? studioLpcNpcSkin(key) : original);
      }
      expect(original).toMatchObject({ key, sharedAtlas: true, nativeArtStyle: "webtoon" });
    }
  });

  it("keeps unknown authored cast keys fail-detectable while rendering a safe canonical fallback", () => {
    expect(studioNpcCastHasKey("npc-concierge")).toBe(true);
    expect(studioNpcCastHasKey("pink")).toBe(false);
    expect(studioNpcCastHasKey("missing")).toBe(false);
    expect(studioNpcCastSkinByKey("missing").key).toBe("npc-concierge");
  });
});

function createMockDeps(): ProceduralSheetDeps {
  let counter = 0;
  return {
    createCanvas: (width: number, height: number) => {
      counter += 1;
      const dataUrl = `data:image/png;base64,NPC-TEST-${counter}`;
      const ctx = new Proxy({}, {
        get: (_target, prop: string | symbol) => {
          if (prop === "canvas") return undefined;
          return () => {};
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
      return { width, height, getContext: () => ctx, toDataURL: () => dataUrl } as unknown as HTMLCanvasElement;
    },
  };
}

describe("프로시저럴 NPC 변형 7종", () => {
  const deps = createMockDeps();

  it("역할별 7종 정의를 등록한다", () => {
    expect(STUDIO_NPC_PROCEDURAL_DEFINITIONS).toHaveLength(7);
    const keys = STUDIO_NPC_PROCEDURAL_DEFINITIONS.map((item) => item.key);
    expect(keys).toEqual(["npc-guide", "npc-barista", "npc-guard", "npc-cleaner", "npc-mentor", "npc-visitor", "npc-shopkeeper"]);
    for (const item of STUDIO_NPC_PROCEDURAL_DEFINITIONS) {
      expect(item.labelKo.trim().length).toBeGreaterThan(0);
      expect(item.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("기존 NPC 캐스트와 키가 겹치지 않는다", () => {
    const existing = new Set(STUDIO_NPC_CAST.map((skin) => skin.key));
    for (const item of STUDIO_NPC_PROCEDURAL_DEFINITIONS) {
      expect(existing.has(item.key)).toBe(false);
    }
  });

  it("스킨을 지연 생성하고 역할별 라벨·팔레트를 적용한다", () => {
    const skin = studioProceduralNpcSkin("npc-barista", deps);
    expect(skin?.key).toBe("npc-barista");
    expect(skin?.labelKo).toBe("모카 · 바리스타");
    expect(skin?.labelEn).toBe("Moka · Barista");
    expect(skin?.sharedAtlas).toBe(true);
    expect(skin?.nativeArtStyle).toBe("webtoon");
    expect(skin?.directional.down).toBe("data:image/png;base64,NPC-TEST-1");
    // 아트 스타일 재매핑에서 원본이 보존되도록 네이티브 지정.
    expect(skin?.clips?.["walk-down"]?.start).toBe(0);
    expect(skin?.clips?.["walk-down"]?.end).toBe(5);
  });

  it("7종 모두 dataURL 텍스처로 생성된다", () => {
    const urls = studioProceduralNpcTextureUrls(deps);
    expect(urls.size).toBe(7);
    for (const url of urls) {
      expect(url.startsWith("data:image/png;base64,")).toBe(true);
    }
  });

  it("hasKey와 폴백이 동작한다", () => {
    expect(studioProceduralNpcHasKey("npc-mentor")).toBe(true);
    expect(studioProceduralNpcHasKey("npc-concierge")).toBe(false);
    expect(studioProceduralNpcHasKey("unknown")).toBe(false);
    expect(studioProceduralNpcSkin("unknown", deps)).toBeUndefined();
    expect(studioProceduralNpcSkinByKey("unknown", deps).key).toBe("npc-guide");
    expect(studioProceduralNpcSkinByKey("npc-guard", deps).labelKo).toBe("든든 · 경비원");
  });
});
