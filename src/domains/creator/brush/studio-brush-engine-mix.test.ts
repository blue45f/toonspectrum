import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsSettingsForBrushId,
  studioDryMediaKernelDabProgramPin,
} from "./studio-brush-dynamics";
import {
  describeStudioBrushEngineStack,
  isStudioBrushMixTraitSectionId,
  mergeStudioBrushMixTraitSection,
  STUDIO_BRUSH_MIX_TRAIT_SECTIONS,
  suggestStudioBrushMixName,
} from "./studio-brush-engine-mix";
import {
  studioBrushEngineProgramSetFromOil,
  studioOilProgramSetForBrush,
} from "./studio-brush-engine-program-set";

const dryMediaBase = studioBrushDynamicsSettingsForBrushId("dry-media");
const crayon = studioBrushDynamicsSettingsForBrushId("crayon");
const airbrush = studioBrushDynamicsSettingsForBrushId("airbrush");

// 선택 변주 시임(selection variant seam)은 카탈로그 선택 시점에 커널 핀을 민팅하므로,
// 순수 로직 테스트에서는 동일 핀을 직접 부착한 정규 설정을 베이스로 쓴다.
const dryMedia = dryMediaBase
  ? normalizeStudioBrushDynamicsSettings({
      ...dryMediaBase,
      dryMediaKernelProgram: studioDryMediaKernelDabProgramPin(),
    })
  : null;

describe("studio brush engine mix trait sections", () => {
  it("exposes the four mixable sections", () => {
    expect(STUDIO_BRUSH_MIX_TRAIT_SECTIONS.map((section) => section.id)).toEqual([
      "tip",
      "dual-tip",
      "grain",
      "response",
    ]);
    expect(isStudioBrushMixTraitSectionId("tip")).toBe(true);
    expect(isStudioBrushMixTraitSectionId("carrier")).toBe(false);
  });
});

describe("mergeStudioBrushMixTraitSection", () => {
  it("replaces only the tip section and keeps carrier identity fields", () => {
    expect(dryMedia && airbrush).toBeTruthy();
    const merged = mergeStudioBrushMixTraitSection("tip", dryMedia!, airbrush!);
    expect(merged.tip).toEqual(airbrush!.tip);
    expect(merged.grain).toEqual(dryMedia!.grain);
    expect(merged.seed).toBe(dryMedia!.seed);
    expect(merged.depositPipeline).toBe(dryMedia!.depositPipeline);
    expect(merged.presetId).toBe(dryMedia!.presetId);
    // 캐리어 핀은 소스에서 복사하지 않는다 — 에어브러시의 폴오프 핀이 드라이 미디어에 얹히면 안 된다.
    expect(merged.softFalloffLinearProgram).toBeUndefined();
  });

  it("copies tip layers and dual brush for the dual-tip section", () => {
    const merged = mergeStudioBrushMixTraitSection("dual-tip", dryMedia!, crayon ?? dryMedia!);
    if (crayon) {
      expect(merged.tipLayers).toEqual(crayon.tipLayers);
      expect(merged.dualBrush).toEqual(crayon.dualBrush);
    } else {
      expect(merged.tipLayers).toEqual([]);
    }
    expect(merged.tip).toEqual(dryMedia!.tip);
  });

  it("replaces response channels wholesale while leaving the tip untouched", () => {
    const merged = mergeStudioBrushMixTraitSection("response", dryMedia!, airbrush!);
    expect(merged.width).toEqual(airbrush!.width);
    expect(merged.flow).toEqual(airbrush!.flow);
    expect(merged.taper).toEqual(airbrush!.taper);
    expect(merged.tip).toEqual(dryMedia!.tip);
  });

  it("keeps grain and color dynamics together in the grain section", () => {
    const merged = mergeStudioBrushMixTraitSection("grain", airbrush!, dryMedia!);
    expect(merged.grain).toEqual(dryMedia!.grain);
    expect(merged.colorDynamics).toEqual(dryMedia!.colorDynamics);
    expect(merged.width).toEqual(airbrush!.width);
  });
});

describe("describeStudioBrushEngineStack", () => {
  it("always names the carrier first", () => {
    const stack = describeStudioBrushEngineStack("pen", dryMedia!, null);
    expect(stack[0]).toMatchObject({ id: "carrier", active: true });
    expect(stack.some((entry) => entry.id.startsWith("oil-"))).toBe(false);
  });

  it("lists oil programs with engine program overrides winning over the baseline", () => {
    const baseline = studioOilProgramSetForBrush("oil--filbert-ribbon");
    expect(baseline.bristlePhysics).toBe(true);
    const stack = describeStudioBrushEngineStack(
      "oil--filbert-ribbon",
      dryMedia!,
      studioBrushEngineProgramSetFromOil({
        bristlePhysics: false,
        bristleLoadDynamics: false,
        impastoRelief: true,
      }),
    );
    const byId = new Map(stack.map((entry) => [entry.id, entry]));
    expect(byId.get("oil-bristlePhysics")?.active).toBe(false);
    expect(byId.get("oil-impastoRelief")?.active).toBe(true);
  });

  it("surfaces carrier program pins recorded on the settings", () => {
    const stack = describeStudioBrushEngineStack("dry-media", dryMedia!, null);
    expect(stack.some((entry) => entry.id === "dry-media-kernel" && entry.active)).toBe(true);
  });
});

describe("suggestStudioBrushMixName", () => {
  it("appends the combination suffix to a trimmed base name", () => {
    expect(suggestStudioBrushMixName(" 크레용 ")).toBe("크레용 조합");
    expect(suggestStudioBrushMixName("  ")).toBe("커스텀 브러시 조합");
  });
});
