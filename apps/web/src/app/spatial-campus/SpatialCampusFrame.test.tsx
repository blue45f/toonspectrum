// @vitest-environment jsdom
import { useEffect, useState } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialCampusFrame } from "./SpatialCampusFrame";
import { campusBinding } from "@/shared/lib/spatial-campus/campus-bindings";
import { CAMPUS_RETURN_KEY } from "@/shared/lib/spatial-campus/campus-return";
import { useCreatorExperienceMode } from "@/shared/lib/creator-experience-mode";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";

const actor = vi.hoisted(() => ({ id: "user-A", ready: true }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: actor.id } }, ready: actor.ready }) }));
vi.mock("./CampusRoom", () => ({ CampusRoom: ({ objects = [] }: { objects?: readonly { title: string }[] }) => <div data-testid="scene">Local world · {objects.map((item) => item.title).join(" · ")}</div> }));
vi.mock("@/shared/components/workspace/WorkspaceChrome", () => ({ WorkspaceBrand: () => <span>Brand</span>, WorkspaceSidebar: () => <aside>Navigation</aside>, WorkspaceAccountAction: () => null }));
vi.mock("@/shared/components/open-search-button", () => ({ OpenSearchButton: () => <button type="button">Search</button> }));
let mounts = 0;
function Draft() {
  const [value, setValue] = useState("");
  useEffect(() => { mounts += 1; }, []);
  return <textarea aria-label="private draft" value={value} onChange={(event) => setValue(event.target.value)} />;
}
function Fixture() {
  const location = useLocation(), navigate = useNavigate();
  const id = location.pathname.startsWith("/studio/") ? "creator-studio-project-document" : "experience-fortune";
  const binding = campusBinding(id, location.pathname, location.search);
  const route = binding?.surface === "room" ? { titleKo: "관측소", titleEn: "Observatory", hintKo: "", hintEn: "" } : null;
  return <><button type="button" onClick={() => navigate("/fortune?content=dream&cast=dark")}>visit fortune</button>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <SpatialCampusFrame binding={binding} route={route}><Draft /></SpatialCampusFrame></>;
}
beforeEach(() => {
  mounts = 0; actor.id = "user-A"; actor.ready = true; sessionStorage.clear();
  useCreatorExperienceMode.setState({ mode: "virtual-studio" });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); sessionStorage.clear(); });
describe("campus state continuity", () => {
  it("changes presentation without remounting inputs or rewriting domain query parameters", async () => {
    render(<MemoryRouter initialEntries={["/fortune?content=dream&cast=dark"]}><Fixture /></MemoryRouter>);
    const input = screen.getByRole("textbox", { name: "private draft" });
    fireEvent.change(input, { target: { value: "개인적인 꿈 기록" } });
    for (const mode of ["업무", "집중", "공간"]) {
      fireEvent.click(screen.getByRole("button", { name: mode }));
      expect(screen.getByRole("textbox", { name: "private draft" })).toBe(input);
      expect((input as HTMLTextAreaElement).value).toBe("개인적인 꿈 기록");
      expect(screen.getByTestId("location").textContent).toBe("/fortune?content=dream&cast=dark");
    }
    await screen.findByTestId("scene");
    expect(mounts).toBe(1);
    expect(sessionStorage.getItem(CAMPUS_RETURN_KEY)).toBeNull();
  });
  it("retains an exact document reference and hides it immediately on account change", async () => {
    const view = render(<MemoryRouter initialEntries={["/studio/p/project-A/d/document-B?pageId=C"]}><Fixture /></MemoryRouter>);
    await waitFor(() => expect(sessionStorage.getItem(CAMPUS_RETURN_KEY)).toContain("document-B"));
    fireEvent.click(screen.getByRole("button", { name: "visit fortune" }));
    expect(screen.getByRole("link", { name: "작업으로 돌아가기" }).getAttribute("href")).toBe("/studio/p/project-A/d/document-B?pageId=C");
    await act(async () => {
      actor.id = "user-B";
      view.rerender(<MemoryRouter initialEntries={["/studio/p/project-A/d/document-B?pageId=C"]}><Fixture /></MemoryRouter>);
    });
    expect(screen.queryByRole("link", { name: "작업으로 돌아가기" })).toBeNull();
    expect(sessionStorage.getItem(CAMPUS_RETURN_KEY)).toBeNull();
  });
  it("has no map, scene, return context or storage writes on a protected invitation", () => {
    render(<MemoryRouter initialEntries={["/fortune?shareToken=private-token"]}><Fixture /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "공간 지도 열기" })).toBeNull();
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(sessionStorage.getItem(CAMPUS_RETURN_KEY)).toBeNull();
  });
  it("supports a native, keyboard-accessible map and restores focus", async () => {
    render(<MemoryRouter initialEntries={["/fortune"]}><Fixture /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "공간 지도 열기" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "창작 세계의 공간 지도" });
    expect(dialog.querySelectorAll(".campus-place")).toHaveLength(9);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await screen.findByTestId("scene");
  });
});
describe("campus domain projection aggregation", () => {
  it("combines multiple public sources inside the current district and rejects private cross-district data", async () => {
    const binding = campusBinding("catalog-search", "/search");
    const route = { titleKo: "이야기 도서관", titleEn: "Story library", hintKo: "", hintEn: "" };
    render(<MemoryRouter initialEntries={["/search"]}>
      <SpatialCampusFrame binding={binding} route={route}>
        <CampusObjectSource objects={[{ id: "story-A", title: "Story A", href: "/title/story-A", kind: "story", exposure: "public" }]} />
        <CampusObjectSource objects={[
          { id: "story-B", title: "Story B", href: "/title/story-B", kind: "story", exposure: "public" },
          { id: "project-A", title: "Private Project", href: "/production/projects/project-A/overview", kind: "project", exposure: "private" },
        ]} />
      </SpatialCampusFrame>
    </MemoryRouter>);
    const scene = await screen.findByTestId("scene");
    await waitFor(() => expect(scene.textContent).toContain("Story A"));
    expect(scene.textContent).toContain("Story B");
    expect(scene.textContent).not.toContain("Private Project");
  });
});
