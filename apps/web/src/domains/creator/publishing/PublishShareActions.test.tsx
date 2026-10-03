// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishShareActions } from "./PublishShareActions";

import { TOONSPECTRUM_SHARE_EVENT, type ShareEventDetail } from "@/shared/lib/share";

const kakao = vi.hoisted(() => ({ configured: false, share: vi.fn() }));
vi.mock("@/shared/lib/kakao-share", () => ({
  isKakaoShareConfigured: () => kakao.configured,
  shareWithKakao: kakao.share,
}));

const props = { workId: "work-1", title: "가을밤 산책", description: "비 오는 거리의 한 컷", imageUrl: "/cover.png" } as const;

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

function stubWebShare(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
}

function isShareDetail(value: unknown): value is ShareEventDetail {
  return typeof value === "object" && value !== null && "channel" in value && "outcome" in value;
}

function shareEvents(): ShareEventDetail[] {
  const events: ShareEventDetail[] = [];
  window.addEventListener(TOONSPECTRUM_SHARE_EVENT, (event) => {
    if (event instanceof CustomEvent && isShareDetail(event.detail)) events.push(event.detail);
  });
  return events;
}

beforeEach(() => {
  kakao.configured = false;
  kakao.share.mockReset();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

describe("PublishShareActions", () => {
  it("공개된 작품은 공유 주소를 보여 주고 링크를 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const events = shareEvents();
    render(<PublishShareActions kind="published" {...props} />);

    const section = screen.getByRole("region", { name: "공유하기" });
    const address = within(section).getByRole("textbox", { name: "공유 주소" });
    expect(address).toHaveProperty("readOnly", true);
    // 보이는 주소와 클립보드에 들어가는 주소가 같다.
    const shown = (address as HTMLInputElement).value;
    expect(shown).toContain("/create/work-1");
    expect(shown).toContain("utm_source=copy");

    fireEvent.click(within(section).getByRole("button", { name: "링크 복사" }));
    await waitFor(() => expect(within(section).getByRole("status").textContent).toContain("링크를 복사했어요"));
    expect(writeText).toHaveBeenCalledWith(shown);
    expect(within(section).getByRole("button", { name: "복사됨" })).toBeTruthy();
    expect(events.some((event) => event.channel === "copy" && event.outcome === "completed")).toBe(true);
  });

  it("클립보드가 막히면 거짓 성공 대신 직접 복사하도록 알리고 주소를 선택해 둔다", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    render(<PublishShareActions kind="published" {...props} />);
    const address = screen.getByRole("textbox", { name: "공유 주소" }) as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("복사 권한이 없어요"));
    expect(screen.queryByRole("button", { name: "복사됨" })).toBeNull();
    expect(address.selectionEnd).toBeGreaterThan(0);
  });

  it("카카오톡은 앱 키가 설정된 배포에서만 보이고, 실패하면 링크 복사로 안내한다", async () => {
    render(<PublishShareActions kind="published" {...props} />);
    expect(screen.queryByRole("button", { name: "카카오톡" })).toBeNull();
    cleanup();

    kakao.configured = true;
    kakao.share.mockRejectedValueOnce(new Error("sdk"));
    render(<PublishShareActions kind="published" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "카카오톡" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("카카오톡 공유를 열지 못했어요"));
    expect(kakao.share).toHaveBeenCalledWith(expect.objectContaining({ title: "가을밤 산책", url: "/create/work-1" }));

    kakao.share.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "카카오톡" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("카카오톡 공유 창을 열었어요"));
  });

  it("기기 공유는 브라우저가 지원할 때만 보이고, 취소는 오류로 알리지 않는다", async () => {
    render(<PublishShareActions kind="published" {...props} />);
    expect(screen.queryByRole("button", { name: "기기 공유" })).toBeNull();
    cleanup();

    const share = vi.fn().mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    stubWebShare(share);
    render(<PublishShareActions kind="published" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "기기 공유" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "가을밤 산책", url: expect.stringContaining("/create/work-1") }));
    expect(screen.getByRole("status").textContent).toBe("");
    // 취소로 끝나면 보내는 중 표시가 풀려 다시 누를 수 있다.
    await waitFor(() => expect(screen.getByRole("button", { name: "기기 공유" })).toHaveProperty("disabled", false));

    share.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "기기 공유" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("공유 창에서 보냈어요"));
  });

  it("나머지 채널·QR은 공용 공유 창으로 잇는다", () => {
    render(<PublishShareActions kind="published" {...props} />);
    expect(screen.getByRole("button", { name: /다른 방법·QR/u })).toBeTruthy();
  });

  it.each([
    ["scheduled", /예약한 시각에 공개되면 공유 링크가 열려요/u],
    ["private", /비공개 작품은 링크가 열리지 않아 공유할 수 없어요/u],
    ["draft", /초안은 아직 공개되지 않았어요/u],
  ] as const)("%s 결과에는 열리지 않는 링크 대신 이유와 다음 행동을 알린다", (kind, reason) => {
    render(<PublishShareActions kind={kind} {...props} />);
    const section = screen.getByRole("region", { name: "공유하기" });
    expect(within(section).getByText(reason)).toBeTruthy();
    expect(within(section).queryByRole("textbox")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(section.getAttribute("data-publish-share")).toBe(kind);
  });

  it("제목이 비어 있어도 공유 대상 이름을 만든다", () => {
    kakao.configured = true;
    render(<PublishShareActions kind="published" workId="a/b" title="  " />);
    fireEvent.click(screen.getByRole("button", { name: "카카오톡" }));
    expect(kakao.share).toHaveBeenCalledWith(expect.objectContaining({ title: "창작 작품", url: "/create/a%2Fb" }));
  });
});
