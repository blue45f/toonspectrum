// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ManuscriptPinFeedback,
  ManuscriptPinFeedbackBridge,
  type ManuscriptPinFeedbackPin,
} from "./ManuscriptPinFeedback";
import {
  createEmptyStudioCommentsDocument,
  type StudioCommentsDocument,
} from "../studio-comments";
import { MANUSCRIPT_PIN_URGENT_PREFIX } from "./manuscript-pin-feedback-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makePin(overrides: Partial<ManuscriptPinFeedbackPin> = {}): ManuscriptPinFeedbackPin {
  return {
    id: "pin-1",
    x: 0.3,
    y: 0.4,
    status: "open",
    authorId: "user-1",
    authorName: "김작가",
    createdAt: "2026-09-30T00:00:00.000Z",
    threadId: "thread-1",
    replyCount: 0,
    number: 1,
    body: "이 부분 선이 어색해요",
    mentions: [],
    replies: [],
    ...overrides,
  };
}

function renderFeedback(overrides: Partial<React.ComponentProps<typeof ManuscriptPinFeedback>> = {}) {
  const handlers = {
    onAddPin: vi.fn(),
    onAddReply: vi.fn(),
    onToggleResolve: vi.fn(),
    onDeletePin: vi.fn(),
  };
  const utils = render(
    <ManuscriptPinFeedback
      imageSrc="https://example.com/manuscript.png"
      pageId="page-1"
      pins={[]}
      currentActorId="user-1"
      currentActorName="나"
      {...handlers}
      {...overrides}
    />,
  );
  return { ...utils, handlers };
}

