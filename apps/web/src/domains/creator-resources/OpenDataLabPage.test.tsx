// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { OpenDataLabPage } from "./OpenDataLabPage";

function mount() {
  return render(
    <MemoryRouter initialEntries={["/research/open-data"]}>
      <OpenDataLabPage />
    </MemoryRouter>,
  );
}

describe("OpenDataLabPage", () => {
  it("exposes all domestic and international creation workflows", () => {
    mount();
    expect(screen.getByRole("heading", { name: "공개 데이터 창작실" })).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "검색 도구 열기" })).toHaveLength(14);
    expect(screen.getAllByText(/국가유산청/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/NEIS/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TourAPI/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/표준국어대사전/u).length).toBeGreaterThan(0);
  });

  it("keeps direct import narrower than reference previews", () => {
    mount();
    expect(screen.getByText(/Studio 직접 가져오기는 CC0가 확인된 ambientCG에만 허용/u)).toBeTruthy();
    expect(screen.getByText(/NASA·V&A는 안전한 미리보기를 레퍼런스 전용/u)).toBeTruthy();
  });
});
