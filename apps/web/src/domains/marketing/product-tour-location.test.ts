import { describe, expect, it } from "vitest";
import { parseProductTourLocation, productTourFrameForSeconds } from "./product-tour-location";

describe("제품투어 탐색 위치", () => {
  it("0부터 마지막 유효 프레임까지만 허용한다", () => {
    expect(productTourFrameForSeconds(-1)).toBe(0);
    expect(productTourFrameForSeconds(Number.NaN)).toBe(0);
    expect(productTourFrameForSeconds(Infinity)).toBe(0);
    expect(productTourFrameForSeconds(228)).toBe(6840);
    expect(productTourFrameForSeconds(504)).toBe(15119);
    expect(productTourFrameForSeconds(9000)).toBe(15119);
  });
  it("발표 링크의 시간과 호환 재생 모드를 읽는다", () => {
    expect(parseProductTourLocation("?t=228&player=mp4")).toEqual({ seconds: 228, mode: "mp4" });
    expect(parseProductTourLocation("?t=bad&player=unknown")).toEqual({ seconds: 0, mode: "remotion" });
  });
});