describe("ManuscriptPinFeedback", () => {
  it("이미지가 없으면 빈 상태를 안내한다", () => {
    renderFeedback({ imageSrc: null });
    expect(screen.getByText(/원고 이미지를 불러오면/)).toBeTruthy();
  });

  it("이미지가 없으면 기존 빈 상태 일러스트 에셋을 재활용한다", () => {
    const { container } = renderFeedback({ imageSrc: null });
    const art = container.querySelector<HTMLImageElement>(".manuscript-pin-empty-art");
    expect(art?.getAttribute("src")).toBe("/images/empty-generic.webp");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
  });

  it("핀이 없으면 사이드바 빈 목록에 일러스트를 보여준다", () => {
    const { container } = renderFeedback({ pins: [] });
    const art = container.querySelector<HTMLImageElement>(".manuscript-pin-empty-list-art");
    expect(art?.getAttribute("src")).toBe("/images/empty-generic.webp");
  });

  it("핀을 숫자 뱃지와 상태로 렌더한다", () => {
    renderFeedback({
      pins: [
        makePin(),
        makePin({ id: "pin-2", number: 2, status: "urgent", x: 0.7, y: 0.2, body: "긴급 수정" }),
        makePin({ id: "pin-3", number: 3, status: "resolved", x: 0.5, y: 0.8, body: "완료" }),
      ],
    });
    expect(screen.getByRole("button", { name: /핀 1, 미해결/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /핀 2, 긴급/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /핀 3, 해결됨/ })).toBeTruthy();
  });

  it("핀 꽂기 모드에서 캔버스 클릭으로 핀을 꽂는다", () => {
    const { handlers, container } = renderFeedback();
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));

    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    // getBoundingClientRect 모킹 (jsdom은 0을 반환하므로)
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });

    // 작곡 팝오버가 열린다
    expect(screen.getByPlaceholderText(/이 위치에 대한 피드백/)).toBeTruthy();

    // 코멘트 입력 후 핀 꽂기
    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "여기 색감이 이상해요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));
    expect(handlers.onAddPin).toHaveBeenCalledWith({
      x: 0.3,
      y: 0.5,
      body: "여기 색감이 이상해요",
      urgent: false,
    });
  });

  it("빈 코멘트로는 핀을 꽂을 수 없다", () => {
    const { handlers, container } = renderFeedback();
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));
    expect(handlers.onAddPin).not.toHaveBeenCalled();
  });

  it("핀 클릭 시 스레드 팝오버가 열린다", () => {
    renderFeedback({ pins: [makePin()] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(screen.getByRole("dialog", { name: /핀 1 스레드/ })).toBeTruthy();
    // 사이드바 미리보기 + 팝오버 본문에 같은 텍스트가 표시된다
    expect(screen.getAllByText("이 부분 선이 어색해요").length).toBeGreaterThanOrEqual(1);
  });

  it("팝오버에서 답글을 달 수 있다", () => {
    const { handlers } = renderFeedback({ pins: [makePin()] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    fireEvent.change(screen.getByPlaceholderText(/답글을 입력/), {
      target: { value: "수정했습니다!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "답글" }));
    expect(handlers.onAddReply).toHaveBeenCalledWith("pin-1", "수정했습니다!");
  });

  it("팝오버에서 해결/다시 열기를 토글한다", () => {
    const { handlers } = renderFeedback({ pins: [makePin()] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    fireEvent.click(screen.getByRole("button", { name: "해결하기" }));
    expect(handlers.onToggleResolve).toHaveBeenCalledWith("pin-1");
  });

  it("해결된 핀은 다시 열기 버튼을 보여준다", () => {
    renderFeedback({ pins: [makePin({ status: "resolved" })] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 해결됨/ }));
    expect(screen.getByRole("button", { name: "다시 열기" })).toBeTruthy();
  });

  it("필터로 미해결/내 핀을 걸러낸다", () => {
    renderFeedback({
      pins: [
        makePin(),
        makePin({ id: "pin-2", number: 2, status: "resolved", authorId: "user-2", authorName: "이작가", body: "완료" }),
      ],
    });
    // 전체: 2개
    expect(screen.getAllByRole("button", { name: /핀 \d,/ })).toHaveLength(2);

    // 미해결 필터
    // @ts-expect-error - @testing-library/react v16 fireEvent.click overload issue with getByRole (pre-existing)
    fireEvent.click(screen.getByRole("button", { name: "미해결", exact: true }) as HTMLButtonElement);
    expect(screen.getAllByRole("button", { name: /핀 \d,/ })).toHaveLength(1);

    // 내 핀 필터
    fireEvent.click(screen.getByRole("button", { name: "내 핀" }));
    expect(screen.getAllByRole("button", { name: /핀 \d,/ })).toHaveLength(1);
  });

  it("사이드바 핀 클릭 시 해당 핀이 선택된다", () => {
    renderFeedback({ pins: [makePin(), makePin({ id: "pin-2", number: 2, body: "두 번째" })] });
    const items = screen.getAllByRole("button", { name: /핀 \d,/ });
    // 사이드바 아이템은 preview 텍스트를 포함한다
    const sidebarItem = screen.getByText("두 번째").closest("button") as HTMLElement;
    expect(sidebarItem).not.toBeNull();
    fireEvent.click(sidebarItem);
    expect(sidebarItem.getAttribute("data-selected")).toBe("true");
    expect(items.length).toBeGreaterThan(0);
  });

  it("미해결 개수를 사이드바에 표시한다", () => {
    renderFeedback({
      pins: [
        makePin(),
        makePin({ id: "pin-2", number: 2, status: "resolved", body: "완료" }),
      ],
    });
    expect(screen.getByText(/미해결 1개/)).toBeTruthy();
  });

  it("핀 목록이 비어 있으면 안내 문구를 보여준다", () => {
    renderFeedback({ pins: [] });
    expect(screen.getByText(/아직 핀이 없어요/)).toBeTruthy();
  });

  it("답글 목록을 팝오버에 표시한다", () => {
    renderFeedback({
      pins: [
        makePin({
          replies: [{ authorName: "이작가", body: "확인했습니다", createdAt: "2026-09-30T01:00:00.000Z" }],
          replyCount: 1,
        }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(screen.getByText("확인했습니다")).toBeTruthy();
  });

  it("Escape 키로 팝오버를 닫는다", () => {
    renderFeedback({ pins: [makePin()] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(screen.getByRole("dialog", { name: /핀 1 스레드/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /핀 1 스레드/ })).not.toBeTruthy();
  });

  it("줌 버튼으로 확대/축소한다", () => {
    const { container } = renderFeedback();
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    expect(canvas.style.transform).toContain("scale(1)");
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    expect(canvas.style.transform).toContain("scale(1.4)");
    fireEvent.click(screen.getByRole("button", { name: "축소" }));
    expect(canvas.style.transform).toContain("scale(1)");
  });

  it("멘션된 협업자를 팝오버에 칩으로 표시한다", () => {
    renderFeedback({ pins: [makePin({ mentions: ["이작가", "박편집"] })] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(screen.getByText("@이작가")).toBeTruthy();
    expect(screen.getByText("@박편집")).toBeTruthy();
  });

  it("멘션이 없으면 멘션 칩 영역을 렌더하지 않는다", () => {
    const { container } = renderFeedback({ pins: [makePin()] });
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(container.querySelector(".manuscript-pin-mentions")).toBeNull();
  });

  it("핀 작성 팝오버에 멘션 도움말을 보여준다", () => {
    const { container } = renderFeedback();
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });
    expect(screen.getByText(/@이름 으로 협업자를 멘션/)).toBeTruthy();
  });

  it("핀이 없을 때 배치 모드에서 3단계 가이드 도식을 보여준다", () => {
    const { container } = renderFeedback({ pins: [] });
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    expect(container.querySelector(".manuscript-pin-place-guide svg")).not.toBeNull();
  });

  it("핀이 이미 있으면 가이드 도식을 보여주지 않는다", () => {
    const { container } = renderFeedback({ pins: [makePin()] });
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    expect(container.querySelector(".manuscript-pin-place-guide")).toBeNull();
  });
});

describe("ManuscriptPinFeedbackBridge", () => {
  function mockCanvasRect(container: HTMLElement) {
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
  }

  function renderBridge(document: StudioCommentsDocument, onChange: (next: StudioCommentsDocument) => void) {
    return render(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={document}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );
  }

  it("긴급 핀은 문서를 거쳐도 urgent 상태를 유지한다", () => {
    let current = createEmptyStudioCommentsDocument();
    const onChange = vi.fn((next: StudioCommentsDocument) => {
      current = next;
    });
    const { container, rerender } = renderBridge(current, onChange);

    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    mockCanvasRect(container);
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });

    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "빨리 봐주세요" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "긴급" }));
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(current.threads).toHaveLength(1);
    expect(current.threads[0].body).toBe(`${MANUSCRIPT_PIN_URGENT_PREFIX}빨리 봐주세요`);

    // 새 문서로 다시 렌더하면 핀이 긴급 상태로 표시된다
    rerender(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={current}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );
    expect(screen.getByRole("button", { name: /핀 1, 긴급/ })).toBeTruthy();
  });

  it("긴급 표식 접두사는 UI에 노출되지 않는다", () => {
    let current = createEmptyStudioCommentsDocument();
    const onChange = vi.fn((next: StudioCommentsDocument) => {
      current = next;
    });
    const { container, rerender } = renderBridge(current, onChange);

    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    mockCanvasRect(container);
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });
    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "빨리 봐주세요" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "긴급" }));
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));

    rerender(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={current}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );

    // 사이드바 미리보기와 팝오버 본문에는 접두사 없이 표시된다
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 긴급/ }));
    expect(screen.queryByText(/\[긴급\]/)).toBeNull();
    expect(screen.getAllByText("빨리 봐주세요").length).toBeGreaterThanOrEqual(1);
  });

  it("@이름 멘션은 문서의 멘션 필드로 저장되고 팝오버에 칩으로 표시된다", () => {
    let current = createEmptyStudioCommentsDocument();
    const onChange = vi.fn((next: StudioCommentsDocument) => {
      current = next;
    });
    const { container, rerender } = renderBridge(current, onChange);

    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    mockCanvasRect(container);
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });
    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "@이작가 여기 봐주세요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));

    expect(current.threads).toHaveLength(1);
    expect(current.threads[0].mentions.map((mention) => mention.displayName)).toEqual(["이작가"]);

    rerender(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={current}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(screen.getByText("@이작가")).toBeTruthy();
  });

  it("팝오버에서 답글을 달면 문서에 답글이 추가된다", () => {
    let current = createEmptyStudioCommentsDocument();
    const onChange = vi.fn((next: StudioCommentsDocument) => {
      current = next;
    });
    const { container, rerender } = renderBridge(current, onChange);

    // 핀 추가
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    mockCanvasRect(container);
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });
    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "확인 부탁드려요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));
    expect(current.threads).toHaveLength(1);

    rerender(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={current}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );

    // 팝오버에서 답글
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    fireEvent.change(screen.getByPlaceholderText(/답글을 입력/), {
      target: { value: "수정했습니다!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "답글" }));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(current.threads[0].replies).toHaveLength(1);
    expect(current.threads[0].replies[0].body).toBe("수정했습니다!");
  });
});

