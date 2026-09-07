/**
 * Stable route-facing seam for the Studio production surfaces.
 *
 * The implementation lives in `StudioProductionHubPageV2` so the route import
 * remains unchanged while local/demo/server authority modes evolve behind one
 * explicit boundary.
 */
export { StudioProductionHubPage } from "./StudioProductionHubPageV2";
export type { StudioProductionSurface } from "./StudioProductionHubPageV2";
