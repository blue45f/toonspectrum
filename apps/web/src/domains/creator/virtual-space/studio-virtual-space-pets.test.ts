import { describe, expect, it } from "vitest";
import {
  adoptStudioPet,
  advanceStudioPet,
  createStudioPet,
  EMPTY_PET_ADOPTION,
  releaseStudioPet,
  renameStudioPet,
  STUDIO_PET_ADOPT_LIMIT,
  STUDIO_PET_SIT_RADIUS,
  STUDIO_PET_SLEEP_AFTER_MS,
  studioPetById,
  studioPetModeLabel,
  studioPetSpeciesMeta,
  STUDIO_PET_SPECIES_META,
} from "./studio-virtual-space-pets";

const OWNER = { x: 500, y: 500 };

function step(pet: ReturnType<typeof createStudioPet>, ownerSpeed: number, nowMs: number, owner = OWNER) {
  return advanceStudioPet(pet, { ownerPoint: owner, ownerSpeed, deltaSeconds: 1 / 60, nowMs });
}

describe("STUDIO_PET_SPECIES_META", () => {
  it("펫 3종을 등록한다", () => {
    expect(STUDIO_PET_SPECIES_META.map((item) => item.species)).toEqual(["cat", "dog", "fox"]);
    for (const item of STUDIO_PET_SPECIES_META) {
      expect(item.labelKo.trim().length).toBeGreaterThan(0);
      expect(item.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("알 수 없는 종류는 null을 반환한다", () => {
    expect(studioPetSpeciesMeta("dragon")).toBeNull();
    expect(studioPetSpeciesMeta("cat")?.labelKo).toBe("고양이");
  });
});

describe("advanceStudioPet", () => {
  it("멀리 있으면 주인을 향해 다가간다", () => {
    let pet = createStudioPet({ id: "pet-1", species: "cat", start: { x: 100, y: 100 }, nowMs: 0 });
    const startDist = Math.hypot(pet.position.x - OWNER.x, pet.position.y - OWNER.y);
    for (let ms = 0; ms < 5000; ms += 16) {
      pet = step(pet, 0, ms);
      if (pet.mode !== "follow") break;
    }
    const endDist = Math.hypot(pet.position.x - OWNER.x, pet.position.y - OWNER.y);
    expect(endDist).toBeLessThan(startDist);
    expect(pet.moving).toBe(true);
  });

  it("가까이 있고 주인이 가만히 있으면 앉는다", () => {
    let pet = createStudioPet({ id: "pet-2", species: "dog", start: { x: OWNER.x + 20, y: OWNER.y + 10 }, nowMs: 0 });
    pet = step(pet, 0, 100);
    expect(pet.mode).toBe("sit");
    expect(pet.moving).toBe(false);
  });

  it("오래 앉아 있으면 잠든다", () => {
    let pet = createStudioPet({ id: "pet-3", species: "fox", start: { x: OWNER.x + 20, y: OWNER.y + 10 }, nowMs: 0 });
    pet = step(pet, 0, 0);
    expect(pet.mode).toBe("sit");
    pet = step(pet, 0, STUDIO_PET_SLEEP_AFTER_MS + 1000);
    expect(pet.mode).toBe("sleep");
  });

  it("주인이 빨리 달리면 주변을 맴돈다", () => {
    let pet = createStudioPet({ id: "pet-4", species: "dog", start: { x: OWNER.x + 20, y: OWNER.y + 10 }, nowMs: 0 });
    pet = step(pet, 300, 100);
    expect(pet.mode).toBe("play");
    expect(pet.moving).toBe(true);
  });

  it("앉은 펫은 주인을 바라본다", () => {
    const pet = step(
      createStudioPet({ id: "pet-5", species: "cat", start: { x: OWNER.x + 30, y: OWNER.y }, nowMs: 0 }),
      0, 100,
    );
    expect(pet.facing).toBe("left");
  });

  it("앉기 반경 안에서는 멀어지지 않는다", () => {
    let pet = createStudioPet({ id: "pet-6", species: "cat", start: { x: OWNER.x + 10, y: OWNER.y + 10 }, nowMs: 0 });
    for (let ms = 0; ms < 3000; ms += 16) {
      pet = step(pet, 0, ms);
    }
    const dist = Math.hypot(pet.position.x - OWNER.x, pet.position.y - OWNER.y);
    expect(dist).toBeLessThanOrEqual(STUDIO_PET_SIT_RADIUS + 80);
  });
});

describe("adoptStudioPet", () => {
  it("펫을 입양한다", () => {
    const result = adoptStudioPet(EMPTY_PET_ADOPTION, {
      species: "cat", name: "야옹이", ownerPoint: OWNER, nowMs: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pet.name).toBe("야옹이");
      expect(result.adoption.pets).toHaveLength(1);
    }
  });

  it("입양 한도를 넘기면 실패한다", () => {
    let adoption = EMPTY_PET_ADOPTION;
    for (let index = 0; index < STUDIO_PET_ADOPT_LIMIT; index += 1) {
      const result = adoptStudioPet(adoption, { species: "dog", name: `멍${index}`, ownerPoint: OWNER, nowMs: 0 });
      expect(result.ok).toBe(true);
      if (result.ok) adoption = result.adoption;
    }
    const overflow = adoptStudioPet(adoption, { species: "fox", name: "여우", ownerPoint: OWNER, nowMs: 0 });
    expect(overflow).toEqual({ ok: false, reason: "limit" });
  });

  it("잘못된 종류·이름은 실패한다", () => {
    expect(adoptStudioPet(EMPTY_PET_ADOPTION, { species: "dragon", name: "드래곤", ownerPoint: OWNER }).reason).toBe("invalid-species");
    expect(adoptStudioPet(EMPTY_PET_ADOPTION, { species: "cat", name: "   ", ownerPoint: OWNER }).reason).toBe("invalid-name");
    expect(adoptStudioPet(EMPTY_PET_ADOPTION, { species: "cat", name: "이름이너무길어요열세자", ownerPoint: OWNER }).reason).toBe("invalid-name");
  });

  it("펫 id가 겹치지 않는다", () => {
    let adoption = EMPTY_PET_ADOPTION;
    const ids = new Set<string>();
    for (let index = 0; index < STUDIO_PET_ADOPT_LIMIT; index += 1) {
      const result = adoptStudioPet(adoption, { species: "cat", name: `냥${index}`, ownerPoint: OWNER, nowMs: 0 });
      if (result.ok) {
        adoption = result.adoption;
        expect(ids.has(result.pet.id)).toBe(false);
        ids.add(result.pet.id);
      }
    }
  });
});

describe("releaseStudioPet / renameStudioPet", () => {
  it("펫을 떠나보낸다", () => {
    const adopted = adoptStudioPet(EMPTY_PET_ADOPTION, { species: "cat", name: "냥이", ownerPoint: OWNER, nowMs: 0 });
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) return;
    const released = releaseStudioPet(adopted.adoption, adopted.pet.id);
    expect(released.pets).toHaveLength(0);
    expect(studioPetById(released, adopted.pet.id)).toBeNull();
    // 없는 id는 그대로
    expect(releaseStudioPet(released, "pet-999")).toBe(released);
  });

  it("펫 이름을 바꾼다", () => {
    const adopted = adoptStudioPet(EMPTY_PET_ADOPTION, { species: "dog", name: "콩이", ownerPoint: OWNER, nowMs: 0 });
    expect(adopted.ok).toBe(true);
    if (!adopted.ok) return;
    const renamed = renameStudioPet(adopted.adoption, adopted.pet.id, "밤이");
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(studioPetById(renamed.adoption, adopted.pet.id)?.name).toBe("밤이");
    expect(renameStudioPet(adopted.adoption, "pet-999", "밤이").reason).toBe("not-found");
    expect(renameStudioPet(adopted.adoption, adopted.pet.id, "").reason).toBe("invalid-name");
  });
});

describe("studioPetModeLabel", () => {
  it("한·영 라벨을 반환한다", () => {
    expect(studioPetModeLabel("follow")).toEqual({ ko: "따라가기", en: "Following" });
    expect(studioPetModeLabel("sleep")).toEqual({ ko: "낮잠", en: "Napping" });
  });
});
