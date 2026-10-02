// @vitest-environment jsdom
/**
 * 조립 스모크(jsdom): `composeCharacterLab()`이 만든 실제 런타임(실제 패널 전부·실제 스토어·실제 humanoid)을 `CharacterLabApp`으로 그려
 * 모든 인스펙터 탭이 던지지 않고 마운트되는지, 패널이 하나도 '미조립'으로 남지 않았는지, 엔진 선택 뒤 뷰포트가 엔진 상태를 보여주는지 확인한다.
 * 엔진은 모의 팩토리다(GPU·Babylon 없음) — 실제 렌더는 브라우저 검증 항목이다.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockEngine, createMockEngineFactory } from "../testing/mock-engine";

import { composeCharacterLab } from "./composition";
import { CharacterLabApp } from "./shell/CharacterLabApp";
import { INSPECTOR_TAB_IDS, INSPECTOR_TAB_LABELS_KO } from "./shell/ui-state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("app: 조립된 앱 스모크", () => {
  it("모든 인스펙터 탭이 실제 패널로 마운트되고 '미조립' 안내가 없다", async () => {
    // PackagePanel은 마운트 시 index.json을 fetch한다 — jsdom에는 서버가 없으므로 404를 돌려주는 fetch를 건다(실패는 패널 안에 사유로 표시된다).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const runtime = composeCharacterLab({ decideBackend: async (backend) => ({ ok: true, backend }), subdivisionLevels: 0 });
    render(<CharacterLabApp runtime={runtime} />);
    for (const tab of INSPECTOR_TAB_IDS) {
      // 슬롯 탭에도 같은 이름('표정' 등)이 있으므로 인스펙터 탭은 id로 찾는다
      const button = document.getElementById(`cl-tab-${tab}`);
      if (!button) throw new Error(`인스펙터 탭(${INSPECTOR_TAB_LABELS_KO[tab]})이 없습니다.`);
      await act(async () => {
        fireEvent.click(button);
      });
      // SlotPanel도 tabpanel 역할을 쓰므로 인스펙터 본문은 id로 찾는다
      const body = document.getElementById(`cl-tabpanel-${tab}`);
      if (!body) throw new Error(`인스펙터 본문(cl-tabpanel-${tab})이 없습니다.`);
      expect(body.querySelector("[data-missing-panel]")).toBeNull();
      expect(body.textContent?.length ?? 0).toBeGreaterThan(0);
    }
    expect(screen.getByRole("navigation", { name: "슬롯 레일(15칸)" })).toBeTruthy();
    runtime.dispose();
  });

  it("엔진을 명시 선택하면 뷰포트 캔버스로 엔진을 만들고 상태 배지·HUD 도구 막대를 보여준다", async () => {
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), subdivisionLevels: 0 });
    render(<CharacterLabApp runtime={runtime} />);
    // ViewportPane의 캔버스가 레지스트리에 등록돼 있어야 TopBar가 엔진을 만들 수 있다
    expect(screen.getByLabelText("캐릭터 뷰포트")).toBeInstanceOf(HTMLCanvasElement);
    expect(runtime.viewport.current()).toBe(screen.getByLabelText("캐릭터 뷰포트"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "WebGL2" }));
      await runtime.applyLoop.flush();
      await runtime.thumbnails.idle();
    });
    expect(factory.calls).toHaveLength(1);
    expect(factory.calls[0]?.canvas).toBe(screen.getByLabelText("캐릭터 뷰포트"));
    expect(runtime.store.getState().failures).toEqual([]);
    expect(runtime.store.getState().engine.phase).toBe("ready");
    expect(within(screen.getByRole("toolbar", { name: "뷰포트 도구" })).getByRole("button", { name: "전신" })).toBeTruthy();
    expect(engine.calls.map((call) => call.method)).toEqual(expect.arrayContaining(["loadSource", "applyPlan", "renderThumbnail"]));
    runtime.dispose();
  }, 60_000);
});
