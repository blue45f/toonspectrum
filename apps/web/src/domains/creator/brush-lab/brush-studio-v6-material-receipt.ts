import { brushStudioV6ActiveNodes, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig, type BrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE, type BrushStudioV6LicenseProfile } from "./brush-studio-v6-license-profile";
import { planBrushStudioV6ProviderRuntime } from "./brush-studio-v6-provider-runtime";

/** One receipt builder for product save, authoring transfer and import verification. */
export function createBrushStudioV6MaterialReceipt(
  program: BrushStudioV6Program,
  licenseProfile: BrushStudioV6LicenseProfile = program.licenseProfile ?? BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
): Extract<BrushStudioV6MaterialConfig, { version: 2 }> {
  const material = normalizeBrushStudioV6MaterialConfig(program);
  if (!material) throw new Error("브러시 재질 설정을 읽을 수 없어요.");
  const plan = planBrushStudioV6ProviderRuntime(brushStudioV6ActiveNodes(program), licenseProfile);
  if (!plan.valid) throw new Error(`현재 재료 엔진에서 실행할 수 없어요: ${plan.blockedNodeIds.join(", ")}`);
  const result = normalizeBrushStudioV6MaterialConfig({
    ...material, version: 2,
    runtime: { version: 1, fallbackPolicy: "none", licenseProfile: plan.licenseProfile,
      bindings: plan.bindings.map(({ providerId, version, license, rights, execution, nodeIds }) =>
        ({ providerId, version, license, rights, execution, nodeIds })),
    },
  });
  if (!result || result.version !== 2) throw new Error("브러시 실행 정보를 구성하지 못했어요.");
  return result;
}
