import { describe, expect, it } from "vitest";
import {
  diffInteractFocus,
  findNearestInteractable,
  handleInteractKey,
  interactPromptText,
  STUDIO_INTERACT_PROMPT_RADIUS,
  type StudioInteractableObject,
} from "./studio-virtual-space-interactable-objects";

const obj = (
  id: string,
  kind: StudioInteractableObject["kind"],
  x: number,
  y: number,
  radius = 40,
): StudioInteractableObject => ({
  id,
  kind,
  position: { x, y },
  radius,
  labelKo: id,
  labelEn: id,
});

describe("findNearestInteractable", () => {
  it("반경 안에 없으면 null", () => {
    const objects = [obj("wb", "whiteboard", 500, 500)];
    expect(findNearestInteractable(objects, { x: 0, y: 0 })).toBeNull();
  });

  it("가장 가까운 오브젝트를 반환", () => {
    const objects = [
      obj("far", "youtube", 80, 0),
      obj("near", "whiteboard", 30, 0),
    ];
    const found = findNearestInteractable(objects, { x: 0, y: 0 });
    expect(found?.id).toBe("near");
  });

  it("프롬프트 반경(STUDIO_INTERACT_PROMPT_RADIUS)을 사용", () => {
    // 오브젝트 radius가 작아도 프롬프트 반경 안이면 감지
    const objects = [obj("tiny", "document", STUDIO_INTERACT_PROMPT_RADIUS - 1, 0, 5)];
    expect(findNearestInteractable(objects, { x: 0, y: 0 })?.id).toBe("tiny");
  });
});

describe("interactPromptText", () => {
  it("웹툰 특화 오브젝트 프롬프트", () => {
    const text = interactPromptText(obj("sb", "storyboard", 0, 0));
    expect(text.ko).toContain("콘티 보드");
    expect(text.en).toContain("storyboard");
  });

  it("화이트보드 프롬프트", () => {
    const text = interactPromptText(obj("wb", "whiteboard", 0, 0));
    expect(text.ko).toContain("X를 눌러");
    expect(text.en).toContain("Press X");
  });
});

describe("diffInteractFocus", () => {
  it("같은 오브젝트면 이벤트 없음", () => {
    const o = obj("a", "whiteboard", 0, 0);
    expect(diffInteractFocus(o, o, 100)).toHaveLength(0);
  });

  it("null → 오브젝트: prompt-shown", () => {
    const o = obj("a", "whiteboard", 0, 0);
    const events = diffInteractFocus(null, o, 100);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "prompt-shown", objectId: "a" });
  });

  it("오브젝트 → null: prompt-hidden", () => {
    const o = obj("a", "whiteboard", 0, 0);
    const events = diffInteractFocus(o, null, 100);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "prompt-hidden", objectId: "a" });
  });

  it("오브젝트 변경: hidden + shown", () => {
    const events = diffInteractFocus(
      obj("a", "whiteboard", 0, 0),
      obj("b", "youtube", 10, 10),
      100,
    );
    expect(events).toHaveLength(2);
    expect(events[0]!.kind).toBe("prompt-hidden");
    expect(events[1]!.kind).toBe("prompt-shown");
  });
});

describe("handleInteractKey", () => {
  it("포커스 없으면 null", () => {
    expect(handleInteractKey(null, 100)).toBeNull();
  });

  it("X키 → opened 이벤트 (kind 포함)", () => {
    const event = handleInteractKey(obj("sb", "storyboard", 0, 0), 100);
    expect(event).toMatchObject({
      kind: "opened",
      objectId: "sb",
      objectKind: "storyboard",
    });
  });
});
