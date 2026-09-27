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
    expect(ribbon.positions.length).toBe(((guide.points.length - 1) * profile.segmentsPerSpan + 1) * 2 * 3);
    expect(ribbon.indices.length).toBe((guide.points.length - 1) * profile.segmentsPerSpan * 6);
    expect([...ribbon.positions].every(Number.isFinite)).toBe(true);
    expect(ribbon.bounds.maximum[1]).toBeGreaterThan(ribbon.bounds.minimum[1]);
  });

  it("길이 배율을 바꿔도 원점에서 떨어진 뿌리를 고정하고 끝만 연장한다", () => {
    const offCentre: CharacterGroomGuideCurve = {
      guideId: "guide:off-centre", status: "valid",
      points: [
        { position: [2, 3, 4], width: 1, twist: 0 },
        { position: [2, 4, 4], width: 1, twist: 0 },
      ],
    };
    const ribbon = buildCharacterGroomRibbon(offCentre, { ...profile, lengthScale: 2, curl: 0, wave: 0, clump: 0 });
    const centre = (offset: number) => [0, 1, 2].map((axis) => ((ribbon.positions[offset + axis] ?? 0) + (ribbon.positions[offset + 3 + axis] ?? 0)) / 2);
    for (const [axis, value] of [2, 3, 4].entries()) expect(centre(0)[axis]).toBeCloseTo(value, 6);
    for (const [axis, value] of [2, 5, 4].entries()) expect(centre(ribbon.positions.length - 6)[axis]).toBeCloseTo(value, 6);
    expect(offCentre.points[0]?.position).toEqual([2, 3, 4]);
  });

  it("길이, 폭, 말림, 물결과 세분화가 실제 메시 좌표를 바꾸며 원본은 보존한다", () => {
    const clean = { ...profile, curl: 0, wave: 0, clump: 0, noise: 0 };
    const before = JSON.stringify(guide);
    const plain = buildCharacterGroomRibbon(guide, clean);
    for (const patch of [{ curl: 0.7 }, { wave: 0.7 }, { baseWidth: 0.3 }, { lengthScale: 1.5 }]) {
      const changed = buildCharacterGroomRibbon(guide, { ...clean, ...patch });
      expect([...changed.positions]).not.toEqual([...plain.positions]);
      expect([...changed.positions, ...changed.normals].every(Number.isFinite)).toBe(true);
    }
    const coarse = buildCharacterGroomRibbon(guide, { ...clean, segmentsPerSpan: 1 });
    expect(plain.indices.length).toBeGreaterThan(coarse.indices.length);
    expect(JSON.stringify(guide)).toBe(before);
  });

  it("극소 간격을 사용하는 재샘플은 반복 계산 전에 원본 점 한도를 검사한다", () => {
    expect(() => resampleCharacterGroomGuide(guide, Number.MIN_VALUE)).toThrow("2048개 점");
    expect(() => resampleCharacterGroomGuide(guide, 0.0001)).toThrow("2048개 점");
    expect(resampleCharacterGroomGuide(guide, 0.001).points.length).toBeLessThanOrEqual(2048);
  });

  it("축약된 가이드와 원본 한도를 넘긴 입력은 퇴화 메시를 만들기 전에 거부한다", () => {
    const point = { position: [0, 0, 0] as const, width: 1, twist: 0 };
    expect(() => buildCharacterGroomRibbon({ guideId: "guide:zero", status: "valid", points: [point, point] }, profile)).toThrow("길이가 너무 짧습니다");
    expect(() => buildCharacterGroomRibbon({ guideId: "guide:large", status: "valid", points: Array.from({ length: 2049 }, () => point) }, profile)).toThrow("2048개 점");
  });

  it("marks anchored guides for reprojection after a topology revision", () => {
    const changed = markCharacterGroomTopology(document(), "topology:v2");
    expect(changed.topologyRevision).toBe("topology:v2");
    expect(changed.groups[0]?.guides[0]?.status).toBe("needs-reprojection");
  });
});
