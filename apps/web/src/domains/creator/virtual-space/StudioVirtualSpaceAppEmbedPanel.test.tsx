// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceAppEmbedPanel } from "./StudioVirtualSpaceAppEmbedPanel";
import { createTileEffect, type StudioTileEffectOf } from "./studio-virtual-space-tile-effects";

function appEffect(input: Parameters<typeof createTileEffect>[0]): StudioTileEffectOf<"app"> {
  const result = createTileEffect(input);
  if (!result.ok) throw new Error(`생성 실패: ${JSON.stringify(result.errors)}`);
  if (result.effect.kind !== "app") throw new Error("app 이펙트가 아닙니다");
  return result.effect;
}

afterEach(cleanup);

describe("StudioVirtualSpaceAppEmbedPanel", () => {
  it("내장 타이머는 시계와 프리셋·시작 버튼을 렌더한다", () => {
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "toonstudio://timer" });
    render(<StudioVirtualSpaceAppEmbedPanel effect={effect} worldId="world-1" onClose={vi.fn()} />);
    expect(screen.getByRole("timer").textContent).toBe("25:00");
    expect(screen.getByRole("button", { name: "5분" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "10분" }));
    expect(screen.getByRole("timer").textContent).toBe("10:00");
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(screen.getByRole("button", { name: "일시정지" })).not.toBeNull();
  });

  it("닫기 버튼은 onClose를 호출한다", () => {
    const onClose = vi.fn();
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "toonstudio://timer" });
    render(<StudioVirtualSpaceAppEmbedPanel effect={effect} worldId="world-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "앱 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("외부 URL은 항상 샌드박스 iframe으로 열리고 API 안내가 갈린다", () => {
    const locked = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "https://example.com/tool" });
    const { container, unmount } = render(<StudioVirtualSpaceAppEmbedPanel effect={locked} worldId="world-1" onClose={vi.fn()} />);
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(screen.getByText("이 앱은 샌드박스 안에서만 열려요. 스페이스 정보에는 접근할 수 없어요.")).not.toBeNull();
    unmount();

    const api = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "https://example.com/tool", allowApi: true });
    const second = render(<StudioVirtualSpaceAppEmbedPanel effect={api} worldId="world-1" onClose={vi.fn()} />);
    expect(second.container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(screen.getByText("이 앱은 스페이스 정보를 읽을 수 있어요 (postMessage 브리지).")).not.toBeNull();
  });

  it("해석할 수 없는 대상은 아무것도 렌더하지 않는다", () => {
    const effect = appEffect({ kind: "app", tileX: 0, tileY: 0, url: "toonstudio://timer" });
    const ghost = { ...effect, url: "toonstudio://nope" };
    const { container } = render(<StudioVirtualSpaceAppEmbedPanel effect={ghost} worldId="world-1" onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
