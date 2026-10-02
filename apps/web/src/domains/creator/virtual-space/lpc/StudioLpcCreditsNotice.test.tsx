// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLpcCreditsNotice } from "./StudioLpcCreditsNotice";
import {
  STUDIO_LPC_CREDIT_AUTHORS,
  STUDIO_LPC_CREDITS_MARKDOWN_URL,
  STUDIO_LPC_CREDITS_URL,
  STUDIO_LPC_GENERATOR_URL,
  STUDIO_LPC_LICENSE_USES,
} from "./studio-lpc-characters";

const CREDITS_BODY = {
  version: 1,
  entries: [
    {
      id: "body-bodies-female", sourcePath: "body/bodies/female", chosenLicense: "OGA-BY 3.0",
      chosenLicenseUrl: "https://static.opengameart.org/OGA-BY-3.0.txt", authors: ["bluecarrot16", "Evert"],
      urls: ["https://opengameart.org/content/lpc-character-bases", "https://gitlab.com/vagabondgame/lpc-characters"],
    },
    {
      id: "hair-bob", sourcePath: "hair/bob", chosenLicense: "CC0",
      chosenLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", authors: ["Manuel Riecke (MrBeast)"],
      urls: ["https://opengameart.org/content/lpc-hair"],
    },
  ],
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 바깥 접힘을 펼친다. jsdom은 summary 클릭으로 open을 바꾸고 toggle 이벤트를 비동기로 보낸다. */
function openNotice(container: HTMLElement): HTMLDetailsElement {
  const details = container.querySelector<HTMLDetailsElement>("details.studio-lpc-credits");
  if (!details) throw new Error("크레딧 접힘 영역이 없습니다.");
  fireEvent.click(screen.getByText(/캐릭터 아트 출처·라이선스|Character art credits/u));
  return details;
}

describe("캐릭터 아트 크레딧 표기", () => {
  it("접힌 상태로 시작하고 펼치면 작가 전원·선택 라이선스·전체 출처·AI 초상화 표기를 보여 준다", () => {
    const { container } = render(<StudioLpcCreditsNotice />);
    const details = container.querySelector<HTMLDetailsElement>("details.studio-lpc-credits");
    expect(details?.open).toBe(false);
    expect(openNotice(container).open).toBe(true);

    const authors = container.querySelector(".studio-lpc-credits__authors")?.textContent ?? "";
    for (const author of STUDIO_LPC_CREDIT_AUTHORS) expect(authors).toContain(author);
    for (const use of STUDIO_LPC_LICENSE_USES) {
      const link = screen.getByRole("link", { name: use.license });
      expect(link.getAttribute("href")).toBe(use.url);
      expect(link.getAttribute("rel")).toContain("noopener");
    }
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toContain(STUDIO_LPC_CREDITS_MARKDOWN_URL);
    expect(hrefs).toContain(STUDIO_LPC_GENERATOR_URL);
    expect(container.textContent).toMatch(/AI로 생성한 이미지|AI-generated images/u);
    expect(container.textContent).toMatch(/OGA-BY 3\.0/u);
    // 새 탭으로 여는 링크는 모두 opener를 끊는다.
    for (const anchor of container.querySelectorAll("a[target='_blank']")) expect(anchor.getAttribute("rel")).toContain("noreferrer");
  });

  it("CREDITS.md는 브라우저가 화면에 열지 않으므로 내려받는 링크로 안내한다", () => {
    const { container } = render(<StudioLpcCreditsNotice />);
    openNotice(container);
    const link = screen.getByRole("link", { name: /CREDITS\.md/u });
    expect(link.getAttribute("href")).toBe(STUDIO_LPC_CREDITS_MARKDOWN_URL);
    expect(link.getAttribute("download")).toBe("CREDITS.md");
    expect(link.getAttribute("target")).toBeNull();
  });

  it("레이어별 목록은 따로 펼치기 전에는 내려받지 않는다(오프라인에서도 요약은 바로 보인다)", () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("요약 확인에는 네트워크가 필요 없다")));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<StudioLpcCreditsNotice />);
    openNotice(container);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("레이어별 전체 출처", () => {
  function openLayers(container: HTMLElement) {
    openNotice(container);
    fireEvent.click(screen.getByText(/레이어별 전체 출처 보기|Per-layer sources/u));
  }

  it("펼칠 때 한 번만 credits.json을 불러와 레이어·작가·선택 라이선스·원본 출처를 보여 주고, 다시 접었다 펼쳐도 다시 받지 않는다", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(CREDITS_BODY)));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<StudioLpcCreditsNotice />);
    openLayers(container);

    const list = await screen.findByRole("list", { name: /레이어별 출처|Per-layer sources/u });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(STUDIO_LPC_CREDITS_URL);
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(CREDITS_BODY.entries.length);
    expect(rows[0]?.textContent).toContain("body/bodies/female");
    expect(rows[0]?.textContent).toContain("bluecarrot16, Evert");
    expect(within(list).getByRole("link", { name: "CC0" }).getAttribute("href")).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    const source = within(list).getByRole("link", { name: "opengameart.org/content/lpc-character-bases" });
    expect(source.getAttribute("href")).toBe("https://opengameart.org/content/lpc-character-bases");
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");

    const layers = container.querySelector<HTMLDetailsElement>("details.studio-lpc-credits__layers");
    fireEvent.click(screen.getByText(/레이어별 전체 출처 보기|Per-layer sources/u));
    await waitFor(() => expect(layers?.open).toBe(false));
    fireEvent.click(screen.getByText(/레이어별 전체 출처 보기|Per-layer sources/u));
    await waitFor(() => expect(layers?.open).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("불러오지 못하면 안내를 알리고 다시 시도로 이어진다", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(CREDITS_BODY));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<StudioLpcCreditsNotice />);
    openLayers(container);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/불러오지 못했어요|Couldn't load/u);
    fireEvent.click(within(alert).getByRole("button", { name: /다시 시도|Try again/u }));
    expect(await screen.findByRole("list", { name: /레이어별 출처|Per-layer sources/u })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("서버 오류 응답이나 깨진 파일도 같은 안내로 처리하고 크레딧을 일부만 보여 주지 않는다", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ entries: [CREDITS_BODY.entries[0], { id: "broken" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<StudioLpcCreditsNotice />);
    openLayers(container);

    const first = await screen.findByRole("alert");
    fireEvent.click(within(first).getByRole("button", { name: /다시 시도|Try again/u }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole("alert")).textContent).toMatch(/불러오지 못했어요|Couldn't load/u);
    expect(screen.queryByRole("list", { name: /레이어별 출처|Per-layer sources/u })).toBeNull();
  });

  it("javascript: 같은 위험한 주소가 섞인 파일은 링크로 만들지 않는다", async () => {
    const hostile = { entries: [{ ...CREDITS_BODY.entries[0], urls: ["javascript:alert(1)"] }] };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(hostile))));
    const { container } = render(<StudioLpcCreditsNotice />);
    openLayers(container);
    await screen.findByRole("alert");
    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
  });
});
