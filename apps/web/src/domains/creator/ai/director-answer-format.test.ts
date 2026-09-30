import { describe, expect, it } from "vitest";

import { parseDirectorAnswer, parseDirectorInline } from "./director-answer-format";

describe("director answer format", () => {
  it("turns headings, bullet and numbered lists into blocks", () => {
    const blocks = parseDirectorAnswer("## 로그라인\n비 오는 날의 만남\n\n- 1화: 우산\n- 2화: 정류장\n1. 첫 컷\n2) 둘째 컷");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list", "list"]);
    const [, , bullets, numbered] = blocks;
    expect(bullets).toMatchObject({ kind: "list", ordered: false });
    expect(numbered).toMatchObject({ kind: "list", ordered: true });
    if (bullets?.kind !== "list" || numbered?.kind !== "list") throw new Error("expected lists");
    expect(bullets.items).toHaveLength(2);
    expect(numbered.items[1]).toEqual([{ text: "둘째 컷", strong: false }]);
  });

  it("keeps markup as literal text and only bolds balanced markers", () => {
    expect(parseDirectorInline("**반전** 우산의 주인")).toEqual([
      { text: "반전", strong: true },
      { text: " 우산의 주인", strong: false },
    ]);
    expect(parseDirectorInline("**열린 강조")).toEqual([{ text: "**열린 강조", strong: false }]);
    expect(parseDirectorAnswer("<script>alert(1)</script>")).toEqual([
      { kind: "paragraph", inline: [{ text: "<script>alert(1)</script>", strong: false }] },
    ]);
  });
});
