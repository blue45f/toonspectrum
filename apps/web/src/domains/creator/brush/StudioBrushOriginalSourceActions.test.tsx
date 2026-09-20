// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBrushOriginalSourceActions } from "./StudioBrushOriginalSourceActions";
import { createStudioBrushOriginalSource } from "./studio-brush-original-source";

const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../export/studio-export", () => ({ downloadBlob: download }));
afterEach(() => { cleanup(); download.mockReset(); });

describe("original source download UI", () => {
  it("offers an explicit original download distinct from edited settings", () => {
    const source = createStudioBrushOriginalSource(new Uint8Array([1, 2, 3]), "original.kpp", "kpp");
    const error = vi.fn();
    render(<StudioBrushOriginalSourceActions source={source} name="내 브러시" onError={error} />);
    expect(screen.getByText(/이후 Studio 편집은 원본 파일에 반영되지 않습니다/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "내 브러시 가져온 원본 다운로드" }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![0].size).toBe(3);
    expect(download.mock.calls[0]![1]).toBe("original.kpp");
    expect(error).not.toHaveBeenCalled();
  });
  it("reports corrupt provenance and never offers a substitute file", () => {
    const source = createStudioBrushOriginalSource(new Uint8Array([1, 2, 3]), "original.myb", "myb");
    const error = vi.fn();
    render(<StudioBrushOriginalSourceActions source={{ ...source, sha256: "0".repeat(64) }} name="손상" onError={error} />);
    fireEvent.click(screen.getByRole("button", { name: "손상 가져온 원본 다운로드" }));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("원본"));
    expect(download).not.toHaveBeenCalled();
  });
});
