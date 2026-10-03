import { describe, expect, it } from "vitest";

import { studioCharacterStaticAsset } from "../studio-virtual-space-character-assets";
import { studioCharacterBustFrame, studioCharacterPreviewFrame } from "../studio-virtual-space-character-preview";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "../studio-virtual-space-art-style";
import { STUDIO_NPC_CAST, studioNpcCastSkinByKey } from "../studio-virtual-space-npc-cast";
import { spaceNpcExpressionFor } from "./space-npc-portrait";

describe("대화 흐름 → 표정 규칙", () => {
  it("인사·완료=기쁨, 새 소식·이벤트=놀람, 팁·질문·선택지=생각, 그 외=기본", () => {
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

describe("초상화는 NPC 본인 스프라이트에서 파생한다", () => {
  it("전 캐스트 × 전 아트 스타일: 초상화 원본은 그 NPC 본인 텍스처이고 portraits-v1은 절대 쓰지 않는다", () => {
    for (const cast of STUDIO_NPC_CAST) {
      for (const artStyle of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
        const skin = studioNpcCastSkinByKey(cast.key, artStyle);
        const asset = studioCharacterStaticAsset(skin, "down");
        const ownTextures = new Set<string>([
          ...Object.values(skin.directional),
          ...Object.values(skin.clips ?? {}).map((clip) => clip?.textureUrl ?? ""),
        ]);
        expect(asset.url, `${cast.key}/${artStyle}`).not.toContain("portraits-v1");
        expect(ownTextures.has(asset.url), `${cast.key}/${artStyle}: ${asset.url}`).toBe(true);
        if (asset.type === "image") {
          // 단일 이미지형은 정면 텍스처 자체가 프레임이다(호출 측이 CSS로 흉상 확대).
          expect(asset.url, `${cast.key}/${artStyle}`).toBe(skin.directional.down);
        } else {
          // atlas형은 정면 프레임에서 흉상 rect를 계산할 수 있어야 한다.
          const frame = studioCharacterPreviewFrame(asset);
          const bust = studioCharacterBustFrame(asset);
          if (!frame || !bust) throw new Error(`${cast.key}/${artStyle}: 프레임/흉상 계산 실패`);
          expect(bust.y).toBeGreaterThanOrEqual(frame.y);
          expect(bust.y + bust.height).toBeLessThanOrEqual(frame.y + frame.height * 0.62);
          expect(bust.height).toBeLessThan(frame.height);
          // 얼굴 중심(프레임 가로 가운데·위에서 30%)이 크롭 안에 들어간다.
          const faceX = frame.x + frame.width / 2;
          const faceY = frame.y + frame.height * 0.3;
          expect(faceX).toBeGreaterThanOrEqual(bust.x);
          expect(faceX).toBeLessThanOrEqual(bust.x + bust.width);
          expect(faceY).toBeGreaterThanOrEqual(bust.y);
          expect(faceY).toBeLessThanOrEqual(bust.y + bust.height);
        }
      }
    }
  });

  it("npc-concierge(모아) 흉상 크롭은 실제 정면 프레임의 머리·어깨 구간과 정확히 맞는다", () => {
    const skin = studioNpcCastSkinByKey("npc-concierge", "webtoon");
    const asset = studioCharacterStaticAsset(skin, "down");
    // 네이티브 원본(npc-concierge.png 1774×887)의 정면 idle 프레임 0번 실측 rect.
    expect(asset.url).toBe("/assets/virtual-studio/experience-v8/npc-concierge.png");
    expect(studioCharacterPreviewFrame(asset)).toEqual({ index: 0, x: 78, y: 13, width: 134, height: 204 });
    // 상단 4%에서 시작해 높이 54%(어깨까지), 가로는 프레임 전체(134)가 상한(110.16×1.3=143.2)보다 좁아 그대로.
    expect(studioCharacterBustFrame(asset)).toEqual({ index: 0, x: 78, y: 21.16, width: 134, height: 110.16 });
  });

  it("npc-artist(하루) 웹툰 스타일은 본인 정면 이미지를 쓰고, 모르는 키는 첫 캐스트로 폴백한다", () => {
    const artist = studioNpcCastSkinByKey("npc-artist", "webtoon");
    const asset = studioCharacterStaticAsset(artist, "down");
    expect(asset.type).toBe("image");
    expect(asset.url).toBe("/assets/virtual-studio/style-packs-v5/webtoon/npcs/npc-artist-direction-down.webp");
    const fallback = studioNpcCastSkinByKey("npc-unknown", "webtoon");
    expect(fallback.key).toBe("npc-concierge");
    expect(studioCharacterBustFrame(studioCharacterStaticAsset(fallback, "down")))
      .toEqual(studioCharacterBustFrame(studioCharacterStaticAsset(studioNpcCastSkinByKey("npc-concierge", "webtoon"), "down")));
  });
});
