import { describe, expect, it } from "vitest";

import { createEmptyCharacterGroomDocument } from "./character-groom-document";
import { addCharacterGroomGroup, addCharacterGroomGuide, duplicateCharacterGroomGroup, duplicateCharacterGroomGuide, editCharacterGroomGroup } from "./character-groom-edit";

describe("헤어 원본 편집", () => {
  it("추가와 복제는 모든 그룹의 고유 ID를 유지하고 원본 제어점을 보존한다", () => {
    const original = addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:edit"), "앞머리");
    const group = original.groups[0];
    const guide = group?.guides[0];
    if (!group || !guide) throw new Error("헤어 원본이 없습니다.");
    const serialized = JSON.stringify(original);
    const added = addCharacterGroomGuide(original, group.groupId);
    const copied = duplicateCharacterGroomGuide(added, group.groupId, guide.guideId);
    const duplicated = duplicateCharacterGroomGroup(copied, group.groupId);
    const ids = duplicated.groups.flatMap((entry) => entry.guides.map((curve) => curve.guideId));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(duplicated.groups.map((entry) => entry.groupId)).size).toBe(2);
    expect(copied.groups[0]?.guides[2]?.points[0]?.position[0]).toBeCloseTo(0.025);
    expect(JSON.stringify(original)).toBe(serialized);
  });

  it("잠긴 그룹과 확인되지 않은 표면 앵커 가이드의 위치를 덮어쓰지 않는다", () => {
    const original = addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:edit"), "앞머리");
    const groupId = original.groups[0]?.groupId ?? "missing";
    const locked = { ...original, groups: original.groups.map((group) => ({ ...group, locked: true })) };
    expect(() => editCharacterGroomGroup(locked, groupId, (group) => ({ ...group, name: "변경" }))).toThrow("잠긴");
    const anchored = { ...original, groups: original.groups.map((group) => ({ ...group, guides: group.guides.map((guide) => ({ ...guide, points: guide.points.map((point) => ({ ...point, surfaceAnchor: {
      meshAssetId: "mesh:head", topologyRevision: "topology:edit", primitiveIndex: 0, triangleIndex: 0,
      barycentric: [1, 0, 0] as const, localNormal: [0, 0, 1] as const,
    } })) })) })) };
    expect(() => duplicateCharacterGroomGuide(anchored, groupId, anchored.groups[0]?.guides[0]?.guideId ?? "missing")).toThrow("다시 투영");
  });
});
