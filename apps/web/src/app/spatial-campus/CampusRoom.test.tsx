// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { StudioVirtualSpacePhaserCanvasProps } from "@/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas";
import { campusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { CampusRoom } from "./CampusRoom";

vi.mock("@/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas", () => ({
  StudioVirtualSpacePhaserCanvas: ({
    manifest,
    snapshot,
    onInteract,
    onLocalState,
  }: StudioVirtualSpacePhaserCanvasProps) => <div>
    <output data-testid="local-pose">{snapshot.self.x}:{snapshot.self.y}</output>
    <button type="button" onClick={() => onLocalState({ point: { x: 123, y: 456 }, facing: "down", moving: false, zoneId: "assets" })}>Move actor</button>
    <button
      type="button"
      onClick={() => onInteract(manifest.interactions.find((interaction) => interaction.id === "campus-object-0") ?? null)}
    >
      Open first scene object
    </button>
  </div>,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("releases an offscreen scene and resumes its last local pose without exposing identity", async () => {
  let updateVisibility: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof updateVisibility) { updateVisibility = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const view = render(<MemoryRouter><CampusRoom district={campusDistrict("market")} objects={[]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "공용 아틀리에 걷기" }));
  fireEvent.click(await screen.findByRole("button", { name: "Move actor" }));
  const art = view.container.querySelector<HTMLElement>(".campus-room-art")!;
  expect(art.dataset.campusWalkX).toBe("123.000");
  expect(art.dataset.campusWalkY).toBe("456.000");
  expect(Object.keys(art.dataset).sort()).toEqual(["campusWalkX", "campusWalkY"]);
  act(() => updateVisibility?.([{ isIntersecting: false }]));
  expect(screen.queryByTestId("local-pose")).toBeNull();
  act(() => updateVisibility?.([{ isIntersecting: true }]));
  expect((await screen.findByTestId("local-pose")).textContent).toBe("123:456");
  view.unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

it("opens a verified live domain object from an authored Phaser interaction slot", async () => {
  render(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <CampusRoom
        district={campusDistrict("market")}
        objects={[
          {
            id: "asset-A",
            title: "브러시 A",
            href: "/market/resource/asset-A",
            kind: "market-resource",
          },
        ]}
      />
      <LocationProbe />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("button", { name: "공용 아틀리에 걷기" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open first scene object" }));

  expect(screen.getByTestId("location").textContent).toBe("/market/resource/asset-A");
});

it("keeps the walking pose across equivalent projections and applies a real object update without leaving the room", async () => {
  const district = campusDistrict("market");
  const first = {
    id: "asset-A",
    title: "브러시 A",
    href: "/market/resource/asset-A",
    kind: "market-resource" as const,
  };
  const view = render(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <CampusRoom district={district} objects={[first]} />
      <LocationProbe />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("button", { name: "공용 아틀리에 걷기" }));
  fireEvent.click(await screen.findByRole("button", { name: "Move actor" }));
  const art = view.container.querySelector<HTMLElement>(".campus-room-art")!;
  expect(art.dataset.campusWalkX).toBe("123.000");
  expect(art.dataset.campusWalkY).toBe("456.000");

  view.rerender(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <CampusRoom district={district} objects={[{ ...first }]} />
      <LocationProbe />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "걷기 멈추기" })).toBeTruthy();
  expect(art.dataset.campusWalkX).toBe("123.000");
  expect(art.dataset.campusWalkY).toBe("456.000");

  const updated = {
    ...first,
    title: "브러시 A · 업데이트",
    href: "/market/resource/asset-A-v2",
  };
  view.rerender(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <CampusRoom district={district} objects={[updated]} />
      <LocationProbe />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("button", { name: "걷기 멈추기" })).toBeTruthy();
  expect(screen.getByTestId("local-pose").textContent).toBe("123:456");

  fireEvent.click(screen.getByRole("button", { name: "Open first scene object" }));
  expect(screen.getByTestId("location").textContent).toBe("/market/resource/asset-A-v2");
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
