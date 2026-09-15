import { describe, expect, it } from "vitest";

import { collectStudioDocumentColors } from "./studio-document-colors";

import type { El } from "./studio-element-model";

describe("collectStudioDocumentColors", () => {
  it("ranks authored colors by usage and ignores color-looking prose", () => {
    const elements = [
      {
        id: "draw-1",
        type: "draw",
        kind: "rect",
        points: [0, 0, 10, 10],
        stroke: "#112233",
        strokeWidth: 2,
        fill: "#ffeecc",
      },
      {
        id: "text-1",
        type: "text",
        text: "이 문장의 #ff00ff 는 색상 팔레트가 아니다",
        x: 0,
        y: 0,
        width: 100,
        fontSize: 24,
        fill: "#112233",
        rotation: 0,
        shadowColor: "#445566",
      },
      {
        id: "bubble-1",
        type: "bubble",
        variant: "speech",
        text: "대사",
        x: 0,
        y: 0,
        width: 180,
        height: 100,
        fill: "#ffffff",
        textFill: "#112233",
        rotation: 0,
      },
    ] as El[];

    expect(collectStudioDocumentColors(elements)).toEqual([
      "#112233",
      "#ffffff",
      "#445566",
      "#ffeecc",
    ]);
    expect(collectStudioDocumentColors(elements)).not.toContain("#ff00ff");
  });

  it("deduplicates normalized colors and respects the requested limit", () => {
    const elements = [
      { id: "a", type: "draw", points: [], stroke: "#ABCDEF", strokeWidth: 1 },
      { id: "b", type: "draw", points: [], stroke: "#abcdef", strokeWidth: 1 },
      { id: "c", type: "draw", points: [], stroke: "#123456", strokeWidth: 1 },
    ] as El[];

    expect(collectStudioDocumentColors(elements, 1)).toEqual(["#abcdef"]);
  });
});
