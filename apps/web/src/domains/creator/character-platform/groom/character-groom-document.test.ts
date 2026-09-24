import { describe, expect, it } from "vitest";

import {
  buildCharacterGroomRibbon,
  createEmptyCharacterGroomDocument,
  markCharacterGroomTopology,
  resampleCharacterGroomGuide,
  validateCharacterGroomDocument,
  type CharacterGroomDocument,
  type CharacterGroomGuideCurve,
  type CharacterGroomProfile,
} from "./character-groom-document";

const profile: CharacterGroomProfile = {
  baseWidth: 0.12,
  taper: 0.8,
  lengthScale: 1,
  curl: 0.2,
  wave: 0.1,
  clump: 0.3,
  noise: 0,
  rootRotation: 0,
  lineOnly: false,
  fill: true,
  segmentsPerSpan: 4,
};

const guide: CharacterGroomGuideCurve = {
  guideId: "guide:front-1",
  status: "valid",
  points: [
    {
      position: [0, 0, 0],
      width: 1,
      twist: 0,
      surfaceAnchor: {
        meshAssetId: "mesh:head",
        topologyRevision: "topology:v1",
        primitiveIndex: 0,
        triangleIndex: 12,
        barycentric: [0.2, 0.3, 0.5],
        localNormal: [0, 0, 1],
      },
    },
    { position: [0, 0.5, 0.1], width: 0.8, twist: 0.1 },
    { position: [0.1, 1, 0.2], width: 0.2, twist: 0.2 },
  ],
};

function document(): CharacterGroomDocument {
  return {
    version: 1,
    topologyRevision: "topology:v1",
    groups: [{
      groupId: "groom:front",
      name: "앞머리",
      scalpRegionId: "scalp:front",
      materialId: "material:hair",
      visible: true,
      locked: false,
      profile,
      guides: [guide],
    }],
  };
}

describe("Character guide-curve groom", () => {
  it("validates a persistent guide document and keeps an empty browser-safe default", () => {
    expect(createEmptyCharacterGroomDocument()).toEqual({
      version: 1,
      topologyRevision: "unbound-topology",
      groups: [],
    });
    const value = validateCharacterGroomDocument(document());
    expect(value.groups[0]?.guides[0]?.points).toHaveLength(3);
    expect(Object.isFrozen(value.groups)).toBe(true);
  });

  it("resamples guides without changing the root surface authority", () => {
    const sampled = resampleCharacterGroomGuide(guide, 0.2);
    expect(sampled.points.length).toBeGreaterThan(guide.points.length);
    expect(sampled.points[0]?.surfaceAnchor?.triangleIndex).toBe(12);
    expect(sampled.points.at(-1)?.position).toEqual([0.1, 1, 0.2]);
  });

  it("generates an editable ribbon derivative instead of persisting renderer objects", () => {
    const ribbon = buildCharacterGroomRibbon(guide, profile);
    expect(ribbon.positions).toBeInstanceOf(Float32Array);
    expect(ribbon.positions.length).toBe(guide.points.length * 2 * 3);
    expect(ribbon.indices.length).toBe((guide.points.length - 1) * 6);
    expect([...ribbon.positions].every(Number.isFinite)).toBe(true);
    expect(ribbon.bounds.maximum[1]).toBeGreaterThan(ribbon.bounds.minimum[1]);
  });

  it("marks anchored guides for reprojection after a topology revision", () => {
    const changed = markCharacterGroomTopology(document(), "topology:v2");
    expect(changed.topologyRevision).toBe("topology:v2");
    expect(changed.groups[0]?.guides[0]?.status).toBe("needs-reprojection");
  });
});
