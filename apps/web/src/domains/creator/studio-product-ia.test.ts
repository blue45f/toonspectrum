import { describe, expect, it } from "vitest";

import {
  STUDIO_CAPABILITY_REGISTRY,
  STUDIO_DEFAULT_TOOL_GROUPS,
  STUDIO_GLOBAL_NAVIGATION,
  STUDIO_LEGACY_ROUTE_ALIASES,
  STUDIO_PROJECT_NAVIGATION,
  STUDIO_USER_WORK_STATES,
  studioCapabilityById,
  validateStudioProductIa,
} from "./studio-product-ia";
import {
  TOONSTUDIO_PRIMARY_NAVIGATION,
  siteNavigationContextForPath,
} from "@/shared/components/site-navigation";

describe("ToonStudio final product IA", () => {
  it("keeps the bounded navigation and default-tool budgets", () => {
    expect(STUDIO_GLOBAL_NAVIGATION).toHaveLength(4);
    expect(STUDIO_PROJECT_NAVIGATION).toHaveLength(6);
    expect(STUDIO_DEFAULT_TOOL_GROUPS).toHaveLength(9);
    expect(STUDIO_USER_WORK_STATES).toHaveLength(4);
    expect(validateStudioProductIa()).toEqual([]);
  });

  it("keeps the rendered Studio header aligned with the IA contract", () => {
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map(({ id, href }) => ({ id, href }))).toEqual([
      { id: "studio", href: "/studio" },
      { id: "make", href: "/studio/new" },
      { id: "studio-assets", href: "/studio/assets" },
      { id: "learn", href: "/learn" },
    ]);
  });

  it("assigns exactly one primary surface to every capability", () => {
    for (const capability of STUDIO_CAPABILITY_REGISTRY) {
      expect(
        capability.surfaces.filter((surface) => surface.role === "primary"),
        capability.id,
      ).toHaveLength(1);
    }
  });

  it("models one brush library and one brush editor with projections and legacy aliases", () => {
    const library = studioCapabilityById("brush.library");
    const editor = studioCapabilityById("brush.editor");

    expect(library?.surfaces).toContainEqual({ id: "brush-hub", role: "primary" });
    expect(library?.surfaces).toContainEqual({ id: "brush-quick-strip", role: "projection" });
    expect(library?.aliases).toEqual(expect.arrayContaining([
      "빠른 브러시",
      "서브 도구",
      "전체 라이브러리",
      "내 브러시",
    ]));

    expect(editor?.surfaces).toContainEqual({ id: "brush-editor", role: "primary" });
    expect(editor?.surfaces).toContainEqual({ id: "brush-v5-diagnostic", role: "diagnostic" });
    expect(editor?.aliases).toEqual(expect.arrayContaining([
      "브러시 스튜디오",
      "브러시 연구실",
    ]));
  });

  it("keeps user-facing save and collaboration language consequence-based", () => {
    expect(STUDIO_USER_WORK_STATES.map((state) => state.label)).toEqual([
      "저장됨",
      "저장 중",
      "오프라인에서도 안전",
      "확인할 내용이 있어요",
    ]);
  });

  it("separates creation and discovery product contexts", () => {
    expect(siteNavigationContextForPath("/studio")).toBe("studio");
    expect(siteNavigationContextForPath("/studio/canvas")).toBe("studio");
    expect(siteNavigationContextForPath("/market")).toBe("studio");
    expect(siteNavigationContextForPath("/discover")).toBe("spectrum");
    expect(siteNavigationContextForPath("/community")).toBe("spectrum");
  });

  it("keeps legacy aliases unique and directed at canonical destinations", () => {
    expect(new Set(STUDIO_LEGACY_ROUTE_ALIASES.map((route) => route.from)).size)
      .toBe(STUDIO_LEGACY_ROUTE_ALIASES.length);
    expect(STUDIO_LEGACY_ROUTE_ALIASES).toContainEqual({
      from: "/make",
      to: "/studio/new",
    });
    expect(STUDIO_LEGACY_ROUTE_ALIASES).toContainEqual({
      from: "/brush-lab",
      to: "/studio/assets/brushes/new",
    });
  });
});
