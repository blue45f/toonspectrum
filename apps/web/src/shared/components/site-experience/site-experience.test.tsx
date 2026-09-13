// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

import { SiteExperienceFrame } from "./SiteExperienceFrame";
import { SiteNextSteps } from "./SiteNextSteps";
import { SiteConnectionNotice } from "./SiteConnectionNotice";
import { EXPERIENCE_MODE_KEY } from "./site-experience-model";
import { PublicSiteJourney } from "../public-site-journey";
import { RouteScrollRestoration } from "@/app/RouteScrollRestoration";

vi.mock("@/shared/lib/i18n", () => ({ useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }) }));
vi.mock("@/domains/creator/studio-workspace-route", () => ({
  isStudioRoutePathname: (path: string) => path === "/studio" || path.startsWith("/studio/"),
  shouldPreserveStudioRouteLifecycle: () => true,
}));

beforeEach(() => {
  localStorage.clear();
  if (!HTMLElement.prototype.scrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: () => undefined, configurable: true, writable: true });
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function frame(path = "/calendar") {
  return render(<MemoryRouter initialEntries={[path]}><SiteExperienceFrame enabled>
    <PublicSiteJourney pathname={path} locale="ko" /><SiteNextSteps /><SiteConnectionNotice />
  </SiteExperienceFrame></MemoryRouter>);
}

describe("non-studio experience controls", () => {
  it("toggles the actual context, persists it, and restores it on remount", () => {
    const first = frame();
    const buttons = screen.getAllByRole("button", { name: "차분한 화면" });
    fireEvent.click(buttons[0]);
    expect(first.container.querySelector('[data-site-experience="calm"]')).not.toBeNull();
    expect(localStorage.getItem(EXPERIENCE_MODE_KEY)).toBe("calm");
    expect(buttons.every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    first.unmount();
    expect(frame().container.querySelector('[data-site-experience="calm"]')).not.toBeNull();
  });
  it("keeps the current session usable when writes throw", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    const result = frame();
    fireEvent.click(screen.getAllByRole("button", { name: "차분한 화면" })[0]);
    expect(result.container.querySelector('[data-site-experience="calm"]')).not.toBeNull();
  });
  it("mounts no wrapper or storage effects on disabled editor surfaces", () => {
    const access = vi.spyOn(Storage.prototype, "getItem");
    const result = render(<SiteExperienceFrame enabled={false}><p>editor child</p></SiteExperienceFrame>);
    expect(result.container.querySelector("[data-site-experience]")).toBeNull();
    expect(screen.getByText("editor child")).not.toBeNull();
    expect(access).not.toHaveBeenCalled();
  });
  it("marks the correct creation phase and limits next actions to known public destinations", () => {
    frame("/community");
    expect(screen.getByRole("link", { name: /작품 나누기/ }).getAttribute("aria-current")).toBe("step");
    const next = screen.getByRole("navigation", { name: "다음 활동 추천" });
    expect(Array.from(next.querySelectorAll("a")).map((link) => link.getAttribute("href"))).toEqual(["/discover", "/learn", "/market"]);
  });
  it("does not render next-activity promotions in a purchase or publication flow", () => {
    frame("/market/publish");
    expect(screen.queryByRole("navigation", { name: "다음 활동 추천" })).toBeNull();
  });
  it("announces offline and online changes without reloading the document", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    frame();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status").textContent).toMatch(/연결/);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

function NavigationHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><RouteScrollRestoration /><main id="main-content" tabIndex={-1}>
    <p>{location.pathname}</p>
    <button type="button" onClick={() => navigate("/research")}>forward</button>
    <button type="button" onClick={() => navigate(-1)}>back</button>
    <button type="button" onClick={() => navigate("?q=한글")}>filter</button>
  </main></>;
}

describe("history restoration", () => {
  it("restores POP position but does not reset same-page filters", () => {
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(5000);
    vi.spyOn(window, "scrollTo").mockImplementation((options?: ScrollToOptions | number) => { if (options && typeof options === "object") y = options.top ?? 0; });
    render(<MemoryRouter initialEntries={["/calendar"]}><NavigationHarness /></MemoryRouter>);
    y = 640; fireEvent.scroll(window);
    fireEvent.click(screen.getByRole("button", { name: "forward" }));
    expect(y).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(y).toBe(640);
    fireEvent.click(screen.getByRole("button", { name: "filter" }));
    expect(y).toBe(640);
  });
});