describe("ManuscriptPinFeedback 추가 기능", () => {
  it("화살표 키로 캔버스를 패닝한다", () => {
    const { container } = renderFeedback();
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    expect(canvas.style.transform).toContain("translate(0px, 0px)");
    fireEvent.keyDown(canvas, { key: "ArrowLeft" });
    expect(canvas.style.transform).toContain("translate(40px, 0px)");
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(canvas.style.transform).toContain("translate(40px, -40px)");
  });

  it("화살표가 아닌 키는 패닝하지 않는다", () => {
    const { container } = renderFeedback();
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    fireEvent.keyDown(canvas, { key: "a" });
    expect(canvas.style.transform).toContain("translate(0px, 0px)");
  });

  it("기존 핀 근처에 꽂으면 겹침 경고를 보여준다", () => {
    const { container } = renderFeedback({ pins: [makePin({ x: 0.3, y: 0.4 })] });
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
    // 기존 핀(0.3, 0.4) 근처 (0.31, 0.41) 클릭
    fireEvent.click(canvas, { clientX: 310, clientY: 328 });
    expect(screen.getByText(/근처에 이미 핀이 있어요/)).toBeTruthy();
  });

  it("멀리 떨어진 위치에는 겹침 경고를 보여주지 않는다", () => {
    const { container } = renderFeedback({ pins: [makePin({ x: 0.1, y: 0.1 })] });
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.click(canvas, { clientX: 900, clientY: 700 });
    expect(screen.queryByText(/근처에 이미 핀이 있어요/)).toBeNull();
  });
});

