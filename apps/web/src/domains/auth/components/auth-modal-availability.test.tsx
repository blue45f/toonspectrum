// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthModal } from "./auth-modal";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ signIn: vi.fn() }));
vi.mock("./google-identity-button", () => ({ GoogleIdentityButton: () => null }));

const unavailable = "로그인 서비스를 확인하지 못했어요. 일시적인 연결 문제나 서비스 점검 중일 수 있어요. 잠시 후 다시 확인해 주세요.";
const kakao = { kakao: { label: "카카오", mode: "oauth", redirectAvailable: true } };
const naver = { naver: { label: "네이버", mode: "oauth", redirectAvailable: true } };
const response = (payload: unknown) => ({ ok: true, json: async () => payload });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  await act(async () => { await Promise.resolve(); });
}

describe("AuthModal service availability", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("503을 이메일 로그인 가능으로 안내하지 않고 수동 재조회로 회복한다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(response(kakao));
    render(<AuthModal onClose={vi.fn()} />);
    await screen.findByText(unavailable);
    expect(screen.queryByText(/이메일 로그인은 계속 사용할 수/)).toBeNull();
    expect(screen.queryByRole("button", { name: "카카오로 계속하기" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/providers", expect.objectContaining({
      cache: "no-store", credentials: "same-origin", signal: expect.anything(),
    }));
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await screen.findByRole("button", { name: "카카오로 계속하기" });
    expect(screen.queryByText(unavailable)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("응답이 없는 요청을 15초에 중단하고 늦은 응답은 재시도 결과를 덮지 않는다", async () => {
    vi.useFakeTimers();
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(kakao));
    render(<AuthModal onClose={vi.fn()} />);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText(unavailable)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await settle();
    expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toBeTruthy();
    await act(async () => { pending.resolve(response(naver)); });
    expect(screen.queryByRole("button", { name: "네이버로 계속하기" })).toBeNull();
    expect(screen.getByRole("button", { name: "카카오로 계속하기" })).toBeTruthy();
  });

  it("헤더 뒤 JSON 본문이 멈춰도 조회가 무한 로딩에 빠지지 않는다", async () => {
    vi.useFakeTimers();
    const body = deferred<unknown>();
    fetchMock.mockResolvedValue({ ok: true, json: () => body.promise });
    render(<AuthModal onClose={vi.fn()} />);
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText(unavailable)).toBeTruthy();
    await act(async () => { body.resolve(naver); });
    expect(screen.queryByRole("button", { name: "네이버로 계속하기" })).toBeNull();
    expect(screen.getByText(unavailable)).toBeTruthy();
  });

  it.each(["online", "focus", "visibilitychange"])("실패 후 %s 복귀에서 한 번만 재조회한다", async (event) => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response(kakao));
    render(<AuthModal onClose={vi.fn()} />);
    await screen.findByText(unavailable);
    act(() => {
      (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    await screen.findByRole("button", { name: "카카오로 계속하기" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("닫힌 모달의 요청과 타이머 및 복귀 이벤트를 정리한다", async () => {
    vi.useFakeTimers();
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    const view = render(<AuthModal onClose={vi.fn()} />);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve(response(naver));
      await vi.advanceTimersByTimeAsync(30_000);
      window.dispatchEvent(new Event("online"));
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("200 HTML 또는 손상된 JSON은 제공자가 없는 정상 응답으로 오인하지 않는다", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("HTML response"); } });
    render(<AuthModal onClose={vi.fn()} />);
    await screen.findByText(unavailable);
    expect(screen.getByRole("button", { name: "다시 확인" })).toBeTruthy();
  });
});

describe("실제 가입 응답 형태의 복구 동선", () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const fillSignup = () => {
    for (const [name, value] of Object.entries({ name: "소재 검증", email: "material-qa@example.test", password: "fixture-only-password-long-enough" })) {
      const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) throw new Error(`가입 입력 누락: ${name}`);
      fireEvent.change(input, { target: { value } });
    }
  };
  it("503에서 입력과 회원가입 모드를 유지하고 성공 재시도 후에만 인증 안내로 이동한다", async () => {
    let signupCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/auth/providers")) return response(kakao);
      signupCount += 1;
      return new Response(JSON.stringify(signupCount === 1
        ? { statusCode: 503, message: "Request could not be completed", requestId: "qa-request" }
        : { ok: true, verificationRequired: true, message: "가입 확인 메일을 확인해 주세요." }), { status: signupCount === 1 ? 503 : 201 });
    });
    const close = vi.fn();
    render(<AuthModal initialMode="signup" onClose={close} />);
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: "가입하고 시작" }));
    await screen.findByText(/가입·이메일 인증 서비스를 일시적으로 이용할 수 없어요/u);
    expect(screen.getByRole("tab", { name: "회원가입" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')?.value).toBe("fixture-only-password-long-enough");
    expect(document.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("material-qa@example.test");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "가입하고 시작" }));
    await screen.findByText("가입 확인 메일을 확인해 주세요.");
    expect(signupCount).toBe(2);
    expect(screen.getByRole("tab", { name: "로그인" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')?.value).toBe("");
    expect(close).not.toHaveBeenCalled();
  });
  it("손상된 200 응답을 가입 성공으로 안내하거나 입력을 지우지 않는다", async () => {
    fetchMock.mockImplementation(async (url: string) => String(url).endsWith("/auth/providers")
      ? response(kakao) : new Response("<html>upstream error</html>", { status: 200 }));
    render(<AuthModal initialMode="signup" onClose={vi.fn()} />);
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: "가입하고 시작" }));
    await screen.findByText(/메일 발송 여부를 알 수 없어요/u);
    expect(screen.getByRole("tab", { name: "회원가입" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("가입 확인 메일을 확인해 주세요.")).toBeNull();
  });
});
