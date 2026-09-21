// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioAllToolsCatalogSlot } from "./StudioAllToolsCatalogSlot";

const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./studio-all-tools-catalog-loader", () => ({ loadStudioAllToolsCatalog: loader.load }));
afterEach(cleanup);
beforeEach(() => loader.load.mockReset());
const props: ComponentProps<typeof StudioAllToolsCatalogSlot> = {
  definitions: {} as ComponentProps<typeof StudioAllToolsCatalogSlot>["definitions"],
  pinned: ["pen"], query: "", onQuery: vi.fn(), onPin: vi.fn(), onUsed: vi.fn(),
};
function Catalog(value: typeof props) {
  return <input type="search" aria-label="loaded tools" value={value.query} onChange={(event) => value.onQuery(event.currentTarget.value)} />;
}
it("loads on activation, exposes failure and supports explicit retry without mutations", async () => {
  expect(loader.load).not.toHaveBeenCalled();
  loader.load.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ StudioAllToolsCatalog: Catalog });
  render(<StudioAllToolsCatalogSlot {...props} query="스포이드" />);
  expect(screen.getByRole("status").textContent).toContain("불러오는 중");
  expect((await screen.findByRole("alert")).textContent).toContain("원고와 도구 구성은 유지");
  fireEvent.click(screen.getByRole("button", { name: "전체 도구 다시 불러오기" }));
  expect((await screen.findByRole("searchbox")).getAttribute("value")).toBe("스포이드");
  expect(loader.load).toHaveBeenCalledTimes(2);
  expect(props.onPin).not.toHaveBeenCalled(); expect(props.onUsed).not.toHaveBeenCalled();
});

it("ignores a late result after closing instead of restoring hidden controls", async () => {
  let resolve!: (module: { StudioAllToolsCatalog: typeof Catalog }) => void;
  loader.load.mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = render(<StudioAllToolsCatalogSlot {...props} />);
  view.unmount();
  await act(async () => { resolve({ StudioAllToolsCatalog: Catalog }); });
  expect(screen.queryByRole("searchbox")).toBeNull();
});
it("does not steal focus when a user leaves the loading window", async () => {
  let resolve!: (module: { StudioAllToolsCatalog: typeof Catalog }) => void;
  loader.load.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<><button type="button">다른 작업</button><StudioAllToolsCatalogSlot {...props} /></>);
  const outside = screen.getByRole("button", { name: "다른 작업" }); outside.focus();
  await act(async () => { resolve({ StudioAllToolsCatalog: Catalog }); });
  expect(document.activeElement).toBe(outside);
  expect(screen.getByRole("searchbox")).toBeTruthy();
});
