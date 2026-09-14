import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  brushStudioV6LicenseProfileAllows,
  brushStudioV6ProviderManifestById,
} from "./brush-studio-v6-license-profile";

import type { BrushStudioV6NodeDescriptor } from "./brush-studio-v6-engine";
import type {
  BrushStudioV6LicenseProfile,
  BrushStudioV6Rights,
} from "./brush-studio-v6-license-profile";

export type BrushStudioV6ProviderExecution = "native" | "compatibility-adapter";

export interface BrushStudioV6ProviderBinding {
  readonly providerId: string;
  readonly label: string;
  readonly version: string;
  readonly license: string;
  readonly rights: BrushStudioV6Rights;
  readonly execution: BrushStudioV6ProviderExecution;
  readonly nodeIds: readonly string[];
}

export interface BrushStudioV6ProviderRuntimePlan {
  readonly version: 1;
  readonly fallbackPolicy: "none";
  readonly licenseProfile: BrushStudioV6LicenseProfile;
  readonly bindings: readonly BrushStudioV6ProviderBinding[];
  readonly blockedNodeIds: readonly string[];
  readonly valid: boolean;
}
const NODE_PROVIDER_IDS: Readonly<Record<string, string>> = Object.freeze({
  "pigment-mixbox": "mixbox-js-v2",
  "pigment-spectral": "spectral-wgm-v1",
  "pigment-open-km": "ks-reference-wgm-v1",
  "pigment-inkwash-density": "inkwash-density-wgm-v1",
  "carrier-libmypaint-dabs": "libmypaint-contact-adapter-v1",
  "carrier-hokusai-dabs": "hokusai-contact-adapter-v1",
  "carrier-krita-hairy": "krita-contact-adapter-gpl-v1",
  "tip-krita-dual": "krita-contact-adapter-gpl-v1",
  "pickup-krita-smudge": "krita-contact-adapter-gpl-v1",
  "carrier-perfect-outline": "perfect-outline-contact-adapter-v1",
  "tip-pigment-normal": "pigment-painter-contact-adapter-v1",
  "surface-realbrush": "realbrush-surface-adapter-v1",
  "physics-porous-paper": "porous-paper-contact-adapter-v1",
  "deposit-wet": "inkwash-density-wgm-v1",
  "physics-inkwash": "inkwash-density-wgm-v1",
  "finish-chroma": "inkwash-density-wgm-v1",
  "motion-google-ink": "google-ink-wasm",
  "carrier-google-mesh": "google-ink-wasm",
  "carrier-p5-flow": "p5-brush",
  "pattern-flow-field": "p5-brush",
});

function providerIdForNode(node: BrushStudioV6NodeDescriptor): string | null {
  const explicit = NODE_PROVIDER_IDS[node.id];
  if (explicit) return explicit;
  return node.rights === "internal" ? "toonspectrum-cpu-contact-v2" : null;
}

function providerExecution(
  providerId: string,
  roles: readonly string[],
): BrushStudioV6ProviderExecution {
  return providerId === "toonspectrum-cpu-contact-v2" || !roles.includes("contact-adapter")
    ? "native"
    : "compatibility-adapter";
}

interface MutableBinding {
  readonly providerId: string;
  readonly execution: BrushStudioV6ProviderExecution;
  readonly nodeIds: string[];
}
export function planBrushStudioV6ProviderRuntime(
  nodes: readonly BrushStudioV6NodeDescriptor[],
  licenseProfile: BrushStudioV6LicenseProfile = BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
): BrushStudioV6ProviderRuntimePlan {
  const grouped = new Map<string, MutableBinding>();
  const blocked = new Set<string>();

  for (const node of nodes) {
    const providerId = providerIdForNode(node);
    const manifest = providerId ? brushStudioV6ProviderManifestById(providerId) : null;
    if (
      !manifest
      || manifest.integration !== "connected"
      || !brushStudioV6LicenseProfileAllows(licenseProfile, manifest.rights)
    ) {
      blocked.add(node.id);
      continue;
    }
    const execution = providerExecution(providerId, manifest.roles);
    const key = `${providerId}:${execution}`;
    const current = grouped.get(key);
    if (current) current.nodeIds.push(node.id);
    else grouped.set(key, { providerId, execution, nodeIds: [node.id] });
  }

  const bindings = [...grouped.values()].map((group): BrushStudioV6ProviderBinding => {
    const manifest = brushStudioV6ProviderManifestById(group.providerId)!;
    return Object.freeze({
      providerId: manifest.id,
      label: manifest.label,
      version: manifest.version,
      license: manifest.license,
      rights: manifest.rights,
      execution: group.execution,
      nodeIds: Object.freeze([...new Set(group.nodeIds)]),
    });
  });

  const blockedNodeIds = Object.freeze([...blocked]);
  return Object.freeze({
    version: 1,
    fallbackPolicy: "none",
    licenseProfile,
    bindings: Object.freeze(bindings),
    blockedNodeIds,
    valid: blockedNodeIds.length === 0,
  });
}
