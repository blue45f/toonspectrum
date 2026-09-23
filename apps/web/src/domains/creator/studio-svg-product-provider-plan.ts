import {
  ThorvgAssetRejectedError,
  auditThorvgSvg,
  selectThorvgBackend,
  thorvgProviderId,
  type ThorvgBackend,
  type ThorvgSvgAudit,
} from "@toonspectrum/studio-engine-thorvg/audit";

import { STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID } from "./studio-svg-vello-product-router";

export type StudioSvgProductProviderPlan =
  | {
      readonly route: "vello-native";
      readonly providerId: typeof STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID;
      readonly audit: ThorvgSvgAudit;
    }
  | {
      readonly route: "thorvg-specialist";
      readonly providerId: ReturnType<typeof thorvgProviderId>;
      readonly backend: ThorvgBackend;
      readonly audit: ThorvgSvgAudit;
    }
  | {
      readonly route: "rejected";
      readonly providerId: "rejected";
      readonly reason: string;
    };

/**
 * Chooses one renderer before either engine is initialized. This is capability planning, not a
 * render-time fallback: a failed selected provider stays failed for the request lifetime.
 */
export function planStudioSvgProductProvider(
  svg: string,
  width: number,
  height: number,
  capability: { readonly webgpu: boolean; readonly webgl2?: boolean },
): StudioSvgProductProviderPlan {
  try {
    const audit = auditThorvgSvg(svg, width, height);
    if (!audit.requiresThorvg) {
      return Object.freeze({
        route: "vello-native" as const,
        providerId: STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID,
        audit,
      });
    }
    const backend = selectThorvgBackend(capability);
    return Object.freeze({
      route: "thorvg-specialist" as const,
      providerId: thorvgProviderId(backend),
      backend,
      audit,
    });
  } catch (error) {
    const reason = error instanceof ThorvgAssetRejectedError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
    return Object.freeze({
      route: "rejected" as const,
      providerId: "rejected" as const,
      reason,
    });
  }
}
