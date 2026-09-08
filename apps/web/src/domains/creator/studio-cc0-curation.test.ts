import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  curateStudioCc0Selection,
  getStudioCc0ReviewStatus,
  isStudioCc0AssemblyComponent,
  isStudioCc0EligibleForNewSelection,
  isStudioCc0Quarantined,
  studioCc0ReviewLabel,
  studioCc0StyleLabel,
} from "./studio-cc0-curation";

import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";

function asset(id: string, provider = "Kenney", kind: StudioCc0Asset["kind"] = "model"): StudioCc0Asset {
  return Object.freeze({id, provider, kind, name: id, category: "furniture",
    path: `assets/${id}.${kind === "model" ? "glb" : "webp"}`, bytes: 100,
    sha256: "a".repeat(64), browserRenderVerified: true, sourceUrl: "https://kenney.nl/assets/furniture-kit",
    visualReviewed: true, visualReviewLevel: "contact-sheet-visual-triage",
    visualReviewSource: "review-01.pdf#page=1", curationStatus: "selected-after-visual-triage"});
}

describe("visually reviewed CC0 selection", () => {
  it("quarantines the visibly broken glass even from a stale cached catalog", () => {
    const broken = asset("kenney-food-glass-wine");
    expect(isStudioCc0Quarantined(broken)).toBe(true);
    expect(curateStudioCc0Selection([broken], {includeComponents: true})).toEqual([]);
    expect(isStudioCc0Quarantined(asset("kenney-food-glass"))).toBe(false);
  });
  it.each([
    "kenney-building-wall", "kenney-furniture-wall-doorway", "kenney-furniture-floor-full",
    "kenney-nature-ground-grass", "kenney-nature-cliff-stone", "kenney-roads-road-straight",
    "kenney-suburban-driveway", "polyhaven-modular-street-seating",
  ])("separates assembly component %s without deleting it", id => {
    const item = asset(id);
    expect(isStudioCc0AssemblyComponent(item)).toBe(true);
    expect(curateStudioCc0Selection([item])).toEqual([]);
    expect(curateStudioCc0Selection([item], {includeComponents: true})).toEqual([item]);
  });
  it.each([
    "kenney-furniture-chair", "kenney-nature-tree-pine", "kenney-food-apple",
    "kenney-roads-traffic-light", "kenney-survival-tent", "polyhaven-modern-arm-chair-01",
  ])("does not misclassify finished prop %s", id => {
    expect(isStudioCc0AssemblyComponent(asset(id))).toBe(false);
  });
  it("prioritizes detailed originals without mutating source order or asset identity", () => {
    const stylized = asset("kenney-furniture-chair");
    const detailed = asset("polyhaven-modern-arm-chair-01", "Poly Haven");
    const source = Object.freeze([stylized, detailed]);
    const selected = curateStudioCc0Selection(source);
    expect(source).toEqual([stylized, detailed]);
    expect(selected).toEqual([detailed, stylized]);
    expect(selected[0]).toBe(detailed);
  });
  it.each(["quarantine", "quarantined", "quarantine-from-new-selection", "rejected", "failed", "retired", "legacy-reference-not-wearable"])("blocks explicit %s decisions even with visual flags and detailed style", curationStatus => {
    const item = {...asset("polyhaven-reviewed-chair", "Poly Haven"), curationStatus};
    expect(getStudioCc0ReviewStatus(item)).toBe("excluded");
    expect(isStudioCc0EligibleForNewSelection(item)).toBe(false);
    expect(curateStudioCc0Selection([item], {includeComponents: true, style: "detailed"})).toEqual([]);
  });
  it("honors explicit legacy and component roles independent of filename prefixes", () => {
    const legacy = {...asset("custom-outfit"), role: "legacy-reference-not-wearable"};
    const component = {...asset("custom-panel"), role: "assembly-component"};
    expect(curateStudioCc0Selection([legacy, component])).toEqual([]);
    expect(curateStudioCc0Selection([legacy, component], {includeComponents: true})).toEqual([component]);
  });
  it.each([
    {visualReviewed: undefined}, {visualReviewed: false}, {visualReviewLevel: undefined},
    {visualReviewLevel: "multi-view-premium-approved"}, {visualReviewSource: undefined},
    {visualReviewSource: "   "}, {curationStatus: undefined}, {curationStatus: "unreviewed"},
  ])("does not promote incomplete or unknown review evidence: %j", metadata => {
    const item = {...asset("polyhaven-unreviewed-chair", "Poly Haven"), ...metadata};
    expect(getStudioCc0ReviewStatus(item)).toBe("unreviewed");
    expect(studioCc0ReviewLabel(item)).toBe("시각 검수 전");
    expect(curateStudioCc0Selection([item], {includeComponents: true})).toEqual([]);
  });
  it("keeps technical rendering, contact-sheet review and artistic approval distinct", () => {
    const reviewed = asset("kenney-chair");
    expect(getStudioCc0ReviewStatus(reviewed)).toBe("contact-sheet-reviewed");
    expect(studioCc0ReviewLabel(reviewed)).toBe("미리보기 검수");
    expect(curateStudioCc0Selection([{...reviewed, browserRenderVerified: false}])).toEqual([]);
    expect(getStudioCc0ReviewStatus({...reviewed, visualReviewLevel: "unknown", allAnglesArtisticallyApproved: true})).toBe("unreviewed");
    expect(curateStudioCc0Selection([reviewed])).toEqual([reviewed]);
  });
  it("preserves image selection when legacy image metadata lacks a visual review", () => {
    const image = {...asset("kenney-smoke", "Kenney", "effect-mask"), visualReviewed: undefined, curationStatus: undefined};
    expect(getStudioCc0ReviewStatus(image)).toBe("unreviewed");
    expect(curateStudioCc0Selection([image])).toEqual([image]);
  });
  it("uses explicit style independently of supplier without granting review approval", () => {
    const detailed = {...asset("kenney-detailed-chair"), style: "photorealistic-pbr"};
    const stylized = {...asset("polyhaven-stylized-chair", "Poly Haven"), style: "stylized-low-poly"};
    expect(studioCc0StyleLabel(detailed)).toBe("디테일 PBR");
    expect(studioCc0StyleLabel(stylized)).toContain("로우폴리");
    expect(curateStudioCc0Selection([stylized, detailed], {style: "detailed"})).toEqual([detailed]);
    expect(curateStudioCc0Selection([{...detailed, visualReviewed: false}], {style: "detailed"})).toEqual([]);
  });
  it("distinguishes PBR detail, stylized geometry, and image materials", () => {
    const detailed = asset("polyhaven-chair", "Poly Haven");
    const texture = asset("polyhaven-wood", "Poly Haven", "surface-texture");
    const stylized = asset("kenney-chair");
    const effect = asset("kenney-smoke", "Kenney", "effect-mask");
    expect(curateStudioCc0Selection([detailed, texture, stylized, effect], {style: "detailed"})).toEqual([detailed, texture]);
    expect(curateStudioCc0Selection([detailed, texture, stylized, effect], {style: "stylized"})).toEqual([stylized]);
    expect(studioCc0StyleLabel(detailed)).toBe("디테일 PBR");
    expect(studioCc0StyleLabel(stylized)).toContain("로우폴리");
    expect(studioCc0StyleLabel(texture)).toBe("원본 표면 재질");
    expect(studioCc0StyleLabel(effect)).toBe("투명 효과");
  });
  it("retains explicit enlargement, contrast, focus and success-only dismissal contracts", () => {
    const source = readFileSync(new URL("./StudioCc0AssetLibraryPanel.tsx", import.meta.url), "utf8");
    expect(source).toContain("useStudioModalSheet");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("if (added) setPreview(null)");
    expect(source).toContain("bg-slate-600");
    expect(source).toContain("조립부품 포함");
  });
});
