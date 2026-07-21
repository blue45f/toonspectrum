// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addStudioCommentThread,
  createEmptyStudioCommentsDocument,
} from "./studio-comments";
import {
  projectStudioCanvasCommentPins,
  STUDIO_LIVE_PARTICIPANT_COLORS,
  studioLiveParticipantColor,
} from "./studio-live-canvas-overlay-model";
import {
  StudioLiveCanvasOverlay,
  StudioLivePresenceDock,
  StudioRemoteCursorOverlay,
} from "./StudioLiveCanvasOverlay";

import type { StudioLiveSyncSnapshot } from "./studio-live-sync-safety";

const noop = () => undefined;

afterEach(() => cleanup());

function syncedSnapshot(
  overrides: Partial<StudioLiveSyncSnapshot> = {}
): StudioLiveSyncSnapshot {
  return {
    phase: "synced",
    pendingCount: 0,
    persistenceDurability: "durable",
    transportReady: true,
    operationSyncReady: true,
    lastAckAt: 1_000,
    lastAckServerSequence: "9",
    editsDurablyProtected: true,
    message: "팀 원고가 실시간으로 동기화됩니다.",
    mode: "server",
    ...overrides,
  };
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16) / 255
  );
  const linear = [red, green, blue].map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function commentsFixture() {
  const actor = { id: "user-1", displayName: "민지" };
  const first = addStudioCommentThread(
    createEmptyStudioCommentsDocument(),
    {
      id: "thread-page",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "페이지 호흡 확인",
    },
    new Date("2026-07-13T00:00:00.000Z")
  );
  const second = addStudioCommentThread(
    first,
    {
      id: "thread-element-1",
      anchor: { type: "element", pageId: "page-1", elementId: "element-1" },
      author: actor,
      body: "표정 확인",
    },
    new Date("2026-07-13T00:01:00.000Z")
  );
  return addStudioCommentThread(
    second,
    {
      id: "thread-element-2",
      anchor: { type: "element", pageId: "page-1", elementId: "element-1" },
      author: actor,
      body: "말풍선 간격 확인",
    },
    new Date("2026-07-13T00:02:00.000Z")
  );
}

