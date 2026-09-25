import { describe, expect, it } from "vitest";
import { STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { studioBrushDynamicsSettingsForBrushId } from "./studio-brush-dynamics";
import { profileStudioBrushMaterialDistinctness, studioBrushMaterialDistinctnessDistance } from "./studio-brush-material-distinctness";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";

const NEW_IDS = ["material-graphite-contour", "material-broken-chalk", "material-flat-gouache",
  "material-dry-edge-ink", "material-foliage-bough", "material-stitch-ladder", "material-filbert-bristle"];

describe("2026-09-26 신규 재질의 구분 가능성", () => {
  it("추가한 모든 촉은 전체 노출 재질과의 공간·도포 거리 0.1을 넘는다", () => {
    const profiles = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.flatMap((item) => {
      const selection = materializeStudioBrushPackSelection(item.id);
      const dynamics = selection?.brushDynamics ?? studioBrushDynamicsSettingsForBrushId(item.id);
      return dynamics ? [profileStudioBrushMaterialDistinctness({
        catalogId: item.id, runtimeBrushId: selection?.runtimeBrushId ?? item.id,
        defaultWidth: item.defaultWidth, defaultOpacity: item.defaultOpacity, brushDynamics: dynamics,
      })] : [];
    });
    for (const id of NEW_IDS) {
      const profile = profiles.find((candidate) => candidate.catalogId === id);
      expect(profile, `${id}: 제품 카탈로그 누락`).toBeDefined();
      if (!profile) throw new Error(`${id}: 신규 촉 누락`);
      for (const other of profiles) {
        if (other === profile) continue;
        expect(studioBrushMaterialDistinctnessDistance(profile, other), `${id} / ${other.catalogId}`)
          .toBeGreaterThan(0.1);
      }
    }
  });
});
