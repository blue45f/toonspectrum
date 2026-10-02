import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadSpaceNpcPortraitManifest,
  parseSpaceNpcPortraitManifest,
  resetSpaceNpcPortraitManifestCache,
  SPACE_NPC_PORTRAIT_FALLBACK,
  SPACE_NPC_PORTRAIT_ROOT,
  spaceNpcExpressionFor,
  studioNpcPortrait,
} from "./space-npc-portrait";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../public");
const PORTRAIT_DIR = resolve(PUBLIC_DIR, `.${SPACE_NPC_PORTRAIT_ROOT}`);
const manifestJson: unknown = JSON.parse(readFileSync(resolve(PORTRAIT_DIR, "manifest.json"), "utf8"));

afterEach(() => resetSpaceNpcPortraitManifestCache());

describe("portraits-v1 매니페스트 계약", () => {
  it("기본 초상화 8종이 모두 있고, 정적 표의 파일은 매니페스트·디스크와 일치한다", () => {
    const manifest = parseSpaceNpcPortraitManifest(manifestJson);
    if (!manifest) throw new Error("매니페스트를 읽지 못했습니다.");
    expect(manifest.portraits.size).toBe(8);
    for (const [npc, file] of SPACE_NPC_PORTRAIT_FALLBACK.portraits) {
      expect(manifest.portraits.get(npc), npc).toBe(file);
      expect(existsSync(resolve(PORTRAIT_DIR, file)), file).toBe(true);
    }
  });

  it("매니페스트에 적힌 표정 파일은 실제로 디스크에 있다", () => {
    const manifest = parseSpaceNpcPortraitManifest(manifestJson);
    if (!manifest) throw new Error("매니페스트를 읽지 못했습니다.");
    for (const variants of manifest.expressions.values()) {
      for (const file of Object.values(variants)) expect(existsSync(resolve(PORTRAIT_DIR, file ?? "")), file).toBe(true);
    }
  });

  it("형식이 틀린 항목·경로 탈출은 버린다", () => {
    expect(parseSpaceNpcPortraitManifest(null)).toBeNull();
    expect(parseSpaceNpcPortraitManifest({ portraits: [{ npc: "npc-a", file: "../x.webp" }] })).toBeNull();
    const parsed = parseSpaceNpcPortraitManifest({
      portraits: [{ npc: "npc-a", file: "npc-a.webp" }, { npc: "bad key", file: "x.webp" }],
      expressions: { "npc-a": { happy: "npc-a-happy.webp", angry: "npc-a-angry.webp", thinking: "../t.webp" }, "npc-z": { happy: "z.webp" } },
    });
    expect([...parsed?.portraits.keys() ?? []]).toEqual(["npc-a"]);
    expect(parsed?.expressions.get("npc-a")).toEqual({ happy: "npc-a-happy.webp" });
    expect(parsed?.expressions.has("npc-z")).toBe(false);
  });
});

describe("studioNpcPortrait", () => {
  const manifest = parseSpaceNpcPortraitManifest({
    portraits: [{ npc: "npc-cafe", file: "npc-cafe.webp" }],
    expressions: { "npc-cafe": { happy: "npc-cafe-happy.webp" } },
  });
  it("표정 파일이 있으면 그 파일을, 없으면 기본 초상화를, 초상화가 없으면 null(절차 초상화)을 준다", () => {
    if (!manifest) throw new Error("매니페스트가 필요합니다.");
    expect(studioNpcPortrait("npc-cafe", "happy", manifest)).toEqual({
      src: `${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe-happy.webp`, fallbackSrc: `${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe.webp`, expression: "happy",
    });
    expect(studioNpcPortrait("npc-cafe", "surprised", manifest)).toMatchObject({ src: `${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe.webp`, expression: "default" });
    expect(studioNpcPortrait("npc-unknown", "happy", manifest)).toBeNull();
    expect(studioNpcPortrait("npc-host")).toMatchObject({ src: `${SPACE_NPC_PORTRAIT_ROOT}/npc-host.webp` });
  });

  it("대화 흐름 규칙: 인사·완료=기쁨, 새 소식·이벤트=놀람, 팁·질문·선택지=생각, 그 외=기본", () => {
    expect(spaceNpcExpressionFor("greeting")).toBe("happy");
    expect(spaceNpcExpressionFor("done")).toBe("happy");
    expect(spaceNpcExpressionFor("news")).toBe("surprised");
    expect(spaceNpcExpressionFor("event")).toBe("surprised");
    expect(spaceNpcExpressionFor("tip")).toBe("thinking");
    expect(spaceNpcExpressionFor("question")).toBe("thinking");
    expect(spaceNpcExpressionFor("choices")).toBe("thinking");
    expect(spaceNpcExpressionFor("info")).toBe("default");
  });
});

describe("loadSpaceNpcPortraitManifest", () => {
  it("한 번만 읽어 캐시하고, 실패하면 정적 표로 대체한 뒤 다음에 다시 시도한다", async () => {
    const failing = vi.fn<typeof fetch>(async () => { throw new TypeError("offline"); });
    await expect(loadSpaceNpcPortraitManifest(failing)).resolves.toBe(SPACE_NPC_PORTRAIT_FALLBACK);
    const ok = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(manifestJson), { status: 200 }));
    const first = await loadSpaceNpcPortraitManifest(ok);
    const second = await loadSpaceNpcPortraitManifest(ok);
    expect(first).toBe(second);
    expect(ok).toHaveBeenCalledOnce();
    expect(first.portraits.size).toBe(8);
  });
});
