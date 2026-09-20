// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBrushLibraryPanel } from "./StudioBrushLibraryPanel";
import { createBrush, DEFAULT_STUDIO_BRUSH_SNAPSHOT, importBrushFromJson, type StudioSavedBrush } from "./studio-brush-library";
import { createMemorySessionBrushLibraryRepository } from "./studio-brush-library-sqlite-repository";
import { createStudioBrushOriginalSource, decodeStudioBrushOriginalSource } from "./studio-brush-original-source";

const calls = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../export/studio-export", () => ({ downloadBlob: calls.download }));
afterEach(() => { cleanup(); calls.download.mockReset(); });
const bytes = new TextEncoder().encode(' {"version":3,"unknown":"preserve"}\r\n');
async function contents(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject; reader.readAsArrayBuffer(blob);
  });
}
async function setup() {
  const saved = { ...createBrush("원본 펜", DEFAULT_STUDIO_BRUSH_SNAPSHOT),
    originalSource: createStudioBrushOriginalSource(bytes, "original.myb", "myb") };
  const repository = createMemorySessionBrushLibraryRepository(); await repository.put(saved);
  const factory = async () => ({ authority: "memory-session" as const, repository, migration: null });
  function Host() {
    const [brushes, setBrushes] = useState<StudioSavedBrush[]>([saved]);
    return <StudioBrushLibraryPanel brushes={brushes} currentSnapshot={{ ...DEFAULT_STUDIO_BRUSH_SNAPSHOT, strokeWidth: 44 }}
      onBrushesChange={setBrushes} onApplyBrush={() => undefined} onBrushDeleted={() => undefined} repositoryFactory={factory} />;
  }
  render(<Host />);
  await waitFor(() => expect(screen.getByText(/가져온 원본 보존/u)).toBeTruthy());
  const details = screen.getByText("관리 · 덮어쓰기, 복제, 공유").closest("details")!; details.open = true;
  return { saved, repository };
}
describe("original source actions in the actual library panel", () => {
  it("exports original bytes separately from current Studio settings", async () => {
    const { saved, repository } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "원본 펜 원본 파일 내보내기" }));
    await waitFor(() => expect(calls.download).toHaveBeenCalledTimes(1));
    expect(calls.download.mock.calls[0]![1]).toBe("original.myb");
    expect(Array.from(new Uint8Array(await contents(calls.download.mock.calls[0]![0])))).toEqual(Array.from(bytes));
    fireEvent.click(screen.getByRole("button", { name: "원본 펜 브러시를 지금 설정으로 덮어쓰기" }));
    await waitFor(async () => expect((await repository.getById(saved.id))?.strokeWidth).toBe(44));
    fireEvent.click(screen.getByRole("button", { name: "원본 펜 내보내기" }));
    await waitFor(() => expect(calls.download).toHaveBeenCalledTimes(2));
    const archived = importBrushFromJson(new TextDecoder().decode(await contents(calls.download.mock.calls[1]![0]))).brush;
    expect(archived.strokeWidth).toBe(44);
    expect(Array.from(decodeStudioBrushOriginalSource(archived.originalSource))).toEqual(Array.from(bytes));
    expect(screen.getByText(/원본 보존은 원본 엔진/u)).toBeTruthy();
  });
});
