// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioVirtualSpacePanel } from "./StudioVirtualSpaceOnDemandPanel";
import { StudioVirtualSpacePanelGate } from "./StudioVirtualSpacePanelGate";

afterEach(cleanup);

describe("선택 패널의 명시적 재시도", () => {
  it("가져오기 실패 후 열린 월드의 상태를 유지하고 사용자 요청으로만 재시도한다", async () => {
    const load = vi.fn<() => Promise<{ default: () => React.JSX.Element }>>()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValue({ default: () => <p>패널 준비됨</p> });
    const Panel = createStudioVirtualSpacePanel(load);
    function World() {
      const [count, setCount] = useState(0);
      return <button type="button" onClick={() => setCount(count + 1)}>월드 이동 {count}</button>;
    }
    const view = render(<><World /><StudioVirtualSpacePanelGate active={false}><Panel /></StudioVirtualSpacePanelGate></>);
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "월드 이동 0" }));
    view.rerender(<><World /><StudioVirtualSpacePanelGate active><Panel /></StudioVirtualSpacePanelGate></>);
    await screen.findByRole("alert");
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "월드 이동 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "월드 이동 1" }));
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "패널 다시 불러오기" }));
    await screen.findByText("패널 준비됨");
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "월드 이동 2" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
