// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceAvatarDetailSection } from "./SpaceAvatarDetailSection";

// 커스터마이저 본체는 따로 테스트한다. 여기서는 펼칠 때만 마운트되는지만 본다.
vi.mock("./space-lazy-panels", async () => {
  const { createElement } = await import("react");
  return {
    StudioVirtualAvatarCustomizer: ({ identity }: { readonly identity: string }) => createElement("div", { "data-testid": "customizer" }, identity),
  };
});

afterEach(cleanup);

describe("SpaceAvatarDetailSection", () => {
  it("캐릭터 바로 아래에 세부 꾸미기와 캐릭터 아트 출처·라이선스를 함께 둔다(둘 다 접힌 채 시작)", () => {
    const { container } = render(<SpaceAvatarDetailSection identity="tester" />);
    expect(screen.getByText("아바타 세부 꾸미기")).toBeTruthy();
    expect(screen.getByText("캐릭터 아트 출처·라이선스")).toBeTruthy();
    const sections = [...container.querySelectorAll("details")];
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector<HTMLDetailsElement>("details.space-avatar-detail")?.open).toBe(false);
    expect(container.querySelector<HTMLDetailsElement>("details.studio-lpc-credits")?.open).toBe(false);
    expect(screen.queryByTestId("customizer")).toBeNull();
  });

  it("세부 꾸미기는 펼칠 때만 커스터마이저를 마운트하고, 크레딧은 그것과 독립적으로 펼쳐진다", async () => {
    const { container } = render(<SpaceAvatarDetailSection identity="tester" />);

    fireEvent.click(screen.getByText("캐릭터 아트 출처·라이선스"));
    expect(container.querySelector<HTMLDetailsElement>("details.studio-lpc-credits")?.open).toBe(true);
    expect(screen.getByRole("link", { name: "OGA-BY 3.0" })).toBeTruthy();
    expect(screen.queryByTestId("customizer")).toBeNull();

    fireEvent.click(screen.getByText("아바타 세부 꾸미기"));
    expect((await screen.findByTestId("customizer")).textContent).toBe("tester");

    fireEvent.click(screen.getByText("아바타 세부 꾸미기"));
    await waitFor(() => expect(screen.queryByTestId("customizer")).toBeNull());
    expect(container.querySelector<HTMLDetailsElement>("details.studio-lpc-credits")?.open).toBe(true);
  });
});
