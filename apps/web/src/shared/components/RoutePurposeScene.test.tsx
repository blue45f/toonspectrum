// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoutePurposeScene } from "./RoutePurposeScene";
import { SiteRouteExperienceBoundary } from "./SiteRouteExperienceBoundary";

import { resolveSiteRouteExperience } from "@/shared/lib/site-route-experience";
import { resolveSiteRouteVisual } from "@/shared/lib/site-route-visual";
import { useTheme } from "@/shared/lib/theme";

let intersection: (visible: boolean) => void;
let preferenceChanged: () => void;
let reducedMotion = false;
const originalTheme = useTheme.getState().resolvedTheme;

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
  useTheme.setState({ resolvedTheme: originalTheme });
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
  it("starlight 안내 아트가 실패하면 기존 시각 프로필로 복구한다", () => {
    useTheme.setState({ resolvedTheme: "starlight" });
    const path = "/studio/manual/getting-started";
    const result = scene(path);
    const artwork = result.container.querySelector("img");
    expect(artwork?.getAttribute("src")).toBe("/brand/workflow-20260928/learn-640.webp");
    if (!artwork) throw new Error("페이지 안내 아트가 없습니다.");
    fireEvent.error(artwork);
    expect(artwork.getAttribute("src")).toBe(resolveSiteRouteVisual(path).image);
    expect(result.container.querySelector('[data-route-visual-kind="learn"]')).not.toBeNull();
  });

  it.each(["aurora", "blossom", "dark", "light", "graphite", "midnight", "sepia", "contrast"] as const)("%s 안내 아트는 기존 프로필을 따른다", (theme) => {
    useTheme.setState({ resolvedTheme: theme });
    const result = scene("/discover");
    expect(result.container.querySelector("img")?.getAttribute("src")).toBe(resolveSiteRouteVisual("/discover").image);
  });

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
  it("공개 마켓의 메타데이터는 유지하고 자체 표제 앞에 공통 안내를 쌓지 않는다", async () => {
    const result = render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <SiteRouteExperienceBoundary routeTitle="소재 마켓">
          <main>시장 내용</main>
        </SiteRouteExperienceBoundary>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(document.documentElement.dataset.routeVisualKind).toBe("assets");
    });
    expect(document.documentElement.dataset.routeVisualKind).toBe("assets");
    expect(document.documentElement.dataset.routeVisualMotion).toBe("stack");
    expect(document.documentElement.dataset.routePurposeScene).toBe("false");
    expect(result.container.querySelector('[data-route-visual-kind="assets"]')).toBeNull();
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
    ["/studio/new", "create", false],
    ["/studio/p/demo/production", "production", false],
    ["/studio/manual/getting-started", "learn", true],
  ] as const)("keeps metadata and respects compact task ownership at %s", async (path, kind, guided) => {
    const result = render(
      <MemoryRouter initialEntries={[path]}>
        <SiteRouteExperienceBoundary routeTitle="스튜디오 안내">
          <main>스튜디오 내용</main>
        </SiteRouteExperienceBoundary>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(document.documentElement.dataset.routeVisualKind).toBe(kind);
      expect(document.documentElement.dataset.routePurposeScene).toBe(String(guided));
      expect(Boolean(result.container.querySelector(`[data-route-visual-kind="${kind}"]`))).toBe(guided);
      expect(screen.getByText("스튜디오 내용")).not.toBeNull();
    });
  });
});
