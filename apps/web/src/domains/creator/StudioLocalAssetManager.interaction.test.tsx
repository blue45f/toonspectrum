// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLocalAssetManager, type StudioLocalAssetManagerProps } from "./StudioLocalAssetManager";
import type { StudioAsset } from "./studio-asset-library";

const assets: StudioAsset[] = ["a", "b"].map((id) => ({ id, name: `배경 ${id}`, dataUrl: "data:image/png;base64,AA==", width: 100, height: 100, createdAt: 1 }));
function props(): StudioLocalAssetManagerProps {
  return { assets, loading: false, onDeleteAsset: vi.fn(async () => undefined), onUseAsset: vi.fn(() => true), onOpen3d: vi.fn() };
}
afterEach(cleanup);
describe("local asset manager interactions", () => {
  it("requires confirmation and cancellation never touches storage", () => {
    const input = props(); render(<StudioLocalAssetManager {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "배경 a 삭제" }));
    expect(input.onDeleteAsset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(input.onDeleteAsset).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "1개 삭제 확인" })).toBeNull();
  });
  it("does not claim a swallowed failure was deleted", async () => {
    render(<StudioLocalAssetManager {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "배경 a 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "1개 삭제 확인" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("0개 삭제 완료"));
    expect(screen.getByRole("status").textContent).toContain("1개는 보관함에 남아");
  });
  it("reports removals reflected by authoritative parent state", async () => {
    function Harness() {
      const [rows, setRows] = useState(assets);
      return <StudioLocalAssetManager {...props()} assets={rows} onDeleteAsset={async (id) => { setRows((current) => current.filter((asset) => asset.id !== id)); }} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 2개 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "2개 삭제 확인" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2개 삭제 완료"));
    expect(screen.queryByRole("button", { name: "배경 a 삭제" })).toBeNull();
  });
  it("stops unstarted batch operations when the manager unmounts", async () => {
    let resolve!: () => void;
    const first = new Promise<void>((done) => { resolve = done; });
    const onDeleteAsset = vi.fn(() => first);
    const view = render(<StudioLocalAssetManager {...props()} onDeleteAsset={onDeleteAsset} />);
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 2개 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "2개 삭제 확인" }));
    expect(onDeleteAsset).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { resolve(); await first; });
    expect(onDeleteAsset).toHaveBeenCalledTimes(1);
  });
  it("shows errors and keeps deletion retryable", async () => {
    const onDeleteAsset = vi.fn(async () => { throw new Error("보관함 잠김"); });
    render(<StudioLocalAssetManager {...props()} onDeleteAsset={onDeleteAsset} />);
    fireEvent.click(screen.getByRole("button", { name: "배경 a 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "1개 삭제 확인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("보관함 잠김"));
    expect((screen.getByRole("button", { name: "배경 a 삭제" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("searches all assets rather than just the first rendered page", () => {
    const many = Array.from({ length: 501 }, (_, index) => ({ ...assets[0]!, id: `asset-${index}`, name: `배경 ${index}` }));
    render(<StudioLocalAssetManager {...props()} assets={many} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "내 에셋 이름 검색" }), { target: { value: "배경 500" } });
    expect(screen.getByRole("button", { name: "배경 500 삭제" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
  });
});
