// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoutePurposeScene } from "./RoutePurposeScene";
import { SiteRouteExperienceBoundary } from "./SiteRouteExperienceBoundary";

import { resolveSiteRouteExperience } from "@/shared/lib/site-route-experience";
import { resolveSiteRouteVisual } from "@/shared/lib/site-route-visual";

let intersection: (visible: boolean) => void;
let preferenceChanged: () => void;
let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {
      intersection = (visible) => callback(
        [{ isIntersecting: visible } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    observe() { intersection(true); }
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reducedMotion; },
    addEventListener: (_event: string, callback: () => void) => { preferenceChanged = callback; },
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ["routeVisualKind", "routeVisualMotion", "routePurposeScene"]) {
    delete document.documentElement.dataset[key];
  }
});

function scene(pathname: string) {
  return render(
    <RoutePurposeScene
      title="페이지 제목"
      locale="ko"
      experience={resolveSiteRouteExperience(pathname)}
      profile={resolveSiteRouteVisual(pathname)}
    />,
  );
}

describe("route purpose scene", () => {
  it("explains a page through its purpose and three-step visual story", () => {
    const result = scene("/discover");
    const region = screen.getByRole("region", { name: "페이지 제목 화면 안내" });
    expect(region.getAttribute("data-route-visual-kind")).toBe("discover");
    expect(screen.getByText("작품·정보 탐색")).not.toBeNull();
    expect(screen.getByText("작품·소재·정보를 찾아 다음 작업에 활용합니다.")).not.toBeNull();
    expect(result.container.querySelectorAll(".route-purpose-scene__card")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "페이지 모션 일시정지" })).not.toBeNull();
  });

  it("pauses offscreen and through the visible motion control", () => {
    const result = scene("/story-lab");
    const region = result.container.querySelector<HTMLElement>("[data-route-visual-kind]")!;
    expect(region.dataset.routeVisualRunning).toBe("true");
    act(() => intersection(false));
    expect(region.dataset.routeVisualRunning).toBe("false");
    act(() => intersection(true));
    fireEvent.click(screen.getByRole("button", { name: "페이지 모션 일시정지" }));
    expect(region.dataset.routeVisualRunning).toBe("false");
    expect(screen.getByRole("button", { name: "페이지 모션 재생" })).not.toBeNull();
  });

  it("keeps the poster visible until motion video can play", () => {
    const result = scene("/studio/new");
    const video = result.container.querySelector<HTMLVideoElement>("video")!;
    expect(video.dataset.ready).toBe("false");
    fireEvent.canPlay(video);
    expect(video.dataset.ready).toBe("true");
  });

  it("loops only the route-specific film chapter", () => {
    const result = scene("/studio/new");
    const profile = resolveSiteRouteVisual("/studio/new");
    const video = result.container.querySelector<HTMLVideoElement>("video")!;
    video.currentTime = profile.video!.endSeconds;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(profile.video!.startSeconds);
  });

  it("removes video and controls when reduced motion becomes active", () => {
    const result = scene("/studio/new");
    expect(result.container.querySelector("video")).not.toBeNull();
    reducedMotion = true;
    act(() => preferenceChanged());
    expect(result.container.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button", { name: /페이지 모션/u })).toBeNull();
    expect(result.container.querySelector("img")).not.toBeNull();
  });
});

describe("route visual boundary", () => {
  it("mounts public route guidance and exposes route metadata", async () => {
    const result = render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <SiteRouteExperienceBoundary routeTitle="소재 마켓">
          <main>시장 내용</main>
        </SiteRouteExperienceBoundary>
      </MemoryRouter>,
    );
    await waitFor(() => expect(result.container.querySelector('[data-route-visual-kind="assets"]')).not.toBeNull());
    expect(document.documentElement.dataset.routeVisualKind).toBe("assets");
    expect(document.documentElement.dataset.routeVisualMotion).toBe("stack");
    expect(document.documentElement.dataset.routePurposeScene).toBe("true");
    expect(screen.getByText("시장 내용")).not.toBeNull();
  });

  it("lets the visual creator home own the first-screen story without a duplicate guide card", () => {
    const result = render(
      <MemoryRouter initialEntries={["/"]}>
        <SiteRouteExperienceBoundary routeTitle="툰스튜디오">
          <main>홈 히어로</main>
        </SiteRouteExperienceBoundary>
      </MemoryRouter>,
    );
    expect(result.container.querySelector("[data-route-visual-kind]")).toBeNull();
    expect(document.documentElement.dataset.routePurposeScene).toBe("false");
    expect(screen.getByText("홈 히어로")).not.toBeNull();
  });

  it.each(["/studio/canvas", "/studio/bg3d", "/studio/p/demo/d/page-1", "/admin", "/brush-lab"])("does not cover the editor shell at %s", (path) => {
    const result = render(
      <MemoryRouter initialEntries={[path]}>
        <SiteRouteExperienceBoundary routeTitle="편집기">
          <main>편집기 내용</main>
        </SiteRouteExperienceBoundary>
      </MemoryRouter>,
    );
    expect(result.container.querySelector("[data-route-visual-kind]")).toBeNull();
    expect(document.documentElement.dataset.routePurposeScene).toBe("false");
    expect(screen.getByText("편집기 내용")).not.toBeNull();
  });

  it.each([
    ["/studio/new", "create"],
    ["/studio/p/demo/production", "production"],
    ["/studio/manual/getting-started", "learn"],
  ] as const)("explains non-editor Studio route %s", async (path, kind) => {
    const result = render(
      <MemoryRouter initialEntries={[path]}>
        <SiteRouteExperienceBoundary routeTitle="스튜디오 안내">
          <main>스튜디오 내용</main>
        </SiteRouteExperienceBoundary>
      </MemoryRouter>,
    );
    await waitFor(() => expect(result.container.querySelector(`[data-route-visual-kind="${kind}"]`)).not.toBeNull());
  });
});