describe("StudioLiveCanvasOverlay", () => {
  it("groups unresolved threads by anchor and follows element bounds without changing comment data", () => {
    const document = commentsFixture();
    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 800,
      canvasHeight: 1_200,
      boundsByElementId: new Map([
        ["element-1", { x: 120, y: 260, width: 300, height: 180 }],
      ]),
    });

    expect(pins).toHaveLength(2);
    expect(pins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 1, x: 24, y: 24 }),
        expect.objectContaining({
          count: 2,
          x: 420,
          y: 260,
          previewAuthor: "민지",
          previewBody: "말풍선 간격 확인",
        }),
      ])
    );
    expect(document.threads).toHaveLength(3);
  });

  it("omits orphaned object anchors and clamps pins to the visible canvas", () => {
    const document = commentsFixture();
    const pins = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 200,
      canvasHeight: 160,
      boundsByElementId: new Map([
        ["element-1", { x: 190, y: -40, width: 80, height: 20 }],
      ]),
    });

    expect(pins.find((pin) => pin.anchor.type === "element")).toMatchObject({ x: 200, y: 0 });
    const withoutTarget = projectStudioCanvasCommentPins({
      threads: document.threads,
      pageId: "page-1",
      canvasWidth: 200,
      canvasHeight: 160,
      boundsByElementId: new Map(),
    });
    expect(withoutTarget).toHaveLength(1);
    expect(withoutTarget[0].anchor.type).toBe("page");
  });

  it("renders normalized remote cursors and accessible comment pins without exposing session ids", () => {
    const privateSessionId = "private-session-id-never-render";
    const html = renderToStaticMarkup(
      <StudioLiveCanvasOverlay
        canvasWidth={800}
        canvasHeight={1_200}
        cursors={[
          {
            participant: {
              sessionId: privateSessionId,
              displayName: "서윤 · 이 탭",
              role: "editor",
            },
            cursor: { x: 0.25, y: 0.75, pageId: "page-1", tool: "pen" },
            updatedAt: 1,
          },
        ]}
        commentPins={[
          {
            key: "page:page-1",
            anchor: { type: "page", pageId: "page-1" },
            count: 3,
            unreadCount: 2,
            previewAuthor: "민지",
            previewBody: "말풍선 간격을 조금 더 넓혀 주세요.",
            label: "1페이지",
            x: 400,
            y: 120,
          },
        ]}
        onCommentPinClick={noop}
      />
    );

    expect(html).toContain("공동작업 캔버스 오버레이");
    expect(html).toContain("left:25%");
    expect(html).toContain("top:75%");
    expect(html).toContain("서윤 · 이 탭");
    expect(html).toContain("· pen");
    expect(html).toContain("1페이지, 읽지 않은 댓글 2개, 열림 댓글 3개");
    expect(html).toContain("size-11");
    expect(html).toContain("size-8");
    expect(html).toContain("ring-accent/30");
    expect(html).toContain('data-studio-comment-pin="true"');
    expect(html).not.toContain('data-studio-comment-pin-preview="true"');
    expect(html).not.toContain("말풍선 간격을 조금 더 넓혀 주세요.");
    expect(html).not.toContain("border-white");
    expect(html).not.toContain("0.03_270");
    expect(html).toContain("clamp(1.375rem, calc(50.0000% + 0px), calc(100% - 1.375rem))");
    expect(html).not.toContain(privateSessionId);
    expect(html).not.toContain("page:page-1");
  });

  it("mounts only the active pin preview and removes it after pointer leave", () => {
    const onCommentQuickReplyPreload = vi.fn();
    render(
      <StudioLiveCanvasOverlay
        canvasWidth={800}
        canvasHeight={1_200}
        cursors={[]}
        commentPins={[{
          key: "page:page-1",
          anchor: { type: "page", pageId: "page-1" },
          count: 1,
          unreadCount: 0,
          previewAuthor: "민지",
          previewBody: "말풍선 간격을 조금 더 넓혀 주세요.",
          label: "1페이지",
          x: 400,
          y: 120,
        }]}
        onCommentPinClick={noop}
        onCommentQuickReplyPreload={onCommentQuickReplyPreload}
      />
    );

    const pin = screen.getByRole("button", { name: /1페이지/u });
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).toBeNull();
    fireEvent.pointerEnter(pin);
    expect(onCommentQuickReplyPreload).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')?.textContent)
      .toContain("말풍선 간격을 조금 더 넓혀 주세요.");
    fireEvent.pointerLeave(pin);
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).toBeNull();
    fireEvent.focus(pin);
    expect(onCommentQuickReplyPreload).toHaveBeenCalledTimes(2);
  });

  it("suppresses the hover preview while a controlled quick reply is active", () => {
    const onCommentQuickReplyPreload = vi.fn();
    const props = {
      canvasWidth: 800,
      canvasHeight: 1_200,
      cursors: [],
      commentPins: [{
        key: "page:page-1",
        anchor: { type: "page" as const, pageId: "page-1" },
        count: 1,
        previewAuthor: "민지",
        previewBody: "빠른 답글과 겹치지 않아야 합니다.",
        label: "1페이지",
        x: 400,
        y: 120,
      }],
      onCommentPinClick: noop,
      onCommentQuickReplyPreload,
    };
    const { rerender } = render(<StudioLiveCanvasOverlay {...props} />);
    const pin = screen.getByRole<HTMLButtonElement>("button", { name: /1페이지/u });

    fireEvent.pointerEnter(pin);
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).not.toBeNull();

    rerender(<StudioLiveCanvasOverlay {...props} commentQuickReplyActive />);
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).toBeNull();
    fireEvent.pointerEnter(pin);
    fireEvent.focus(pin);
    expect(onCommentQuickReplyPreload).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).toBeNull();

    rerender(<StudioLiveCanvasOverlay {...props} commentQuickReplyActive={false} />);
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).toBeNull();
    fireEvent.pointerEnter(pin);
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')?.textContent)
      .toContain("빠른 답글과 겹치지 않아야 합니다.");
  });

  it("moves keyboard focus across nearby pins without opening every thread", async () => {
    const onCommentPinClick = vi.fn();
    render(
      <StudioLiveCanvasOverlay
        canvasWidth={800}
        canvasHeight={1_200}
        cursors={[]}
        commentPins={[
          {
            key: "first",
            anchor: { type: "point", pageId: "page-1", x: 0.2, y: 0.2 },
            count: 1,
            previewAuthor: "민지",
            previewBody: "첫 번째 댓글",
            label: "첫 번째 핀",
            x: 160,
            y: 240,
          },
          {
            key: "second",
            anchor: { type: "point", pageId: "page-1", x: 0.4, y: 0.4 },
            count: 1,
            previewAuthor: "서윤",
            previewBody: "두 번째 댓글",
            label: "두 번째 핀",
            x: 320,
            y: 480,
          },
          {
            key: "last",
            anchor: { type: "point", pageId: "page-1", x: 0.6, y: 0.6 },
            count: 1,
            threadIds: ["thread-old", "thread-unread"],
            newestThreadId: "thread-old",
            newestUnreadThreadId: "thread-unread",
            previewAuthor: "지호",
            previewBody: "마지막 댓글",
            label: "마지막 핀",
            x: 480,
            y: 720,
          },
        ]}
        onCommentPinClick={onCommentPinClick}
      />
    );

    const first = screen.getByRole<HTMLButtonElement>("button", { name: /첫 번째 핀/u });
    const second = screen.getByRole<HTMLButtonElement>("button", { name: /두 번째 핀/u });
    const last = screen.getByRole<HTMLButtonElement>("button", { name: /마지막 핀/u });
    expect(first.getAttribute("aria-keyshortcuts")).toContain("ArrowRight");

    first.focus();
    await waitFor(() => {
      expect(document.querySelector('[data-studio-comment-pin-preview="true"]')?.textContent)
        .toContain("첫 번째 댓글");
    });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "End" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Escape" });
    expect(document.querySelector('[data-studio-comment-pin-preview="true"]')).toBeNull();
    expect(document.activeElement).toBe(last);
    expect(onCommentPinClick).not.toHaveBeenCalled();

    fireEvent.click(last);
    expect(onCommentPinClick).toHaveBeenCalledWith({
      pinKey: "last",
      anchor: { type: "point", pageId: "page-1", x: 0.6, y: 0.6 },
      preferredThreadId: "thread-unread",
      threadIds: ["thread-old", "thread-unread"],
      trigger: last,
    });
  });

  it("mirrors an inward pin collision nudge when the canvas is flipped", () => {
    const html = renderToStaticMarkup(
      <StudioLiveCanvasOverlay
        canvasWidth={800}
        canvasHeight={1_200}
        cursors={[]}
        commentPins={[{
          key: "right-edge",
          anchor: { type: "point", pageId: "page-1", x: 1, y: 0.5 },
          count: 1,
          label: "오른쪽 핀",
          x: 800,
          y: 600,
          screenOffsetX: -22,
        }]}
        flipX
        onCommentPinClick={noop}
      />
    );

    expect(html).toContain("calc(0.0000% + 22px)");
  });

  it.each([
    { rotation: 0, flipX: false, x: 25, y: 25, offsetX: 12, offsetY: 8 },
    { rotation: 90, flipX: false, x: 75, y: 25, offsetX: -8, offsetY: 12 },
    { rotation: 180, flipX: false, x: 75, y: 75, offsetX: -12, offsetY: -8 },
    { rotation: 270, flipX: false, x: 25, y: 75, offsetX: 8, offsetY: -12 },
    { rotation: 0, flipX: true, x: 75, y: 25, offsetX: -12, offsetY: 8 },
    { rotation: 90, flipX: true, x: 25, y: 25, offsetX: 8, offsetY: 12 },
    { rotation: 180, flipX: true, x: 25, y: 75, offsetX: 12, offsetY: -8 },
    { rotation: 270, flipX: true, x: 75, y: 75, offsetX: -8, offsetY: -12 },
  ] as const)(
    "projects pins and cursors after local flip (rotation=$rotation, flipX=$flipX)",
    ({ rotation, flipX, x, y, offsetX, offsetY }) => {
      const html = renderToStaticMarkup(
        <StudioLiveCanvasOverlay
          canvasWidth={800}
          canvasHeight={400}
          cursors={[
            {
              participant: { sessionId: "peer", displayName: "동료", role: "editor" },
              cursor: { x: 0.25, y: 0.25, pageId: "page-1", tool: null },
              updatedAt: 1,
            },
          ]}
          commentPins={[
            {
              key: "point",
              anchor: { type: "point", pageId: "page-1", x: 0.25, y: 0.25 },
              count: 1,
              label: "검토 핀",
              x: 200,
              y: 100,
              screenOffsetX: 12,
              screenOffsetY: 8,
            },
          ]}
          flipX={flipX}
          rotation={rotation}
          onCommentPinClick={noop}
        />
      );

      expect(html).toContain(
        `left:clamp(1.375rem, calc(${x.toFixed(4)}% + ${offsetX}px), calc(100% - 1.375rem))`
      );
      expect(html).toContain(
        `top:clamp(1.375rem, calc(${y.toFixed(4)}% + ${offsetY}px), calc(100% - 1.375rem))`
      );
      expect(html).toContain(`left:${x}%;top:${y}%`);
    }
  );

  it.each([false, true] as const)(
    "keeps an omitted rotation byte-for-byte compatible with rotation zero (flipX=$flipX)",
    (flipX) => {
      const props = {
        canvasWidth: 800,
        canvasHeight: 400,
        cursors: [
          {
            participant: { sessionId: "peer", displayName: "동료", role: "editor" as const },
            cursor: { x: 0.25, y: 0.25, pageId: "page-1", tool: null },
            updatedAt: 1,
          },
        ],
        commentPins: [
          {
            key: "point",
            anchor: { type: "point" as const, pageId: "page-1", x: 0.25, y: 0.25 },
            count: 1,
            label: "검토 핀",
            x: 200,
            y: 100,
            screenOffsetX: 12,
            screenOffsetY: 8,
          },
        ],
        flipX,
        onCommentPinClick: noop,
      };
      const omitted = renderToStaticMarkup(<StudioLiveCanvasOverlay {...props} />);
      const explicitZero = renderToStaticMarkup(<StudioLiveCanvasOverlay {...props} rotation={0} />);
      expect(omitted).toBe(explicitZero);
    }
  );

  it("forwards the remote overlay rotation to comment pins before live cursors arrive", () => {
    const html = renderToStaticMarkup(
      <StudioRemoteCursorOverlay
        pageId="page-1"
        canvasWidth={800}
        canvasHeight={400}
        commentPins={[
          {
            key: "point",
            anchor: { type: "point", pageId: "page-1", x: 0.25, y: 0.25 },
            count: 1,
            label: "검토 핀",
            x: 200,
            y: 100,
            screenOffsetX: 12,
            screenOffsetY: 8,
          },
        ]}
        rotation={90}
        flipX
        onCommentPinClick={noop}
      />
    );

    expect(html).toContain("left:clamp(1.375rem, calc(25.0000% + 8px)");
    expect(html).toContain("top:clamp(1.375rem, calc(25.0000% + 12px)");
  });

  it("uses deterministic participant colors and exposes Figma-style follow controls", () => {
    const privateSessionId = "peer-private-id";
    expect(studioLiveParticipantColor(privateSessionId)).toBe(
      studioLiveParticipantColor(privateSessionId)
    );

    const html = renderToStaticMarkup(
      <StudioLivePresenceDock
        connected
        operationSyncReady
        peers={[
          {
            sessionId: privateSessionId,
            displayName: "민호 · 이 탭",
            role: "owner",
            visibility: "active",
            pageId: "page-private-id",
            lastSeenAt: 1,
          },
        ]}
        followingSessionId={privateSessionId}
        onOpenTeam={noop}
        onToggleFollow={noop}
        syncSnapshot={syncedSnapshot()}
      />
    );

    expect(html).toContain("안전하게 동기화됨");
    expect(html).toContain("팀 서버와 이 기기의 복구 저장소에 원고를 보호합니다");
    expect(html).toContain('data-studio-presence-dock="true"');
    expect(html).toContain('data-studio-presence-stack="true"');
    expect(html).toContain('data-studio-presence-link="synced"');
    expect(html).toContain('data-studio-sync-phase="synced"');
    expect(html).toContain("size-11");
    expect(html).toContain("민호 · 이 탭 따라가기 중지");
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders always-on presence dock while connecting with zero peers", () => {
    const html = renderToStaticMarkup(
      <StudioLivePresenceDock
        connected={false}
        alwaysOn
        peers={[]}
        followingSessionId={null}
        onOpenTeam={noop}
        onToggleFollow={noop}
      />
    );
    expect(html).toContain('data-studio-presence-dock="true"');
    expect(html).toContain("팀 작업 공간 열기");
    expect(html).toContain('data-studio-presence-link="retrying"');
  });

  it("announces durability loss assertively and never labels it as safely synced", () => {
    const html = renderToStaticMarkup(
      <StudioLivePresenceDock
        connected={false}
        alwaysOn
        peers={[]}
        followingSessionId={null}
        onOpenTeam={noop}
        onToggleFollow={noop}
        syncSnapshot={syncedSnapshot({
          phase: "durability-risk",
          persistenceDurability: "degraded",
          transportReady: false,
          pendingCount: 3,
          editsDurablyProtected: false,
          message: "로컬 복구 저장소를 사용할 수 없습니다.",
        })}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("저장 보호 필요");
    expect(html).toContain("팀 서버와 이 기기의 복구 저장소가 모두 준비되지 않아");
    expect(html).not.toContain("안전하게 동기화됨");
  });

  it("shows a Korean offline queue count with reduced-motion-safe reconnect affordance", () => {
    const html = renderToStaticMarkup(
      <StudioLivePresenceDock
        connected={false}
        alwaysOn
        peers={[]}
        followingSessionId={null}
        onOpenTeam={noop}
        onToggleFollow={noop}
        syncSnapshot={syncedSnapshot({
          phase: "offline-queued",
          transportReady: false,
          pendingCount: 12,
          editsDurablyProtected: true,
        })}
      />
    );

    expect(html).toContain("오프라인 · 12개 보관");
    expect(html).toContain("motion-reduce:transition-none");
    expect(html).toContain('data-studio-presence-link="offline-queued"');
  });

  it("keeps every participant color readable behind compact cream labels", () => {
    for (const color of STUDIO_LIVE_PARTICIPANT_COLORS) {
      const contrast = 1.05 / (relativeLuminance(color) + 0.05);
      expect(contrast, color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
