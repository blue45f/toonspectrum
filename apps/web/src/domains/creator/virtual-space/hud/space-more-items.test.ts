import { describe, expect, it, vi } from "vitest";

import { spaceMoreItems, type SpaceMoreItemActions } from "./space-more-items";

function actions() {
  return {
    openPanel: vi.fn<SpaceMoreItemActions["openPanel"]>(),
    openSeats: vi.fn<() => void>(), openSearch: vi.fn<() => void>(), capturePhoto: vi.fn<() => void>(),
    unstuck: vi.fn<() => void>(), openHelp: vi.fn<() => void>(), exit: vi.fn<() => void>(),
  };
}

describe("spaceMoreItems", () => {
  it("프로젝트 데스크톱 메뉴는 작업 도구와 연결 진단을 두고 도크에 있는 대화·꾸미기·나가기는 뺀다", () => {
    const ids = spaceMoreItems({ personal: false, desktop: true }, actions()).map((item) => item.id);
    expect(ids).toEqual(["today", "work", "sessions", "board", "annotation", "team", "seats", "town", "places", "search", "photo", "settings", "rtc", "unstuck", "help"]);
  });

  it("개인 모바일 메뉴는 프로젝트 도구를 숨기고 좁은 도크에 없는 대화·꾸미기·나가기를 넣는다", () => {
    const items = spaceMoreItems({ personal: true, desktop: false }, actions());
    expect(items.map((item) => item.id)).toEqual(["seats", "town", "places", "search", "chat", "build", "photo", "settings", "unstuck", "help", "exit"]);
    expect(items.find((item) => item.id === "seats")?.labelKo).toBe("내 작업 자리로 걷기");
  });

  it("항목을 고르면 해당 패널이나 동작만 실행한다", () => {
    const handlers = actions();
    const items = spaceMoreItems({ personal: false, desktop: false }, handlers);
    items.find((item) => item.id === "work")?.onSelect();
    items.find((item) => item.id === "search")?.onSelect();
    items.find((item) => item.id === "exit")?.onSelect();
    expect(handlers.openPanel).toHaveBeenCalledExactlyOnceWith("work");
    expect(handlers.openSearch).toHaveBeenCalledOnce();
    expect(handlers.exit).toHaveBeenCalledOnce();
    expect(handlers.capturePhoto).not.toHaveBeenCalled();
  });
});
