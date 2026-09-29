import { describe, expect, it } from "vitest";

import {
  buildWebtoonPoseShareFileName,
  parseWebtoonPoseSharePayload,
  serializeWebtoonPoseSharePayload,
} from "./studio-webtoon-pose-share";

describe("웹툰 포즈 프리셋 팀 공유 JSON", () => {
  it("직렬화→파싱 라운드트립이 보존된다", () => {
    const json = serializeWebtoonPoseSharePayload({
      presetIds: ["action-hero-landing", "daily-coffee-sip"],
      favoriteIds: ["daily-coffee-sip"],
    });
    const payload = parseWebtoonPoseSharePayload(json);
    expect(payload).not.toBeNull();
    expect(payload?.app).toBe("toonstudio.webtoon-pose-share");
    expect(payload?.version).toBe(1);
    expect(payload?.presetIds).toEqual(["action-hero-landing", "daily-coffee-sip"]);
    expect(payload?.favoriteIds).toEqual(["daily-coffee-sip"]);
    expect(typeof payload?.exportedAt).toBe("string");
  });

  it("모르는 프리셋 id와 중복은 버린다", () => {
    const json = serializeWebtoonPoseSharePayload({
      presetIds: ["action-hero-landing", "unknown-pose", "action-hero-landing", 42 as never],
    });
    const payload = parseWebtoonPoseSharePayload(json);
    expect(payload?.presetIds).toEqual(["action-hero-landing"]);
  });

  it("잘못된 입력은 null을 돌려준다", () => {
    expect(parseWebtoonPoseSharePayload("")).toBeNull();
    expect(parseWebtoonPoseSharePayload("깨진 JSON{{")).toBeNull();
    expect(parseWebtoonPoseSharePayload(null)).toBeNull();
    expect(parseWebtoonPoseSharePayload(JSON.stringify({ app: "other-app", version: 1 }))).toBeNull();
    expect(
      parseWebtoonPoseSharePayload(
        JSON.stringify({ app: "toonstudio.webtoon-pose-share", version: 2, presetIds: ["a"] }),
      ),
    ).toBeNull();
    // 프리셋이 하나도 없으면 공유 의미가 없다.
    expect(
      parseWebtoonPoseSharePayload(
        JSON.stringify({
          app: "toonstudio.webtoon-pose-share",
          version: 1,
          presetIds: ["unknown-pose"],
        }),
      ),
    ).toBeNull();
  });

  it("공유 파일명을 만든다", () => {
    const name = buildWebtoonPoseShareFileName(new Date("2026-09-29T12:00:00Z"));
    expect(name).toBe("toonstudio-webtoon-poses-2026-09-29.json");
  });
});
