import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSeekableMediaAsset } from "./seekable-media-asset";

const options = () => ({ signal: new AbortController().signal, maxBytes: 16, mediaType: "audio" as const });
afterEach(() => vi.unstubAllGlobals());
describe("공개 미디어를 탐색 가능한 파일로 준비", () => {
  it("Range 없는 200 응답도 완전한 Blob으로 준비한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("sound", { headers: { "content-type": "audio/mp4", "content-length": "5" } }));
    vi.stubGlobal("fetch", fetcher);
    const blob = await fetchSeekableMediaAsset("/brand/test.m4a?v=1", options());
    expect(blob.type).toBe("audio/mp4");
    expect(await blob.text()).toBe("sound");
    expect(fetcher).toHaveBeenCalledWith("/brand/test.m4a?v=1", expect.objectContaining({ credentials: "same-origin" }));
  });
  it.each(["/api/private", "https://example.com/file.m4a", "//example.com/brand/file.m4a"])("공개 자산 범위 밖의 주소를 거부한다: %s", async (source) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fetchSeekableMediaAsset(source, options())).rejects.toThrow("Unexpected public media path");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ status: 206, type: "audio/mp4" }, { status: 200, type: "text/html" }, { status: 503, type: "audio/mp4" }])("부분 응답·HTML·오류 응답을 성공으로 처리하지 않는다", async ({ status, type }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("data", { status, headers: { "content-type": type } })));
    await expect(fetchSeekableMediaAsset("/brand/test.m4a", options())).rejects.toThrow("unexpected format");
  });
  it("헤더 크기 제한을 확인한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("large", { headers: { "content-type": "audio/mp4", "content-length": "1000" } })));
    await expect(fetchSeekableMediaAsset("/brand/test.m4a", options())).rejects.toThrow("preparation limit");
  });
  it("크기 헤더가 없어도 스트림 누적 제한을 확인한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(17), { headers: { "content-type": "audio/mp4" } })));
    await expect(fetchSeekableMediaAsset("/brand/test.m4a", options())).rejects.toThrow("stream exceeds");
  });
  it("빈 파일과 잘린 파일을 거부한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { headers: { "content-type": "audio/mp4" } })));
    await expect(fetchSeekableMediaAsset("/brand/test.m4a", options())).rejects.toThrow("empty");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("cut", { headers: { "content-type": "audio/mp4", "content-length": "5" } })));
    await expect(fetchSeekableMediaAsset("/brand/test.m4a", options())).rejects.toThrow("incomplete");
  });
  it("취소된 준비 결과를 재생에 넘기지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sound", { headers: { "content-type": "audio/mp4" } })));
    const controller = new AbortController(); controller.abort();
    await expect(fetchSeekableMediaAsset("/brand/test.m4a", { ...options(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
