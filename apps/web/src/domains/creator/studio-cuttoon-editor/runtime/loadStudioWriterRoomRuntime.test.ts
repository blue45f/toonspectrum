import { describe, expect, it, vi } from "vitest";

import { createStudioWriterRoomRuntimeLoader } from "./loadStudioWriterRoomRuntime";

type Runtime = Awaited<ReturnType<ReturnType<typeof createStudioWriterRoomRuntimeLoader>>>;
const runtime: Runtime = {
  createEmptyStudioWriterRoomDocument: vi.fn(),
  normalizeStudioWriterRoomDocument: vi.fn(),
  replaceStudioWriterRoomStage: vi.fn(),
};

describe("작가방 런타임 청크 수명주기", () => {
  it("동시 요청과 성공 후 재요청에서 같은 Promise와 런타임을 공유한다", async () => {
    const importer = vi.fn(async () => runtime);
    const load = createStudioWriterRoomRuntimeLoader(importer);
    const first = load();
    expect(load()).toBe(first);
    expect(await first).toBe(runtime);
    expect(load()).toBe(first);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("실패는 호출자에게 전파하고 다음 요청에서 다시 로드한다", async () => {
    const error = new Error("chunk unavailable");
    const importer = vi.fn<() => Promise<Runtime>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(runtime);
    const load = createStudioWriterRoomRuntimeLoader(importer);
    const first = load();
    expect(load()).toBe(first);
    await expect(first).rejects.toBe(error);
    const retry = load();
    expect(retry).not.toBe(first);
    expect(await retry).toBe(runtime);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("동기 로더 실패도 거부된 Promise로 전달하고 재시도를 허용한다", async () => {
    const importer = vi.fn<() => Promise<Runtime>>()
      .mockImplementationOnce(() => { throw new Error("load failed"); })
      .mockResolvedValueOnce(runtime);
    const load = createStudioWriterRoomRuntimeLoader(importer);
    await expect(load()).rejects.toThrow("load failed");
    expect(await load()).toBe(runtime);
  });
});
