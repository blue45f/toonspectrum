import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  brushStudioV6LicenseProfileAllows,
  brushStudioV6MaterialExecutionForNode,
  brushStudioV6ProviderManifestForNode,
} from "./brush-studio-v6-license-profile";

import type { BrushStudioV6NodeDescriptor } from "./brush-studio-v6-engine";
import type {
  BrushStudioV6LicenseProfile,
  BrushStudioV6MaterialExecution,
  BrushStudioV6ProductPath,
  BrushStudioV6Rights,
} from "./brush-studio-v6-license-profile";

export type BrushStudioV6ProviderExecution = BrushStudioV6MaterialExecution;

export interface BrushStudioV6ProviderBinding {
  readonly providerId: string;
  readonly label: string;
  readonly version: string;
  readonly license: string;
  readonly rights: BrushStudioV6Rights;
  readonly execution: BrushStudioV6ProviderExecution;
  readonly productPath: BrushStudioV6ProductPath;
  readonly nodeIds: readonly string[];
}

export interface BrushStudioV6BlockedProviderNode {
  readonly nodeId: string;
  readonly providerId: string | null;
  readonly productPath: BrushStudioV6ProductPath | null;
  readonly reason:
    | "license-profile"
    | "provider-not-connected"
    | "provider-unregistered"
    | "wrong-product-path";
}

export interface BrushStudioV6ProviderRuntimePlan {
  readonly version: 2;
  readonly fallbackPolicy: "none";
  readonly requiredProductPath: "material-contact";
  readonly licenseProfile: BrushStudioV6LicenseProfile;
  readonly bindings: readonly BrushStudioV6ProviderBinding[];
  readonly blockedNodeIds: readonly string[];
  readonly blockedNodes: readonly BrushStudioV6BlockedProviderNode[];
  readonly valid: boolean;
}

interface MutableBinding {
  readonly providerId: string;
  readonly execution: BrushStudioV6ProviderExecution;
  readonly nodeIds: string[];
}

function blocked(
  node: BrushStudioV6NodeDescriptor,
  reason: BrushStudioV6BlockedProviderNode["reason"],
): BrushStudioV6BlockedProviderNode {
  const manifest = brushStudioV6ProviderManifestForNode(node.id);
  return Object.freeze({
    nodeId: node.id,
    providerId: manifest?.id ?? null,
    productPath: manifest?.productPath ?? null,
    reason,
  });
}

/**
 * Compile the current V6 saved-brush path. Exact engines whose only product path is vector,
 * standalone or settled generation remain visible in the authoring graph, but are rejected here
 * instead of being silently replayed by the shared contact kernel.
 */
export function planBrushStudioV6ProviderRuntime(
  nodes: readonly BrushStudioV6NodeDescriptor[],
  licenseProfile: BrushStudioV6LicenseProfile = BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
): BrushStudioV6ProviderRuntimePlan {
  const grouped = new Map<string, MutableBinding>();
  const blockedNodes: BrushStudioV6BlockedProviderNode[] = [];

  for (const node of nodes) {
    const manifest = brushStudioV6ProviderManifestForNode(node.id);
    if (!manifest) {
      blockedNodes.push(blocked(node, "provider-unregistered"));
      continue;
    }
    if (!brushStudioV6LicenseProfileAllows(licenseProfile, manifest.rights)) {
      blockedNodes.push(blocked(node, "license-profile"));
      continue;
    }
    if (manifest.integration !== "connected") {
      blockedNodes.push(blocked(node, "provider-not-connected"));
      continue;
    }
    const execution = brushStudioV6MaterialExecutionForNode(node.id);
    if (!execution) {
      blockedNodes.push(blocked(node, "wrong-product-path"));
      continue;
    }
    const key = `${manifest.id}:${execution}`;
    const current = grouped.get(key);
    if (current) current.nodeIds.push(node.id);
    else grouped.set(key, { providerId: manifest.id, execution, nodeIds: [node.id] });
  }

  const bindings = [...grouped.values()].map((group): BrushStudioV6ProviderBinding => {
    const manifest = brushStudioV6ProviderManifestForNode(group.nodeIds[0]!)!;
    return Object.freeze({
      providerId: manifest.id,
      label: manifest.label,
      version: manifest.version,
      license: manifest.license,
      rights: manifest.rights,
      execution: group.execution,
      productPath: manifest.productPath,
      nodeIds: Object.freeze([...new Set(group.nodeIds)]),
    });
  });

  const frozenBlocked = Object.freeze(blockedNodes);
  const blockedNodeIds = Object.freeze(blockedNodes.map((entry) => entry.nodeId));
  return Object.freeze({
    version: 2,
    fallbackPolicy: "none",
    requiredProductPath: "material-contact",
    licenseProfile,
    bindings: Object.freeze(bindings),
    blockedNodeIds,
    blockedNodes: frozenBlocked,
    valid: blockedNodeIds.length === 0,
  });
}
