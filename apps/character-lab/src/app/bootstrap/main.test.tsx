// @vitest-environment jsdom
/**
 * 부트스트랩 진입점(main.tsx) 검증: 모듈을 import하는 것이 곧 앱 시작이므로 조립 모듈을 `vi.doMock`으로 바꿔 가며
 * 모듈 레지스트리를 비우고 다시 import한다. 조립 실패가 빈 화면이 아니라 원인 화면이 되는지, 정상 조립이 셸을 그리는지,
 * root 요소가 없으면 조용히 넘어가지 않고 throw하는지를 확인한다(무음 실패 금지).
 */
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { failVisible } from "../../contracts";

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  cleanup();
  vi.doUnmock("../composition");
  document.body.innerHTML = "";
});

async function startApp(): Promise<void> {
  await act(async () => {
    await import("./main");
  });
}

describe("app/bootstrap/main", () => {
  it("조립이 CatalogInvariantError로 실패하면 위반 목록을 알림 화면으로 보여준다(빈 화면 금지)", async () => {
    // 모듈 레지스트리를 비운 뒤라 앱이 로드하는 클래스와 같은 인스턴스를 동적 import로 얻어야 `instanceof`가 성립한다.
    const { CatalogInvariantError } = await import("../shell/catalog-registry");
    const error = new CatalogInvariantError([failVisible("catalog-slot-min", "슬롯 hair의 프리셋이 부족합니다.", undefined, 0)]);
    vi.doMock("../composition", () => ({
      composeCharacterLab: () => {
        throw error;
      },
    }));
    await startApp();
    expect(screen.getByRole("alert").textContent).toContain("프리셋 카탈로그 불변식 위반");
    expect(screen.getByText("[catalog-slot-min] 슬롯 hair의 프리셋이 부족합니다.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "슬롯 레일(15칸)" })).toBeNull();
  });

  it("영역 모듈 초기화 오류는 오류 이름·메시지를 그대로 보여준다", async () => {
    vi.doMock("../composition", () => ({
      composeCharacterLab: () => {
        throw new RangeError("세분 단계가 범위를 벗어났습니다.");
      },
    }));
    await startApp();
    expect(screen.getByRole("alert").textContent).toContain("앱 조립 실패: RangeError");
    expect(screen.getByRole("alert").textContent).toContain("세분 단계가 범위를 벗어났습니다.");
  });

  it("정상 조립이면 엔진을 만들지 않은 채 셸 골격(슬롯 레일·인스펙터)을 그린다", async () => {
    const { createMockRuntime } = await import("../../testing/mock-runtime");
    const mock = createMockRuntime();
    vi.doMock("../composition", () => ({ composeCharacterLab: () => mock.runtime }));
    await startApp();
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio Character Lab" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "슬롯 레일(15칸)" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "인스펙터" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    // 엔진은 TopBar에서 사용자가 명시 선택하기 전까지 만들지 않는다
    expect(mock.factory.calls).toHaveLength(0);
    expect(mock.engine.calls).toHaveLength(0);
    mock.runtime.dispose();
  });

  it("root 요소가 없으면 import 시점에 throw한다(저장소 앱 부트스트랩 공통 메시지, 빈 화면으로 넘어가지 않는다)", async () => {
    document.body.innerHTML = "";
    await expect(import("./main")).rejects.toThrow("Character Lab root element was not found");
  });
});
