import { describe, expect, it } from "vitest";
import {
  findNearestUnifiedInteractTarget,
  handleUnifiedInteractKey,
  studioDoorAcousticHint,
  unifiedInteractPromptText,
  type StudioUnifiedInteractRegistries,
} from "./studio-virtual-space-unified-interact";
import { createStudioDoor } from "./studio-virtual-space-door-state";
import { createStudioLightFixture } from "./studio-virtual-space-lighting";
import type { StudioOfficeObject } from "./studio-virtual-space-office-interactables";

const player = { x: 0, y: 0 };
const officeObjects: readonly StudioOfficeObject[] = [
  { id: "desk1", kind: "desk", position: { x: 50, y: 0 }, radius: 60, labelKo: "작업 책상", labelEn: "Work desk" },
];

function registries(overrides: Partial<StudioUnifiedInteractRegistries> = {}): StudioUnifiedInteractRegistries {
  return {
    officeObjects,
    lightFixtures: [
      { ...createStudioLightFixture({ id: "lamp1", kind: "desk-lamp", position: { x: 30, y: 0 } }), labelKo: "책상 스탠드", labelEn: "Desk lamp" },
    ],
    doors: [
      { ...createStudioDoor({ id: "door1", labelKo: "회의실 문", labelEn: "Meeting room door" }), position: { x: 70, y: 0 } },
    ],
    ...overrides,
  };
}

describe("통합 타겟 탐색", () => {
  it("가장 가까운 대상을 찾는다", () => {
    const target = findNearestUnifiedInteractTarget(registries(), player);
    expect(target?.kind).toBe("light");
    expect(target?.id).toBe("lamp1");
    expect(target?.actionKo).toBe("끄기"); // 기본 켜짐 상태
  });

  it("반경 밖에는 대상이 없다", () => {
    const target = findNearestUnifiedInteractTarget(registries(), { x: 1000, y: 1000 });
    expect(target).toBeNull();
  });

  it("빈 레지스트리에서는 null이다", () => {
    const target = findNearestUnifiedInteractTarget({ officeObjects: [], lightFixtures: [], doors: [] }, player);
    expect(target).toBeNull();
  });

  it("꺼진 조명은 켜기 액션을 표시한다", () => {
    const off = {
      ...createStudioLightFixture({ id: "lamp2", kind: "floor-lamp", position: { x: 10, y: 0 }, on: false }),
      labelKo: "플로어 스탠드",
      labelEn: "Floor lamp",
    };
    const target = findNearestUnifiedInteractTarget(
      registries({ officeObjects: [], lightFixtures: [off], doors: [] }),
      player,
    );
    expect(target?.actionKo).toBe("켜기");
  });

  it("문은 열기/닫기 액션을 표시한다", () => {
    const target = findNearestUnifiedInteractTarget(
      registries({ officeObjects: [], lightFixtures: [], doors: registries().doors }),
      player,
    );
    expect(target?.kind).toBe("door");
    expect(target?.actionKo).toBe("문 열기");
  });
});

describe("X키 명령 변환", () => {
  it("대상이 없으면 null이다", () => {
    expect(handleUnifiedInteractKey(null)).toBeNull();
  });

  it("종류별 명령을 반환한다", () => {
    const light = findNearestUnifiedInteractTarget(registries(), player)!;
    expect(handleUnifiedInteractKey(light)?.command).toBe("toggle-light");

    const door = findNearestUnifiedInteractTarget(
      registries({ officeObjects: [], lightFixtures: [] }),
      player,
    )!;
    expect(handleUnifiedInteractKey(door)?.command).toBe("toggle-door");

    const office = findNearestUnifiedInteractTarget(
      registries({ lightFixtures: [], doors: [] }),
      player,
    )!;
    expect(handleUnifiedInteractKey(office)?.command).toBe("activate-office");
  });
});

describe("프롬프트 텍스트", () => {
  it("한/영 프롬프트를 생성한다", () => {
    const target = findNearestUnifiedInteractTarget(registries(), player)!;
    const prompt = unifiedInteractPromptText(target);
    expect(prompt.ko).toContain("X");
    expect(prompt.ko).toContain("책상 스탠드");
    expect(prompt.en).toContain("Desk lamp");
  });
});

describe("문 음향 힌트", () => {
  it("닫힌 문은 private, 열린 문은 open이다", () => {
    const closed = createStudioDoor({ id: "d", labelKo: "문", labelEn: "Door" });
    expect(studioDoorAcousticHint(closed)).toBe("private");
    const open = createStudioDoor({ id: "d", labelKo: "문", labelEn: "Door", open: true });
    expect(studioDoorAcousticHint(open)).toBe("open");
  });
});
