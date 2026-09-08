import { describe, expect, it } from "vitest";

import {
  STUDIO_COMMAND_CATEGORY_LOCATION,
  studioSearchIndex,
} from "./studio-command-search";

describe("Studio search locations", () => {
  it("points command categories at the ten menu titles users actually see", () => {
    expect(STUDIO_COMMAND_CATEGORY_LOCATION).toMatchObject({
      select: "메뉴 › 편집 › 선택 범위",
      transform: "메뉴 › 편집 › 변형",
      canvas: "메뉴 › 보기 › 캔버스",
      window: "메뉴 › 보기 › 패널·작업공간",
      text: "메뉴 › 삽입 › 글자·말풍선",
      vector: "메뉴 › 삽입 › 도형·벡터",
      "3d": "메뉴 › 삽입 › 3D",
      layer: "메뉴 › 레이어",
      brush: "메뉴 › 그리기",
      comic: "메뉴 › 만화",
      animation: "메뉴 › 만화 › 애니메이션",
      filter: "메뉴 › 효과",
    });
    expect(Object.values(STUDIO_COMMAND_CATEGORY_LOCATION)).not.toContain("메뉴 › 선택");
    expect(Object.values(STUDIO_COMMAND_CATEGORY_LOCATION)).not.toContain("메뉴 › 창");
    expect(Object.values(STUDIO_COMMAND_CATEGORY_LOCATION)).not.toContain("메뉴 › 필터");
  });

  it("uses the visible effect and edit paths in actual indexed commands", () => {
    const index = studioSearchIndex();
    expect(index.entries.find(({ id }) => id === "filter.gaussian-blur")?.location)
      .toBe("메뉴 › 효과");
    expect(index.entries.find(({ id }) => id === "select.quick-mask")?.location)
      .toBe("메뉴 › 편집 › 선택 범위");
  });
});
