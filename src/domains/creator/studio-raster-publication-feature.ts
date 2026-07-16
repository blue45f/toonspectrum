/**
 * Automatic raster publication stays fail-closed until the replay surface has completed its
 * verified renderer handoff. An environment token alone can never turn a parallel, non-visible log
 * into production authority.
 */
import { STUDIO_RASTER_ASSET_ADMISSION_OPT_IN_TOKEN } from "@/lib/studio-raster-asset-admission";

export const STUDIO_RASTER_PUBLICATION_EXPERIMENT_TOKEN =
  STUDIO_RASTER_ASSET_ADMISSION_OPT_IN_TOKEN;

// Flip only in the same change that mounts and verifies the authoritative replay surface.
export const STUDIO_RASTER_VERIFIED_RENDERER_HANDOFF_MOUNTED = false;

export function isStudioAutomaticRasterPublicationEnabled(input: {
  readonly experimentToken: string | undefined;
  readonly rendererHandoffMounted: boolean;
}): boolean {
  return input.rendererHandoffMounted &&
    input.experimentToken === STUDIO_RASTER_PUBLICATION_EXPERIMENT_TOKEN;
}

export const STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED =
  isStudioAutomaticRasterPublicationEnabled({
    experimentToken: import.meta.env.VITE_STUDIO_RASTER_CRDT_AUTO_PUBLICATION,
    rendererHandoffMounted: STUDIO_RASTER_VERIFIED_RENDERER_HANDOFF_MOUNTED,
  });
