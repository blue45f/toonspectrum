// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceClonePanel } from "./StudioVirtualSpaceClonePanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import {
  createTileEffect,
  type StudioTileEffectDefinition,
} from "./studio-virtual-space-tile-effects";
import type { StudioSpaceSnapshot } from "./studio-virtual-space-clone";

const writeText = vi.fn(async (_text: string) => undefined);
function mockClipboard() {
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
  writeText.mockClear();
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function twoTileEffects(): StudioTileEffectDefinition[] {
  const spawn = createTileEffect({ kind: "spawn", id: "spawn-1", name: "입구", tileX: 0, tileY: 0, width: 2, height: 2 });
  const zone = createTileEffect({ kind: "zone", id: "zone-1", tileX: 4, tileY: 4, width: 3, height: 3, zoneTag: "private" });
  if (!spawn.ok || !zone.ok) throw new Error("tile effect fixture is invalid");
  return [spawn.effect, zone.effect];
}

function renderPanel(
  onApplySnapshot: (snapshot: StudioSpaceSnapshot) => void = () => undefined,
  tileEffects?: readonly StudioTileEffectDefinition[],
) {
  render(<StudioVirtualSpaceClonePanel world={DEFAULT_STUDIO_WORLD_MANIFEST} tileEffects={tileEffects} disabled={false} onApplySnapshot={onApplySnapshot} />);
}

describe("StudioVirtualSpaceClonePanel", () => {
  it("does not offer link creation before a space name is entered", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "복제 링크 만들기" }).matches(":disabled")).toBe(true);
  });
  it("creates a clone link, shows it and copies it to the clipboard", async () => {
    mockClipboard();
    renderPanel();
    fireEvent.change(screen.getByLabelText("공간 이름"), { target: { value: "아카데미 기초 스페이스" } });
    fireEvent.click(screen.getByRole("button", { name: "복제 링크 만들기" }));
    const linkInput = await screen.findByLabelText("복제 링크");
    const link = (linkInput as HTMLInputElement).value;
    expect(link).toContain("#clone=");
    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    expect(await screen.findByText("복제 링크를 복사했습니다.")).toBeTruthy();
  });
  it("reports a copy failure instead of pretending it worked", async () => {
    mockClipboard();
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderPanel();
    fireEvent.change(screen.getByLabelText("공간 이름"), { target: { value: "아카데미 기초 스페이스" } });
    fireEvent.click(screen.getByRole("button", { name: "복제 링크 만들기" }));
    await screen.findByLabelText("복제 링크");
    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    expect(await screen.findByText("복사에 실패했습니다. 링크를 직접 선택해 복사하세요.")).toBeTruthy();
    expect(writeText).toHaveBeenCalledTimes(1);
  });
  it("previews a pasted link and hands the snapshot to the apply callback only after confirmation", async () => {
    mockClipboard();
    const applied: StudioSpaceSnapshot[] = [];
    renderPanel((snapshot) => { applied.push(snapshot); });
    fireEvent.change(screen.getByLabelText("공간 이름"), { target: { value: "팀 배포 스페이스" } });
    fireEvent.change(screen.getByLabelText("구성 작성자"), { target: { value: "툰스튜디오 팀" } });
    fireEvent.click(screen.getByRole("button", { name: "복제 링크 만들기" }));
    const link = (await screen.findByLabelText("복제 링크") as HTMLInputElement).value;

    fireEvent.change(screen.getByLabelText("복제 링크 붙여넣기"), { target: { value: link } });
    fireEvent.click(screen.getByRole("button", { name: "링크 확인" }));
    const preview = await screen.findByLabelText("가져오기 전 미리보기");
    expect(preview.textContent).toContain("팀 배포 스페이스");
    expect(preview.textContent).toContain("총 오브젝트");
    expect(preview.textContent).toContain("툰스튜디오 팀");
    const apply = screen.getByRole("button", { name: "이 구성 적용" });
    expect(apply.matches(":disabled")).toBe(true);
    fireEvent.click(apply);
    expect(applied).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /^현재 공간 초안이/u }));
    fireEvent.click(apply);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.name).toBe("팀 배포 스페이스");
    expect(applied[0]?.world.props).toHaveLength(DEFAULT_STUDIO_WORLD_MANIFEST.props.length);
    expect(screen.queryByLabelText("가져오기 전 미리보기")).toBeNull();
  });
  it("rejects an invalid pasted link without touching the apply callback", async () => {
    const applied: StudioSpaceSnapshot[] = [];
    renderPanel((snapshot) => { applied.push(snapshot); });
    fireEvent.change(screen.getByLabelText("복제 링크 붙여넣기"), { target: { value: "https://example.com/#clone=broken!!!" } });
    fireEvent.click(screen.getByRole("button", { name: "링크 확인" }));
    expect(await screen.findByText("링크를 해석하지 못했습니다. 복제 링크 전체를 붙여넣으세요.")).toBeTruthy();
    expect(screen.queryByLabelText("가져오기 전 미리보기")).toBeNull();
    expect(applied).toHaveLength(0);
  });
  it("cancels an import proposal without applying", async () => {
    mockClipboard();
    const applied: StudioSpaceSnapshot[] = [];
    renderPanel((snapshot) => { applied.push(snapshot); });
    fireEvent.change(screen.getByLabelText("공간 이름"), { target: { value: "취소 테스트" } });
    fireEvent.click(screen.getByRole("button", { name: "복제 링크 만들기" }));
    const link = (await screen.findByLabelText("복제 링크") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("복제 링크 붙여넣기"), { target: { value: link } });
    fireEvent.click(screen.getByRole("button", { name: "링크 확인" }));
    await screen.findByLabelText("가져오기 전 미리보기");
    fireEvent.click(screen.getByRole("button", { name: "가져오기 취소" }));
    expect(screen.queryByLabelText("가져오기 전 미리보기")).toBeNull();
    expect(applied).toHaveLength(0);
  });
  it("carries tile effects into the link and shows them in the import preview", async () => {
    mockClipboard();
    const applied: StudioSpaceSnapshot[] = [];
    renderPanel((snapshot) => { applied.push(snapshot); }, twoTileEffects());
    fireEvent.change(screen.getByLabelText("공간 이름"), { target: { value: "타일 효과 스페이스" } });
    fireEvent.click(screen.getByRole("button", { name: "복제 링크 만들기" }));
    const link = (await screen.findByLabelText("복제 링크") as HTMLInputElement).value;

    fireEvent.change(screen.getByLabelText("복제 링크 붙여넣기"), { target: { value: link } });
    fireEvent.click(screen.getByRole("button", { name: "링크 확인" }));
    const preview = await screen.findByLabelText("가져오기 전 미리보기");
    expect(preview.textContent).toContain("타일 효과");
    fireEvent.click(screen.getByRole("checkbox", { name: /^현재 공간 초안이/u }));
    fireEvent.click(screen.getByRole("button", { name: "이 구성 적용" }));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.tileEffects.map((effect) => effect.id)).toEqual(["spawn-1", "zone-1"]);
  });
  it("states that serialization stays on this device and no server is involved", () => {
    renderPanel();
    expect(screen.getByText("잘 만든 공간을 링크로 복제·공유합니다. 직렬화·역직렬화는 이 장치에서만 일어나며 서버에 전송되지 않습니다.")).toBeTruthy();
  });
});
