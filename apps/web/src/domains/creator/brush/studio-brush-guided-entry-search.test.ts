import { describe, expect, it } from "vitest";

import { searchStudio } from "../studio-command-search";

function ids(query: string): string[] {
  return searchStudio(query).sections.flatMap((section) =>
    section.results.map((result) => result.entry.id),
  );
}

describe("guided Brush Studio command search", () => {
  it("finds the dedicated authoring workspace with user-facing names", () => {
    for (const query of [
      "목적별 브러시 제작실",
      "브러시 연구실",
      "브러시 제작실",
      "Brush Studio V6",
    ]) {
      expect(ids(query), query).toContain("brush.lab");
    }
  });

  it("finds current-brush editing with the label shown in the Studio menu", () => {
    expect(ids("현재 브러시 세부 설정")).toContain("brush.studio");
  });

  it("keeps the former Brush Studio wording as a searchable alias", () => {
    expect(ids("브러시 스튜디오")).toContain("brush.studio");
  });
});
