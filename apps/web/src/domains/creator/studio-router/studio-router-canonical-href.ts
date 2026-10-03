import type {
  StudioInvalidRouteResolution,
  StudioRouteResolution,
} from "./studio-route-manifest";

/**
 * The href the router actually mounts for a resolution.
 *
 * `/studio` is the product front door now. Keep the legacy workspace parser compatible,
 * while mounting an identity-free draft editor at its explicit, non-conflicting URL:
 * an editor resolution for the identity-free canvas draft (no work id, no remix
 * source) resolves to `/studio/canvas` with the current search string instead of the
 * manifest canonical href. Every other resolution uses its canonical href as-is.
 *
 * The `invalid` resolution is excluded: the router renders the failure surface for
 * it before canonical comparison, and it carries no canonical href.
 */
export function resolveStudioRouterCanonicalHref(
  resolution: Exclude<StudioRouteResolution, StudioInvalidRouteResolution>,
  search: string,
): string {
  return resolution.kind === "editor"
    && resolution.workspaceRoute.surface === "canvas"
    && resolution.workspaceRoute.workId === null
    && resolution.workspaceRoute.remixSourceWorkId === null
    ? `/studio/canvas${search}`
    : resolution.canonicalHref;
}
