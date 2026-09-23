// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { campusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { CampusRoom } from "./CampusRoom";

afterEach(cleanup);

it("keeps the public atelier static and exposes direct actions without walking controls", () => {
  const view = render(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <CampusRoom district={campusDistrict("market")} objects={[]} />
    </MemoryRouter>,
  );

  const artwork = view.container.querySelector<HTMLImageElement>(".campus-room-art > img");
  expect(artwork?.getAttribute("src")).toBe("/assets/studio/backgrounds/webtoon_street.png");
  expect(view.container.querySelector("canvas")).toBeNull();
  expect(screen.queryByRole("button", { name: /공용 아틀리에 걷기|걷기 멈추기/u })).toBeNull();

  const current = screen.getByRole("link", { name: "소재 진열대" });
  expect(current.getAttribute("href")).toBe("/market/browse");
  expect(current.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "체험 공방" }).getAttribute("href")).toBe("/market/fit");
});

it("keeps every direct action available when the artwork fails", () => {
  const view = render(
    <MemoryRouter>
      <CampusRoom district={campusDistrict("academy")} objects={[]} />
    </MemoryRouter>,
  );
  const artwork = view.container.querySelector<HTMLImageElement>(".campus-room-art > img");
  expect(artwork).not.toBeNull();

  fireEvent.error(artwork!);

  expect(screen.getByRole("status").textContent).toContain("그림 없이도 아래 기능을 사용할 수 있어요.");
  expect(screen.getByRole("link", { name: "배움터" }).getAttribute("href")).toBe("/learn");
  expect(screen.getByRole("link", { name: "개인 AI 실험실" }).getAttribute("href")).toBe("/studio/ai-lab");
});

it("gives scene object links contextual accessible names without colliding with domain cards", () => {
  render(<MemoryRouter><CampusRoom district={campusDistrict("gallery")} objects={[
    { id: "public-work", title: "첫 웹툰을 소개합니다", href: "/community/promote/public-work", exposure: "public" },
    { id: "private-review", title: "검수 결과", href: "/studio/p/project/review", exposure: "private" },
  ]} /></MemoryRouter>);

  expect(screen.getByRole("link", { name: "첫 웹툰을 소개합니다 · 공간에서 보기" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "검수 결과 · 공간에서 보기 · 내 화면에서만" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "첫 웹툰을 소개합니다" })).toBeNull();
});

it("limits direct scene objects to the six-item public card budget", () => {
  render(<MemoryRouter><CampusRoom district={campusDistrict("gallery")} objects={Array.from(
    { length: 7 },
    (_, index) => ({
      id: `work-${index}`,
      title: `작품 ${index}`,
      href: `/showcase/work-${index}`,
      exposure: "public" as const,
    }),
  )} /></MemoryRouter>);

  expect(screen.getAllByRole("link", { name: /작품 \d · 공간에서 보기/u })).toHaveLength(6);
  expect(screen.queryByRole("link", { name: "작품 6 · 공간에서 보기" })).toBeNull();
});
