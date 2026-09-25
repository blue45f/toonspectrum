// @vitest-environment jsdom
import type Konva from "konva";
import { createStudioCatalogInputRecoveryRepository, serializeStudioCatalogInputRecovery, restoreStudioCatalogInputRecovery, parseStudioCatalogInputRecovery } from "./studio-pending-catalog-input-persistence";

import { describe, expect, it, vi } from "vitest";
import { StudioPendingCatalogInput, type StudioCatalogInputGesture } from "./studio-pending-catalog-input";

function pointer(type: string, overrides: Partial<PointerEvent> = {}): PointerEvent {
  const event = new Event(type);
  Object.defineProperties(event, Object.fromEntries(Object.entries({
    pointerId: 7, pointerType: "pen", isPrimary: true, button: 0, buttons: 1,
    clientX: 20, clientY: 30, pressure: 0.6, tiltX: 18, tiltY: -7, twist: 37,
    timeStamp: 12, getCoalescedEvents: () => [], ...overrides,
  }).map(([key, value]) => [key, { value, configurable: true }])));
  return event as PointerEvent;
}
function setup() {
  const content = document.createElement("div");
  content.setPointerCapture = vi.fn();
  content.releasePointerCapture = vi.fn();
  let offset = 0;
  const stage = { getContent: () => content, getAbsoluteTransform: () => ({ copy: () => {
    const captured = offset;
    return { invert: () => ({ point: ({ x, y }: { x: number; y: number }) => ({ x: x - captured, y }) }) };
  } }) } as unknown as Konva.Stage;
  const notify = vi.fn();
  const queue = new StudioPendingCatalogInput(notify);
  const select = (phase: "preparing" | "applied" | "failed", requestId = "r") => queue.selection({ requestId, catalogId: "new-brush", phase });
  return { queue, stage, notify, content, select, setOffset: (value: number) => { offset = value; } };
}

describe("카탈로그 브러시 준비 입력", () => {
  it("활성화 전에는 생성하지 않고 원본 배치·센서·좌표계를 선택한 브러시에 전달한다", () => {
    const f = setup();
    f.select("preparing");
    f.queue.capture({ pointer: pointer("pointerdown"), stage: f.stage, scope: "doc/page/1", ownerScope: "owner", touchDraw: false });
    f.setOffset(10);
    const hardware = pointer("pointermove", { clientX: 41, timeStamp: 18, pressure: 0.75 });
    window.dispatchEvent(pointer("pointermove", { clientX: 45, timeStamp: 20, getCoalescedEvents: () => [hardware] }));
    window.dispatchEvent(pointer("pointermove", { pointerId: 99, clientX: 999 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 999, pressure: 0, buttons: 0 }));
    f.setOffset(500);
    const replay = vi.fn((_gesture: StudioCatalogInputGesture) => "stroke-id");
    f.queue.replayReady("new-brush", "doc/page/1", replay);
    expect(replay).not.toHaveBeenCalled();
    f.select("applied");
    f.queue.replayReady("old-brush", "doc/page/1", replay);
    expect(replay).not.toHaveBeenCalled();
    f.queue.replayReady("new-brush", "doc/page/1", replay);
    const gesture = replay.mock.calls[0]![0];
    expect(gesture.catalogId).toBe("new-brush");
    expect(gesture.start.mapper.pointFor(gesture.start.pointer)).toEqual({ x: 20, y: 30 });
    expect(gesture.moves).toHaveLength(1);
    const sample = gesture.moves[0]!.pointer.getCoalescedEvents()[0]!;
    expect(sample).toMatchObject({ clientX: 41, timeStamp: 18, pressure: 0.75, tiltX: 18, tiltY: -7, twist: 37 });
    expect(gesture.moves[0]!.mapper.pointFor(sample)).toEqual({ x: 31, y: 30 });
    expect(gesture.end?.type).toBe("pointerup");
    expect(gesture.endMapper?.pointFor(gesture.end!)).toEqual({ x: 989, y: 30 });
    f.queue.replayReady("new-brush", "doc/page/1", replay);
    expect(replay).toHaveBeenCalledOnce();
    f.queue.dispose();
  });

  it("실패한 준비 입력을 보관하고 동일 브러시 재선택 때 한 번만 재시도한다", () => {
    const f = setup();
    f.select("preparing");
    f.queue.capture({ pointer: pointer("pointerdown"), stage: f.stage, scope: "s", ownerScope: "owner", touchDraw: false });
    window.dispatchEvent(pointer("pointerup"));
    f.select("failed");
    const replay = vi.fn(() => "stroke-id");
    f.queue.replayReady("new-brush", "s", replay);
    expect(replay).not.toHaveBeenCalled();
    f.select("preparing", "retry");
    f.select("applied", "retry");
    f.queue.replayReady("new-brush", "s", replay);
    expect(replay).toHaveBeenCalledOnce();
    f.queue.dispose();
  });

  it("진행 중 prefix는 정상 transport로 넘기고 새 캡처를 해제하지 않는다", () => {
    const f = setup();
    f.select("preparing");
    f.queue.capture({ pointer: pointer("pointerdown"), stage: f.stage, scope: "s", ownerScope: "owner", touchDraw: false });
    window.dispatchEvent(pointer("pointermove"));
    f.select("applied");
    let handedOff: StudioCatalogInputGesture | undefined;
    f.queue.replayReady("new-brush", "s", (gesture) => { handedOff = gesture; return "stroke-id"; });
    expect(handedOff?.end).toBeNull();
    expect(f.content.releasePointerCapture).not.toHaveBeenCalled();
    window.dispatchEvent(pointer("pointermove"));
    expect(handedOff?.moves).toHaveLength(1);
    f.queue.dispose();
  });

  it("문서 세대 변경은 다른 페이지에 적용하지 않고 명시적으로 종료한다", () => {
    const f = setup();
    f.select("preparing");
    f.queue.capture({ pointer: pointer("pointerdown"), stage: f.stage, scope: "old", ownerScope: "owner", touchDraw: false });
    f.select("applied");
    const replay = vi.fn(() => "stroke-id");
    f.queue.replayReady("new-brush", "new", replay);
    expect(replay).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledWith(expect.stringContaining("문서가 바뀌어"));
    f.queue.dispose();
  });
});

