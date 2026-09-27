/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { Script } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(new NodeUrl("../../public/offline-draw/bootstrap.js", import.meta.url), "utf8");

function start(): void {
  new Script(source).runInNewContext({ document, location, window, navigator,
    MutationObserver, setTimeout, clearTimeout, requestIdleCallback: vi.fn() });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", vi.fn());
  history.replaceState(null, "", "/studio/character");
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(async () => {
  let root = document.getElementById("root");
  if (!root) {
    root = document.createElement("div"); root.id = "root"; document.body.append(root);
  }
  root.append(document.createElement("main"));
  await Promise.resolve();
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("늦은 Studio 시작과 긴급 복구 안내", () => {
  it("정상 작업면이 늦게 나타나면 터치를 가리던 긴급 안내를 제거한다", async () => {
    start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.getElementById("toon-local-recovery")).not.toBeNull();
    document.getElementById("root")?.append(document.createElement("main"));
    await Promise.resolve();
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("이미 정상 시작했으면 긴급 안내 타이머가 남지 않는다", async () => {
    document.getElementById("root")?.append(document.createElement("main"));
    start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("타이머 전에 시작한 작업면에는 안내가 나타나지 않는다", async () => {
    start();
    await vi.advanceTimersByTimeAsync(9_000);
    document.getElementById("root")?.append(document.createElement("main"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("Studio 외부 경로에는 복구 안내를 만들지 않는다", async () => {
    history.replaceState(null, "", "/");
    start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });
});
