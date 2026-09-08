import { classifyStudioDryMediaCatalogIdV1 } from "../brush/studio-dry-media-anisotropic-grain-v1";
import { studioCanonicalDryMediaEligibilityFailure } from "../studio-canonical-vnext-dry-media-eligibility";

import type { NormalizedStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics-types";
import type { StudioDryMediaAnisotropicPresetIdV1 } from "../brush/studio-dry-media-anisotropic-grain-v1";
import type { DrawEl, El } from "../studio-element-model";
import type {
  StudioCanonicalVNextDryMediaCanvasAuthority,
  StudioCanonicalVNextDryMediaCanvasAuthorizedAuthority,
  StudioCanonicalVNextDryMediaCanvasUnavailableAuthority,
} from "../StudioCanonicalVNextDryMediaCanvas";

export interface StudioCanonicalDryMediaViewportAuthority {
  readonly active: StudioCanonicalVNextDryMediaCanvasAuthority | null;
  readonly authorized: StudioCanonicalVNextDryMediaCanvasAuthorizedAuthority | null;
  readonly unavailable: StudioCanonicalVNextDryMediaCanvasUnavailableAuthority | null;
  readonly canvasVisible: boolean;
  readonly hiddenElementId: string | null;
}

/**
 * A selected specialist keeps document pixel authority after failure only when it carries an exact
 * snapshot of the last receipted WebGPU frame for the same immutable DrawEl **in the same layout**.
 * An unavailable preflight with no such frame is observable but never hides the ordinary document
 * element.
 *
 * The envelope's `layoutKey` is stamped at publish time, so it always equals the current layout and
 * cannot tell whether the retained bitmap is stale. The snapshot's own `lastPresented.layoutKey`
 * can: a frame receipted at a previous surface size, scale, flip or device pixel ratio must not be
 * stretched into the current bounds (the "old frame lingers after resize" symptom).
 */
export function resolveStudioCanonicalDryMediaViewportAuthority(
  authority: StudioCanonicalVNextDryMediaCanvasAuthority | null,
  candidate: DrawEl | null,
  layoutKey: string,
): StudioCanonicalDryMediaViewportAuthority {
  const active = authority !== null
    && candidate !== null
    && authority.element === candidate
    && authority.layoutKey === layoutKey
    ? authority
    : null;
  const authorized = active?.status === "authorized" ? active : null;
  const unavailable = active?.status === "unavailable" ? active : null;
  const retainsExactLastGood = unavailable?.retainsLastGoodFrame === true
    && unavailable.lastPresented?.element === candidate
    && unavailable.lastPresented.layoutKey === layoutKey;
  const ownsDocumentPixels = authorized !== null || retainsExactLastGood;
  return Object.freeze({
    active,
    authorized,
    unavailable,
    canvasVisible: ownsDocumentPixels,
    hiddenElementId: ownsDocumentPixels ? candidate?.id ?? null : null,
  });
}

/** Shared document-layer guard: exactly one pixel owner may paint a promoted dry-media element. */
export function studioCanonicalDryMediaOwnsDocumentElement(
  elementId: string,
  hiddenElementId: string | null,
): boolean {
  return hiddenElementId !== null && elementId === hiddenElementId;
}

export type StudioCanonicalDryMediaElementIneligibilityReason =
  | "invalid-input"
  | "ineligible-material"
  | "unsupported-paint-roller"
  | "unsupported-symmetry"
  | "unsupported-composite"
  | "unsupported-paint-model"
  | "unsupported-multi-tip"
  | "unsupported-color-dynamics"
  | "unsupported-grain-source";

type StudioCanonicalDryMediaElementEligibility =
  | { readonly status: "eligible"; readonly presetId: StudioDryMediaAnisotropicPresetIdV1 }
  | { readonly status: "ineligible"; readonly reason: StudioCanonicalDryMediaElementIneligibilityReason; readonly detail?: string };

/** Authored settings are normalized snapshots; the compiler also checks its resolved settings. */
export function studioCanonicalDryMediaDynamicsIneligibilityReason(
  settings: NormalizedStudioBrushDynamicsSettings | undefined,
): StudioCanonicalDryMediaElementIneligibilityReason | null {
  if ((settings?.tipLayers?.length ?? 0) > 0 || settings?.dualBrush?.enabled === true) {
    return "unsupported-multi-tip";
  }
  const color = settings?.colorDynamics;
  if ((color?.foregroundBackgroundMix ?? 0) !== 0
    || (color?.foregroundBackgroundJitter ?? 0) !== 0
    || (color?.hueJitter ?? 0) !== 0
    || (color?.saturationJitter ?? 0) !== 0
    || (color?.valueJitter ?? 0) !== 0) return "unsupported-color-dynamics";
  return settings?.grain?.source ? "unsupported-grain-source" : null;
}

/**
 * Presentation admission, shared with the compiler without importing its planning/render graph.
 * Ordinary shapes and unsupported authored brush semantics keep their existing document renderer.
 * An eligible stroke's later planning, device or parity failure remains observable and fail-closed.
 */
export function classifyStudioCanonicalDryMediaElement(
  element: DrawEl | null | undefined,
): StudioCanonicalDryMediaElementEligibility {
  const failure = studioCanonicalDryMediaEligibilityFailure(element);
  if (failure) {
    return { status: "ineligible", reason: failure.reason, detail: failure.detail };
  }
  const classified = element && classifyStudioDryMediaCatalogIdV1(element.brushCatalogId);
  if (!element || classified?.kind !== "anisotropic-continuous") {
    return { status: "ineligible", reason: "ineligible-material" };
  }
  const reason = studioCanonicalDryMediaDynamicsIneligibilityReason(element.brushDynamics);
  return reason ? { status: "ineligible", reason }
    : { status: "eligible", presetId: classified.presetId };
}

/** Resolve the selected topmost eligible stroke before applying viewport presentation gates. */
export function resolveStudioCanonicalDryMediaSelectedElement(
  topElement: El | null,
  selectedId: string | null,
): DrawEl | null {
  return topElement?.id === selectedId && topElement?.type === "draw"
    && classifyStudioCanonicalDryMediaElement(topElement).status === "eligible"
    ? topElement
    : null;
}
