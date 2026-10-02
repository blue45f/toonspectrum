// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioManualPage } from "./StudioManualPage";

function renderManual(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/studio/manual" element={<StudioManualPage />} />
        <Route path="/studio/manual/:articleId" element={<StudioManualPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("StudioManualPage", () => {
  it("opens on a help-center home with quick start steps and topic cards", () => {
    renderManual("/studio/manual");

    expect(screen.getByRole("heading", { level: 1, name: "무엇을 도와드릴까요?" })).toBeTruthy();
    const start = screen.getByRole("region", { name: "처음이라면, 한 컷부터." });
    expect(within(start).getAllByRole("link")).toHaveLength(4);
    const topics = screen.getByRole("region", { name: "기능별 매뉴얼" });
    expect(within(topics).getAllByRole("article")).toHaveLength(7);
    expect(within(topics).getByRole("link", { name: /애니 OST·장면 BGM 만들기/u }).getAttribute("href")).toBe("/studio/manual/music-ost");
  });

  it("searches literally, highlights matches and offers suggestions when nothing matches", () => {
    renderManual("/studio/manual");
    const search = screen.getByRole("searchbox", { name: "매뉴얼 검색어" });

    fireEvent.change(search, { target: { value: "지우개" } });
    expect(screen.getByRole("heading", { level: 1, name: "매뉴얼 검색" })).toBeTruthy();
    const results = screen.getByRole("region", { name: "검색 결과" });
    expect(within(results).getAllByText("지우개", { selector: "mark" }).length).toBeGreaterThan(0);

    fireEvent.change(search, { target: { value: "존재하지않는기능" } });
    expect(screen.getByRole("heading", { name: "검색 결과가 없습니다" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "검색 결과" })).getByRole("button", { name: "OST" }));
    expect(search).toHaveProperty("value", "OST");
    const hrefs = within(screen.getByRole("region", { name: "검색 결과" })).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/studio/manual/music-ost");
  });

  it("moves focus to search with the slash key", () => {
    renderManual("/studio/manual");
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "매뉴얼 검색어" }));
  });

  it("renders an article with numbered steps, contents and a tool shortcut", () => {
    renderManual("/studio/manual/music-ost");

    expect(screen.getByRole("heading", { level: 1, name: "애니 OST·장면 BGM 만들기" })).toBeTruthy();
    const toc = screen.getByRole("navigation", { name: "문서 내 목차" });
    expect(within(toc).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#flow", "#import", "#limits"]);
    const flow = screen.getByRole("region", { name: "만드는 순서" });
    expect(within(flow).getAllByRole("listitem")).toHaveLength(6);
    const shortcuts = screen.getAllByRole("link", { name: /OST 만들기 열기/u });
    expect(shortcuts.length).toBeGreaterThanOrEqual(2);
    for (const link of shortcuts) {
      expect(link.getAttribute("href")).toBe("/studio/assets/audio");
      expect(link.getAttribute("target")).toBe("_blank");
    }
    // 화면 도식이 있는 문서에는 장식 일러스트 대신 "화면에서 찾기"를 둔다.
    expect(screen.queryByText("예시 일러스트예요. 실제 화면은 스튜디오에서 확인하세요.")).toBeNull();
    expect(screen.getByRole("navigation", { name: "이전 다음 문서" })).toBeTruthy();
  });

  it("shows where each step happens on a simplified screen map and says it is not a capture", () => {
    renderManual("/studio/manual/music-ost");

    const map = screen.getByRole("figure", { name: "화면에서 찾기 · 애니 OST 만들기" });
    const legend = within(map).getByRole("list");
    expect(within(legend).getAllByRole("listitem")).toHaveLength(4);
    expect(within(legend).getByText("만들 음악 고르기")).toBeTruthy();
    expect(within(map).getByText(/실제 화면을 단순화한 위치 도식/u)).toBeTruthy();

    // 단계마다 같은 번호·이름의 위치 태그가 붙고, 화면 밖에서 하는 단계에는 붙지 않는다.
    const flow = screen.getByRole("region", { name: "만드는 순서" });
    const steps = within(flow).getAllByRole("listitem");
    expect(steps[0]?.textContent).toContain("만들 음악 고르기");
    expect(steps[0]?.querySelector(".manual-screen-badge")?.textContent).toBe("1");
    expect(steps[4]?.textContent).toContain("나의 사운드트랙");
  });

  it("offers a section-level shortcut that opens the exact tool in a new tab", () => {
    renderManual("/studio/manual/music-ost");
    const importLink = screen.getByRole("link", { name: /외부 음원 가져오기 열기/u });
    expect(importLink.getAttribute("href")).toBe("/studio/assets/audio#music-import");
    expect(importLink.getAttribute("target")).toBe("_blank");
    expect(importLink.getAttribute("rel")).toContain("noopener");
    // 섹션 바로가기는 그 섹션 안에 있다.
    expect(importLink.closest("section")?.getAttribute("aria-labelledby")).toBe("import");
  });

  it("shows the editor screen map and a new-work shortcut on the first-steps article", () => {
    renderManual("/studio/manual/getting-started");
    expect(screen.getByRole("figure", { name: /화면에서 찾기 · 스튜디오 편집기/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 작품 만들기/u }).getAttribute("href")).toBe("/studio/new");
  });

  it("explains unknown article addresses", () => {
    renderManual("/studio/manual/not-a-document");
    expect(screen.getByRole("heading", { level: 1, name: "문서를 찾을 수 없습니다" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "매뉴얼 홈으로 돌아가기" }).getAttribute("href")).toBe("/studio/manual");
  });
});
