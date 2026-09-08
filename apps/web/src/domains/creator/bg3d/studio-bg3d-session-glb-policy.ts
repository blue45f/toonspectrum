import { getStudio3dAssetQualityMode } from "../studio-3d-asset-quality-session";

import {
  deriveStudioBg3dGlbValidationPolicy as deriveBaseGlbValidationPolicy,
} from "./studio-bg3d-device-quality";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } from "./studio-bg3d-glb-validation";

export const STUDIO_BG3D_HIGH_ASSET_TEXTURE_BYTES = 256 * 1024 * 1024;

/** Session opt-in changes only the default mobile texture allowance, not renderer quality. */
export function deriveStudioBg3dSessionGlbValidationPolicy(
  ...args: Parameters<typeof deriveBaseGlbValidationPolicy>
): ReturnType<typeof deriveBaseGlbValidationPolicy> {
  const policy = deriveBaseGlbValidationPolicy(...args);
  const mobile = policy.budgets.mobile;
  if (
    getStudio3dAssetQualityMode() !== "high"
    || policy.profile !== "mobile"
    || mobile.textures.maxTotalBytes
      !== DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES.mobile.textures.maxTotalBytes
  ) return policy;

  return {
    ...policy,
    budgets: {
      ...policy.budgets,
      mobile: {
        ...mobile,
        textures: {
          ...mobile.textures,
          maxTotalBytes: Math.min(
            STUDIO_BG3D_HIGH_ASSET_TEXTURE_BYTES,
            args[0].budgets.textures.maxTotalBytes,
          ),
        },
      },
    },
  };
}
