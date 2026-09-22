import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "@/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import type { CampusDistrict } from "@/shared/lib/spatial-campus/campus-model";

/** Reuse authored geometry and immutable source art; never relabel NPCs as real visitors. */
export function campusWorld(district: CampusDistrict): StudioVirtualSpaceWorldManifest {
  const original = DEFAULT_STUDIO_WORLD_MANIFEST;
  return {
    ...original,
    id: `campus-${district.id}`,
    backgroundAssetKey: `campus-${district.id}`,
    backgroundUrl: district.artworkUrl,
    props: original.props.map((prop) => {
      const { action: _action, portal: _portal, ...decoration } = prop;
      return { ...decoration, kind: prop.kind === "portal" ? "decor" : prop.kind };
    }),
    interactions: district.destinations.map((destination, index) => {
      const anchor = original.interactions[index % original.interactions.length]!;
      return { ...anchor, id: destination.id, labelKo: destination.label.ko, labelEn: destination.label.en };
    }),
    portals: [],
    npcs: [],
    npcActivityAnchors: [],
    // Public navigation scenes are local-only. There are no media or seat leases here.
    acousticZones: [],
    interactionSlots: [],
  };
}