it("원래 소유 문서의 SQLite 원본을 재시작 후 같은 좌표·센서로 복구한다", async () => {
  const f = setup();
  f.select("preparing");
  f.queue.capture({ pointer: pointer("pointerdown"), stage: f.stage, scope: "generation-1", ownerScope: "owner-doc-page", touchDraw: false });
  window.dispatchEvent(pointer("pointermove", { clientX: 77, timeStamp: 29, pressure: 0.83 }));
  window.dispatchEvent(pointer("pointercancel", { buttons: 0, pressure: 0 }));
  f.select("applied");
  let source!: StudioCatalogInputGesture;
  f.queue.replayReady("new-brush", "generation-1", (gesture) => { source = gesture; return false; });
  const rows = new Map<string, string>();
  const store = { get: async (key: string) => rows.get(key) ?? null, set: async (key: string, value: string) => { rows.set(key, value); }, delete: async (key: string) => { rows.delete(key); } };
  await createStudioCatalogInputRecoveryRepository(store).save(serializeStudioCatalogInputRecovery(source));
  const records = await createStudioCatalogInputRecoveryRepository(store).load("owner-doc-page");
  const restored = restoreStudioCatalogInputRecovery(records[0]!, f.stage, "generation-2");
  expect(restored.ownerScope).toBe("owner-doc-page");
  expect(restored.moves[0]!.mapper.pointFor(restored.moves[0]!.pointer)).toEqual({ x: 77, y: 30 });
  expect(restored.moves[0]!.pointer).toMatchObject({ pressure: 0.83, tiltX: 18, timeStamp: 29 });
  expect(restored.end?.type).toBe("pointercancel");
  expect(restored.endMapper?.pointFor(restored.end!)).toEqual({ x: 20, y: 30 });
  expect(() => parseStudioCatalogInputRecovery(rows.get("owner-doc-page")!, "another-owner")).toThrow();
  f.queue.dispose();
});