describe("ManuscriptPinFeedbackBridge 삭제", () => {
  it("작성자는 자신의 핀을 삭제할 수 있다", () => {
    let current = createEmptyStudioCommentsDocument();
    const onChange = vi.fn((next: StudioCommentsDocument) => {
      current = next;
    });
    const { container, rerender } = render(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={current}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );
    const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    fireEvent.click(canvas, { clientX: 300, clientY: 400 });
    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "지울 핀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "핀 꽂기" }));
    expect(current.threads).toHaveLength(1);

    rerender(
      <ManuscriptPinFeedbackBridge
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        document={current}
        onChange={onChange}
        currentActor={{ id: "user-1", displayName: "나" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(current.threads).toHaveLength(0);
  });

  it("다른 작성자의 핀에는 삭제 버튼이 없다", () => {
    const { container } = render(
      <ManuscriptPinFeedback
        imageSrc="https://example.com/manuscript.png"
        pageId="page-1"
        pins={[
          {
            id: "pin-9",
            x: 0.5,
            y: 0.5,
            status: "open",
            authorId: "other-user",
            authorName: "다른작가",
            createdAt: "2026-09-30T00:00:00.000Z",
            threadId: "thread-9",
            replyCount: 0,
            number: 1,
            body: "남의 핀",
            mentions: [],
            replies: [],
          },
        ]}
        currentActorId="user-1"
        currentActorName="나"
        onAddPin={vi.fn()}
        onAddReply={vi.fn()}
        onToggleResolve={vi.fn()}
        onDeletePin={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /핀 1, 미해결/ }));
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
  });
});
