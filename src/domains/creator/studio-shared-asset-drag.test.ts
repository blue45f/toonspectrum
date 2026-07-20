import { describe, expect, it } from "vitest";

import {
  parseStudioAssetDragPayload,
  serializeStudioCommunityAssetDragPayload,
  serializeStudioLocalAssetDragPayload,
} from "./studio-shared-asset-drag";

describe("shared asset drag payload", () => {
  it("community payload에는 원본·preview를 넣지 않고 assetId만 직렬화한다", () => {
    const payload = serializeStudioCommunityAssetDragPayload("asset-1");
    expect(JSON.parse(payload)).toEqual({ source: "community", assetId: "asset-1" });
    expect(payload).not.toContain("data:image");
    expect(parseStudioAssetDragPayload(payload)).toEqual({ source: "community", assetId: "asset-1" });
  });

  it("local payload와 fragment 이전 레거시 local payload는 계속 복원한다", () => {
    const payload = serializeStudioLocalAssetDragPayload({
      src: "data:image/png;base64,AA==",
      width: 80,
      height: 40,
    });
    expect(parseStudioAssetDragPayload(payload)).toEqual({
      source: "local",
      src: "data:image/png;base64,AA==",
      width: 80,
      height: 40,
    });
    expect(parseStudioAssetDragPayload(JSON.stringify({ src: "legacy", width: 1, height: 1 })))
      .toEqual({ source: "local", src: "legacy", width: 1, height: 1 });
  });

  it("깨진 id·NaN 대체 값·알 수 없는 source를 거부한다", () => {
    expect(parseStudioAssetDragPayload("not-json")).toBeNull();
    expect(parseStudioAssetDragPayload('{"source":"community","assetId":""}')).toBeNull();
    expect(parseStudioAssetDragPayload('{"source":"remote","src":"x","width":1,"height":1}')).toBeNull();
    expect(parseStudioAssetDragPayload('{"source":"local","src":"x","width":0,"height":1}')).toBeNull();
  });
});
