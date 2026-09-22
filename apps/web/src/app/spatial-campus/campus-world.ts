import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "@/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import type { CampusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import type { CampusObject } from "@/shared/lib/spatial-campus/campus-objects";

const MAX_CAMPUS_OBJECT_INTERACTIONS = 3;
const OBJECT_INTERACTION_PREFIX = "campus-object-";

export function campusObjectInteractionId(index: number): string {
  return `${OBJECT_INTERACTION_PREFIX}${index}`;
}

export function campusObjectInteractionIndex(interactionId: string): number | null {
  if (!interactionId.startsWith(OBJECT_INTERACTION_PREFIX)) return null;
  const raw = interactionId.slice(OBJECT_INTERACTION_PREFIX.length);
  if (!/^\d{1,2}$/u.test(raw)) return null;
  const index = Number(raw);
  return Number.isSafeInteger(index) && index >= 0 && index < MAX_CAMPUS_OBJECT_INTERACTIONS
    ? index
    : null;
}

/**
 * Reuse authored geometry and immutable source art; never relabel NPCs as real visitors.
 * A bounded subset of already-canonical scene objects may occupy authored interaction anchors.
 * The manifest receives only a local slot id and display label — never the domain object's id/href.
 */
export function campusWorld(
  district: CampusDistrict,
  objects: readonly CampusObject[] = [],
): StudioVirtualSpaceWorldManifest {
  const original = DEFAULT_STUDIO_WORLD_MANIFEST;
  const objectCount = Math.min(
    MAX_CAMPUS_OBJECT_INTERACTIONS,
    objects.length,
    Math.max(0, original.interactions.length - 1),
  );
  const destinationCount = Math.min(
    district.destinations.length,
    original.interactions.length - objectCount,
  );
  const destinationInteractions = district.destinations
    .slice(0, destinationCount)
    .map((destination, index) => {
      const anchor = original.interactions[index]!;
      return {
        ...anchor,
        id: destination.id,
        labelKo: destination.label.ko,
        labelEn: destination.label.en,
      };
    });
  const objectInteractions = objects.slice(0, objectCount).map((object, index) => {
    const anchor = original.interactions[destinationCount + index]!;
    return {
      ...anchor,
      id: campusObjectInteractionId(index),
      labelKo: object.title,
      labelEn: object.title,
    };
  });

  return {
    ...original,
    id: `campus-${district.id}`,
    backgroundAssetKey: `campus-${district.id}`,
    backgroundUrl: district.artworkUrl,
    props: original.props.map((prop) => {
      const { action: _action, portal: _portal, ...decoration } = prop;
      return { ...decoration, kind: prop.kind === "portal" ? "decor" : prop.kind };
    }),
    interactions: [...destinationInteractions, ...objectInteractions],
    portals: [],
    npcs: [],
    npcActivityAnchors: [],
    // Public navigation scenes are local-only. There are no media or seat leases here.
    acousticZones: [],
    interactionSlots: [],
  };
}
