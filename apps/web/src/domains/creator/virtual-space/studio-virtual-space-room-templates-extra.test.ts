import { describe, expect, it } from "vitest";
import {
  STUDIO_EXTRA_ROOM_TEMPLATES,
  studioExtraRoomTemplateByKind,
  validateStudioExtraRoomTemplates,
} from "./studio-virtual-space-room-templates-extra";

describe("추가 방 템플릿", () => {
  it("8종의 템플릿이 한/영 카피와 함께 정의된다", () => {
    expect(STUDIO_EXTRA_ROOM_TEMPLATES).toHaveLength(8);
    const kinds = STUDIO_EXTRA_ROOM_TEMPLATES.map((template) => template.kind);
    expect(kinds).toEqual([
      "meeting-room", "lounge", "personal-studio", "rooftop", "lobby",
      "startup-office", "broadcast-studio", "design-academy",
    ]);
    for (const template of STUDIO_EXTRA_ROOM_TEMPLATES) {
      expect(template.labelKo.trim().length).toBeGreaterThan(0);
      expect(template.labelEn.trim().length).toBeGreaterThan(0);
      expect(template.descriptionKo.trim().length).toBeGreaterThan(0);
      expect(template.descriptionEn.trim().length).toBeGreaterThan(0);
      expect(template.furniture.length).toBeGreaterThan(0);
    }
  });

  it("kind 조회가 동작한다", () => {
    expect(studioExtraRoomTemplateByKind("rooftop")?.labelKo).toBe("옥상");
    expect(studioExtraRoomTemplateByKind("unknown" as never)).toBeNull();
  });

  it("검증을 통과한다", () => {
    expect(validateStudioExtraRoomTemplates()).toEqual([]);
  });

  it("회의실은 비공개 음향 구역과 문을 가진다", () => {
    const meeting = studioExtraRoomTemplateByKind("meeting-room");
    expect(meeting?.acoustic.policy).toBe("private");
    expect(meeting?.acoustic.doorId).toBe("meeting-room-door");
    expect(meeting?.furniture.some((prop) => prop.id === "meeting-door")).toBe(true);
  });

  it("개인 작업실은 1인 좌석만 가진다", () => {
    const studio = studioExtraRoomTemplateByKind("personal-studio");
    expect(studio?.seats).toHaveLength(1);
    expect(studio?.acoustic.policy).toBe("private");
  });

  it("옥상은 스트링 라이트와 망원경을 가진다", () => {
    const rooftop = studioExtraRoomTemplateByKind("rooftop");
    expect(rooftop?.furniture.some((prop) => prop.id === "rooftop-string-lights")).toBe(true);
    expect(rooftop?.furniture.some((prop) => prop.id === "rooftop-telescope")).toBe(true);
  });

  it("로비는 디렉토리 보드를 가진다", () => {
    const lobby = studioExtraRoomTemplateByKind("lobby");
    expect(lobby?.furniture.some((prop) => prop.id === "lobby-directory")).toBe(true);
  });

  it("오피스 템플릿 3종이 존 프리셋을 가진다", () => {
    const startup = studioExtraRoomTemplateByKind("startup-office")!;
    expect(startup.zones?.map((zone) => zone.type)).toEqual(["lounge", "focus-zone", "phone-booth"]);
    expect(startup.zones?.find((zone) => zone.id === "startup-focus")?.suggestMuteOnEnter).toBe(true);
    // 가구는 카탈로그 스펙에서 변환된다 (상대 collider → 절대 좌표)
    const desk = startup.furniture.find((prop) => prop.id === "startup-desk-standard");
    expect(desk?.collider).toMatchObject({ x: 640, y: 132, width: 120, height: 28 });

    const broadcast = studioExtraRoomTemplateByKind("broadcast-studio")!;
    expect(broadcast.zones?.map((zone) => zone.type)).toEqual(["studio", "event-hall", "reception"]);
    expect(broadcast.acoustic.policy).toBe("private");

    const academy = studioExtraRoomTemplateByKind("design-academy")!;
    expect(academy.zones?.map((zone) => zone.type)).toEqual(["library", "cafe"]);
    expect(academy.zones?.find((zone) => zone.id === "academy-library")?.suggestMuteOnEnter).toBe(true);
    for (const template of [startup, broadcast, academy]) {
      for (const zone of template.zones ?? []) {
        expect(zone.labelKo.trim().length).toBeGreaterThan(0);
        expect(zone.labelEn.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("잘못된 템플릿은 오류를 낸다", () => {
    const bad = [{
      ...STUDIO_EXTRA_ROOM_TEMPLATES[0],
      kind: "meeting-room",
      labelKo: "",
    }] as never;
    const errors = validateStudioExtraRoomTemplates(bad);
    expect(errors.length).toBeGreaterThan(0);
  });
});
