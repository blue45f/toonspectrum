import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPendingStrokeAdmissionQueue } from "./studio-pending-stroke-admission";

import type { DrawEl } from "../studio-element-model";
import type { StudioPendingStrokeScope } from "./studio-pending-stroke-admission";

const scope: StudioPendingStrokeScope = { documentKey: "doc", pageId: "page", generation: 1 };
function stroke(id: string): DrawEl {
  return { id, type: "draw", mode: "pen", kind: "freehand", brush: "watercolor", points: [1, 2], pressures: [0.17], tiltXs: [12], tiltYs: [-20], sampleTimeOffsets: [0], stroke: "#112233", strokeWidth: 23 };
}

describe("같은 provider의 입력 준비 대기열", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("준비 전의 좌표·필압·기울기와 브러시를 유지하고 준비되면 한 번만 재개한다", () => {
    let ready = false;
    const admit = vi.fn(() => ready);
    const recover = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => "a" });
    queue.defer({ stroke: stroke("a"), scope, admit, recover });
    queue.update({ ...stroke("a"), points: [1, 2, 3, 4], pressures: [0.17, 0.91], tiltXs: [12, 45], tiltYs: [-20, 5], sampleTimeOffsets: [0, 17] });
    vi.advanceTimersByTime(32);
    expect(queue.has("a")).toBe(true);
    ready = true;
    vi.advanceTimersByTime(32);
    expect(admit).toHaveBeenLastCalledWith(expect.objectContaining({ points: [1, 2, 3, 4], pressures: [0.17, 0.91], tiltXs: [12, 45], tiltYs: [-20, 5], sampleTimeOffsets: [0, 17], brush: "watercolor", strokeWidth: 23 }), false, undefined);
    const calls = admit.mock.calls.length;
    vi.advanceTimersByTime(1_000);
    expect(admit).toHaveBeenCalledTimes(calls);
    expect(queue.size).toBe(0);
    expect(recover).not.toHaveBeenCalled();
    queue.dispose();
  });

  it("여러 완성 획은 입력 순서로 기존 finish 경로에 한 번씩 전달한다", () => {
    let ready = false;
    const completed: string[] = [];
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    for (const id of ["a", "b", "c"]) {
      queue.defer({ stroke: stroke(id), scope, recover: vi.fn(), admit: (source, complete) => {
        if (!ready) return false;
        expect(complete).toBe(true);
        completed.push(source.id);
        return true;
      } });
      queue.complete(stroke(id));
    }
    vi.advanceTimersByTime(64);
    expect(completed).toEqual([]);
    ready = true;
    vi.advanceTimersByTime(256);
    expect(completed).toEqual(["a", "b", "c"]);
    expect(queue.size).toBe(0);
    queue.dispose();
  });

  it.each(["pageId", "generation", "documentKey"] as const)("%s가 바뀌면 다른 문서에 넣지 않고 원래 복구 콜백에 보관한다", (field) => {
    let current = scope;
    const recover = vi.fn();
    const admit = vi.fn(() => true);
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => current, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("a"), scope, admit, recover });
    queue.complete(stroke("a"));
    current = { ...scope, [field]: field === "generation" ? 2 : "other" };
    queue.pump();
    expect(admit).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
    expect(queue.size).toBe(0);
    queue.dispose();
  });

  it("실패와 시간 초과에는 다른 provider로 바꾸지 않고 완성 획 전부를 보관한다", () => {
    const recover = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null, timeoutMs: 100 });
    for (let index = 0; index < 12; index += 1) {
      queue.defer({ stroke: stroke(String(index)), scope, admit: () => false, recover });
      queue.complete(stroke(String(index)));
    }
    vi.advanceTimersByTime(1_000);
    expect(recover).toHaveBeenCalledTimes(12);
    expect(queue.size).toBe(0);
    queue.dispose();
  });

  it("다른 접촉을 수집하는 동안 과거 획 재생이 현재 샘플러를 덮지 않는다", () => {
    const admit = vi.fn(() => true);
    let active: string | null = "new";
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => active });
    queue.defer({ stroke: stroke("old"), scope, admit, recover: vi.fn() });
    queue.complete(stroke("old"));
    queue.pump();
    expect(admit).not.toHaveBeenCalled();
    active = null;
    queue.pump();
    expect(admit).toHaveBeenCalledOnce();
    queue.dispose();
  });

  it("완료 원본은 후속 샘플 변화와 분리하며 원래 release 콜백을 한 번 전달한다", () => {
    const source = stroke("a");
    const finish = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: source, scope, recover: vi.fn(), admit: (saved, complete, release) => {
      expect(saved.points).toEqual([1, 2]);
      expect(complete).toBe(true);
      release?.();
      return true;
    } });
    queue.complete(source, finish);
    source.points.push(3, 4);
    vi.advanceTimersByTime(128);
    expect(finish).toHaveBeenCalledOnce();
    queue.dispose();
  });

  it("provider 예외와 편집기 종료는 원본을 복구하고 타이머를 남기지 않는다", () => {
    const recover = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("failed"), scope, recover, admit: () => { throw new Error("worker failed"); } });
    queue.defer({ stroke: stroke("closing"), scope, recover, admit: () => false });
    queue.pump();
    expect(recover).toHaveBeenCalledWith(expect.objectContaining({ id: "failed" }), "worker failed");
    queue.dispose();
    expect(recover).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenLastCalledWith(expect.objectContaining({ id: "closing" }), expect.stringContaining("편집기가 닫혀"));
    vi.advanceTimersByTime(100_000);
    expect(recover).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });


  it("기존 Worker 초기화 허용 시간 동안 기다린 완성 획도 준비 후 자동 재생한다", () => {
    let ready = false;
    const recover = vi.fn();
    const accepted: string[] = [];
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("slow-worker"), scope, recover, admit: (saved) => {
      if (!ready) return false;
      accepted.push(saved.id);
      return true;
    } });
    queue.complete(stroke("slow-worker"));
    vi.advanceTimersByTime(29_000);
    expect(queue.size).toBe(1);
    expect(recover).not.toHaveBeenCalled();
    ready = true;
    vi.advanceTimersByTime(32);
    expect(accepted).toEqual(["slow-worker"]);
    queue.dispose();
  });


  it("완성 입력을 admission 전에 체크포인트로 보내고 수락 뒤 한 번만 확정 통보한다", () => {
    const calls: string[] = [];
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("durable"), scope, recover: vi.fn(),
      checkpoint: (saved) => { expect(saved.points).toEqual([1, 2]); calls.push("checkpoint"); },
      admit: () => { calls.push("admit"); return true; },
      settled: (_saved, accepted) => { expect(accepted).toBe(true); calls.push("accepted"); },
    });
    queue.complete(stroke("durable"));
    expect(calls).toEqual(["checkpoint"]);
    queue.pump();
    queue.dispose();
    expect(calls).toEqual(["checkpoint", "admit", "accepted"]);
  });

});
