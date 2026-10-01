import { describe, expect, it } from "vitest";
import {
  activateInteractableRuntime,
  advanceInteractableRuntime,
  createInteractableRuntime,
  diffInteractFocus,
  findNearestInteractable,
  handleInteractKey,
  interactableStateActionText,
  interactableStateNotice,
  interactPromptText,
  isInteractableStateKeyFor,
  STUDIO_COFFEE_BREW_MS,
  STUDIO_INTERACTABLE_OBJECT_REGISTRY,
  STUDIO_INTERACT_PROMPT_RADIUS,
  studioInteractableRegistryById,
  transitionInteractableState,
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

describe("가구형 오브젝트 상태 머신", () => {
  it("의자: empty ↔ occupied 토글", () => {
    expect(transitionInteractableState("chair", "chair:empty")).toBe("chair:occupied");
    expect(transitionInteractableState("chair", "chair:occupied")).toBe("chair:empty");
  });

  it("문: closed ↔ open 토글", () => {
    expect(transitionInteractableState("door", "door:closed")).toBe("door:open");
    expect(transitionInteractableState("door", "door:open")).toBe("door:closed");
  });

  it("게시판: unread → read (멱등)", () => {
    expect(transitionInteractableState("bulletin", "bulletin:unread")).toBe("bulletin:read");
    expect(transitionInteractableState("bulletin", "bulletin:read")).toBe("bulletin:read");
  });

  it("조명: off ↔ on 토글", () => {
    expect(transitionInteractableState("light-switch", "light:off")).toBe("light:on");
    expect(transitionInteractableState("light-switch", "light:on")).toBe("light:off");
  });

  it("커피머신: idle → brewing → ready → idle", () => {
    expect(transitionInteractableState("coffee-machine", "coffee:idle")).toBe("coffee:brewing");
    expect(transitionInteractableState("coffee-machine", "coffee:brewing")).toBe("coffee:brewing");
    expect(transitionInteractableState("coffee-machine", "coffee:ready")).toBe("coffee:idle");
  });

  it("미디어 오브젝트: closed ↔ open", () => {
    expect(transitionInteractableState("whiteboard", "media:closed")).toBe("media:open");
    expect(transitionInteractableState("whiteboard", "media:open")).toBe("media:closed");
  });

  it("추출 시간 경과로 brewing → ready 자동 전이", () => {
    const runtime = createInteractableRuntime("cm", "coffee-machine", 1000);
    const brewing = activateInteractableRuntime(runtime, 1000).runtime;
    expect(brewing.stateKey).toBe("coffee:brewing");
    expect(advanceInteractableRuntime(brewing, 1000 + STUDIO_COFFEE_BREW_MS - 1).stateKey).toBe("coffee:brewing");
    expect(advanceInteractableRuntime(brewing, 1000 + STUDIO_COFFEE_BREW_MS).stateKey).toBe("coffee:ready");
  });

  it("activate는 전이 결과와 알림을 함께 반환", () => {
    const runtime = createInteractableRuntime("door-1", "door", 1000);
    const { runtime: next, changed, notice } = activateInteractableRuntime(runtime, 1000);
    expect(changed).toBe(true);
    expect(next.stateKey).toBe("door:open");
    expect(notice.ko).toContain("열었어요");
    expect(notice.en).toContain("open");
  });

  it("상태 의존 액션 문구", () => {
    expect(interactableStateActionText("chair", "chair:empty")).toMatchObject({ ko: "앉기", en: "Sit down" });
    expect(interactableStateActionText("chair", "chair:occupied").ko).toBe("일어서기");
    expect(interactableStateActionText("light-switch", "light:on").ko).toBe("끄기");
    expect(interactableStateActionText("coffee-machine", "coffee:ready").ko).toBe("커피 가져가기");
    expect(interactableStateActionText("bulletin", "bulletin:unread").ko).toBe("읽기");
  });

  it("상태 키 유효성 검사", () => {
    expect(isInteractableStateKeyFor("chair", "chair:empty")).toBe(true);
    expect(isInteractableStateKeyFor("chair", "door:open")).toBe(false);
    expect(isInteractableStateKeyFor("light-switch", "light:on")).toBe(true);
    expect(isInteractableStateKeyFor("whiteboard", "media:open")).toBe(true);
    expect(isInteractableStateKeyFor("whiteboard", "whiteboard:x")).toBe(false);
  });

  it("신규 종류 프롬프트 문구", () => {
    expect(interactPromptText(obj("c", "chair", 0, 0)).ko).toContain("의자");
    expect(interactPromptText(obj("d", "door", 0, 0)).en).toContain("door");
    expect(interactPromptText(obj("b", "bulletin", 0, 0)).ko).toContain("게시판");
    expect(interactPromptText(obj("l", "light-switch", 0, 0)).ko).toContain("조명");
    expect(interactPromptText(obj("cm", "coffee-machine", 0, 0)).ko).toContain("커피");
  });

  it("상태 알림 문구는 ko/en 쌍을 가진다", () => {
    const notice = interactableStateNotice("coffee-machine", "coffee:ready");
    expect(notice.ko).toContain("준비됐어요");
    expect(notice.en.length).toBeGreaterThan(0);
  });
});

describe("STUDIO_INTERACTABLE_OBJECT_REGISTRY", () => {
  it("최소 8종의 오브젝트를 포함한다", () => {
    const kinds = new Set(STUDIO_INTERACTABLE_OBJECT_REGISTRY.map((entry) => entry.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  });

  it("id 조회가 동작한다", () => {
    const entry = studioInteractableRegistryById("lounge-coffee");
    expect(entry?.kind).toBe("coffee-machine");
    expect(entry?.labelKo).toContain("커피");
    expect(studioInteractableRegistryById("nope")).toBeNull();
  });
});
