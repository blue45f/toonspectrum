import { describe, expect, it } from "vitest";
import {
  STUDIO_EXTRA_ROOM_TEMPLATES,
  studioExtraRoomTemplateByKind,
  validateStudioExtraRoomTemplates,
} from "./studio-virtual-space-room-templates-extra";

describe("추가 방 템플릿", () => {
  it("5종의 템플릿이 한/영 카피와 함께 정의된다", () => {
    expect(STUDIO_EXTRA_ROOM_TEMPLATES).toHaveLength(5);
    const kinds = STUDIO_EXTRA_ROOM_TEMPLATES.map((template) => template.kind);
    expect(kinds).toEqual(["meeting-room", "lounge", "personal-studio", "rooftop", "lobby"]);
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
