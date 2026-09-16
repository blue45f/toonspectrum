import { describe, expect, it } from "vitest";

import { searchStudio } from "../studio-command-search";

function ids(query: string): string[] {
  return searchStudio(query).sections.flatMap((section) =>
    section.results.map((result) => result.entry.id),
  );
}

describe("unified Brush Studio command search", () => {
  it("finds full brush creation by its visible name and former lab aliases", () => {
    for (const query of [
      "새 브러시 만들기",
      "목적별 브러시 제작실",
      "브러시 연구실",
      "브러시 제작실",
      "Brush Studio V6",
    ]) {
      expect(ids(query), query).toContain("brush.lab");
    }
  });

  it("finds compact current-brush editing by current and former wording", () => {
    for (const query of [
      "현재 브러시 편집",
      "현재 브러시 세부 설정",
      "브러시 상세 설정",
      "브러시 스튜디오",
    ]) {
      expect(ids(query), query).toContain("brush.studio");
    }
  });
});
