import { describe, expect, it } from "vitest";

import {
  ANIMATIONS,
  CAST,
  DIRECTIONS,
  LICENSE_PREFERENCE,
  LICENSE_URLS,
  PIXEL_SCALE,
  SOURCE_FRAME,
  applyStripes,
  characterSelections,
  chooseLicense,
  compositeOver,
  hexToRgb,
  normalizeAuthors,
  opaqueBounds,
  parseCreditsCsv,
  recolorRgba,
  removeIsolatedPixels,
  resolveCredit,
  upscaleNearest,
} from "./build-lpc-characters.mjs";

/** 한 변이 size인 RGBA 버퍼. 모든 픽셀을 투명으로 시작한다. */
function rgba(width, height = width) {
  return Buffer.alloc(width * height * 4);
}

function setPixel(buffer, width, x, y, [r, g, b, a = 255]) {
  const offset = (y * width + x) * 4;
  buffer[offset] = r; buffer[offset + 1] = g; buffer[offset + 2] = b; buffer[offset + 3] = a;
}

function pixel(buffer, width, x, y) {
  const offset = (y * width + x) * 4;
  return [buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]];
}

describe("LPC 크레딧·라이선스 도우미", () => {
  it("CREDITS.csv의 따옴표 필드·뒤 공백·쉼표 목록을 읽고 머리글이 다르면 거부한다", () => {
    const csv = [
      "filename,notes,authors,licenses,urls",
      "\"body/male/walk.png\", \"see \"\"details\"\"\", \"Evert, ElizaWy\", \"OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0\", \"https://a.example, https://b.example\"",
      "",
    ].join("\n");
    const rows = parseCreditsCsv(csv);
    expect(rows.get("body/male/walk.png")).toEqual({
      filename: "body/male/walk.png", notes: "see \"details\"", authors: ["Evert", "ElizaWy"],
      licenses: ["OGA-BY 3.0", "CC-BY-SA 3.0", "GPL 3.0"], urls: ["https://a.example", "https://b.example"],
    });
    expect(() => parseCreditsCsv("file,notes\nx,y\n")).toThrow(/머리글/u);
  });

  it("OGA-BY 3.0을 가장 먼저 고르고 CC-BY-SA·GPL만 있으면 사용하지 않는다", () => {
    expect(chooseLicense(["CC-BY-SA 3.0", "GPL 3.0", "OGA-BY 3.0", "CC0"])).toBe("OGA-BY 3.0");
    expect(chooseLicense(["CC-BY 4.0", "CC0"])).toBe("CC0");
    expect(chooseLicense(["CC-BY-SA 4.0", "GPL 3.0"])).toBeNull();
    expect(LICENSE_PREFERENCE[0]).toBe("OGA-BY 3.0");
    expect(LICENSE_PREFERENCE.some((license) => /SA|GPL/u.test(license))).toBe(false);
    for (const license of LICENSE_PREFERENCE) expect(LICENSE_URLS[license]).toMatch(/^https:\/\//u);
  });

  it("크레딧은 정확한 파일 → 디렉터리 → 상위 경로 순서로 찾는다", () => {
    const credits = [{ file: "hair/bob" }, { file: "hair/bob/adult/walk.png" }, { file: "body/bodies/male" }];
    expect(resolveCredit("hair/bob/adult/walk", credits)).toBe(credits[1]);
    expect(resolveCredit("hair/bob/adult/sit", credits)).toBe(credits[0]);
    expect(resolveCredit("body/bodies/male/walk", credits)).toBe(credits[2]);
    expect(resolveCredit("feet/shoes/basic/walk", credits)).toBeNull();
  });

  it("같은 사람의 다른 표기(괄호 별명·대소문자)를 합치고 실명이 있는 표기를 남긴다", () => {
    expect(normalizeAuthors(["ElizaWy", "Eliza Wyatt (ElizaWy)", "bluecarrot16", "Bluecarrot16", "bluecarrot16", "Evert"]))
      .toEqual(["bluecarrot16", "Eliza Wyatt (ElizaWy)", "Evert"]);
    expect(normalizeAuthors([])).toEqual([]);
  });
});

describe("LPC 픽셀 합성 도우미", () => {
  it("팔레트 재색칠은 ±1 색 차이까지 바꾸고 투명 픽셀은 건드리지 않는다", () => {
    const data = rgba(3, 1);
    setPixel(data, 3, 0, 0, [16, 32, 48]);
    setPixel(data, 3, 1, 0, [17, 31, 49]);
    setPixel(data, 3, 2, 0, [16, 32, 48, 0]);
    const changed = recolorRgba(data, [{ source: ["#102030"], target: ["#a0b0c0"] }]);
    expect(changed).toBe(2);
    expect(pixel(data, 3, 0, 0)).toEqual([160, 176, 192, 255]);
    expect(pixel(data, 3, 1, 0)).toEqual([160, 176, 192, 255]);
    expect(pixel(data, 3, 2, 0)).toEqual([16, 32, 48, 0]);
    expect(() => recolorRgba(data, [{ source: ["#000000"], target: [] }])).toThrow(/색 수/u);
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(() => hexToRgb("orange")).toThrow(/#RRGGBB/u);
  });

  it("source-over 합성은 불투명은 덮고 반투명은 섞고 투명은 그대로 둔다", () => {
    const target = rgba(3, 1);
    for (let x = 0; x < 3; x += 1) setPixel(target, 3, x, 0, [0, 0, 255]);
    const source = rgba(3, 1);
    setPixel(source, 3, 0, 0, [255, 0, 0]);
    setPixel(source, 3, 1, 0, [255, 0, 0, 128]);
    compositeOver(target, source);
    expect(pixel(target, 3, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(target, 3, 1, 0)).toEqual([128, 0, 127, 255]);
    expect(pixel(target, 3, 2, 0)).toEqual([0, 0, 255, 255]);
    expect(() => compositeOver(target, rgba(1))).toThrow(/크기/u);
  });

  it("정수 배율 최근접 확대는 픽셀을 섞지 않고 칸을 복제한다", () => {
    const data = rgba(2, 1);
    setPixel(data, 2, 0, 0, [10, 20, 30]);
    setPixel(data, 2, 1, 0, [40, 50, 60, 128]);
    const scaled = upscaleNearest(data, 2, 1, 2);
    expect(scaled.length).toBe(4 * 2 * 4);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(pixel(scaled, 4, x, y)).toEqual([10, 20, 30, 255]);
    for (const [x, y] of [[2, 0], [3, 0], [2, 1], [3, 1]]) expect(pixel(scaled, 4, x, y)).toEqual([40, 50, 60, 128]);
  });

  it("줄무늬는 칸마다 몸통 윗선부터 band행씩 번갈아 고르고 투명 픽셀은 그대로 둔다", () => {
    const frame = 8, width = 16, height = 8;
    const base = rgba(width, height);
    const alt = rgba(width, height);
    // 왼쪽 칸은 2행부터, 오른쪽 칸은 3행부터 옷이 있다(걷기 흔들림처럼 칸마다 윗선이 다르다).
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const top = x < frame ? 2 : 3;
        if (y >= top && x % frame >= 2 && x % frame <= 5) setPixel(base, width, x, y, [255, 255, 255]);
        setPixel(alt, width, x, y, [0, 0, 128]);
      }
    }
    const striped = applyStripes(base, alt, width, height, 2, frame);
    const rowColor = (x, y) => pixel(base, width, x, y)[2];
    // 왼쪽 칸: 2·3행 바탕, 4·5행 줄무늬, 6·7행 바탕.
    expect([2, 3, 4, 5, 6, 7].map((y) => rowColor(3, y))).toEqual([255, 255, 128, 128, 255, 255]);
    // 오른쪽 칸은 3행 기준이라 한 행 밀린다.
    expect([3, 4, 5, 6, 7].map((y) => rowColor(11, y))).toEqual([255, 255, 128, 128, 255]);
    expect(pixel(base, width, 0, 5)[3]).toBe(0);
    expect(striped).toBe(4 * 2 + 4 * 2);
    expect(() => applyStripes(base, alt, width, height, 0, frame)).toThrow(/두께/u);
    expect(() => applyStripes(base, rgba(2), width, height, 2, frame)).toThrow(/크기/u);
  });

  it("외톨이 픽셀만 지우고 이웃이 있는 픽셀·칸 경계 너머 이웃은 구분한다", () => {
    const frame = 4, width = 8, height = 4;
    const data = rgba(width, height);
    setPixel(data, width, 1, 1, [1, 2, 3]); // 외톨이
    setPixel(data, width, 2, 3, [1, 2, 3]); // 대각선 이웃 쌍
    setPixel(data, width, 3, 2, [1, 2, 3]);
    setPixel(data, width, 4, 2, [1, 2, 3]); // 왼쪽 칸 (3,2)와 붙어 있지만 칸이 달라 외톨이
    expect(removeIsolatedPixels(data, width, height, frame)).toBe(2);
    expect(pixel(data, width, 1, 1)[3]).toBe(0);
    expect(pixel(data, width, 4, 2)[3]).toBe(0);
    expect(pixel(data, width, 2, 3)[3]).toBe(255);
    expect(pixel(data, width, 3, 2)[3]).toBe(255);
    expect(opaqueBounds(data, width, 0, 0, frame, frame)).toEqual({ left: 2, top: 2, right: 4, bottom: 4 });
    expect(opaqueBounds(data, width, 4, 0, frame, frame)).toBeNull();
  });
});

describe("LPC 캐릭터 설계", () => {
  it("NPC 8명·플레이어 12명이 겹치지 않는 id와 한·영 라벨을 가진다", () => {
    const ids = CAST.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CAST.filter((character) => character.kind === "npc").map((character) => character.npcKey)).toEqual([
      "npc-concierge", "npc-producer", "npc-editor", "npc-artist", "npc-archivist", "npc-cafe", "npc-security", "npc-host",
    ]);
    expect(CAST.filter((character) => character.kind === "player")).toHaveLength(12);
    for (const character of CAST) {
      expect(character.labelKo, character.id).toMatch(/ · /u);
      expect(character.labelEn, character.id).toMatch(/ · /u);
      expect(character.lookKo.length, character.id).toBeGreaterThan(3);
      expect(["female", "male"]).toContain(character.body);
    }
  });

  it("모든 선택은 몸·머리·표정 뒤에 설계 레이어를 붙이고 색이나 변형을 명시한다", () => {
    for (const character of CAST) {
      const selections = characterSelections(character);
      expect(selections.slice(0, 3).map((selection) => selection.item)).toEqual([
        "body", character.head ?? (character.body === "male" ? "heads_human_male" : "heads_human_female"), "face_neutral",
      ]);
      for (const selection of selections) {
        expect(Boolean(selection.colors) || Boolean(selection.variant), `${character.id}: ${selection.item}`).toBe(true);
        if (selection.stripes) {
          expect(selection.variant, selection.item).toBeUndefined();
          expect(Number.isInteger(selection.stripes.band) && selection.stripes.band >= 1).toBe(true);
        }
      }
    }
  });

  it("시트 규격은 LPC 원본 64px 프레임·4방향·애니메이션 열 수를 따른다", () => {
    expect(SOURCE_FRAME).toBe(64);
    expect(Number.isInteger(PIXEL_SCALE) && PIXEL_SCALE >= 1).toBe(true);
    expect(DIRECTIONS).toEqual(["up", "left", "down", "right"]);
    expect(Object.fromEntries(ANIMATIONS.map((animation) => [animation.key, animation.columns])))
      .toEqual({ walk: 9, idle: 2, sit: 3, emote: 3, run: 8 });
    for (const animation of ANIMATIONS) {
      expect(animation.cycle.every((column) => column >= 0 && column < animation.columns), animation.key).toBe(true);
    }
  });
});
