import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
} from "./StudioLiveCanvasOverlay";

import type { StudioLiveSyncSnapshot } from "./studio-live-sync-safety";

const noop = () => undefined;

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
        expect.objectContaining({ count: 2, x: 420, y: 260 }),
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
    expect(html).toContain("ring-4 ring-accent/30");
    expect(html).toContain("clamp(1rem, 50.0000%, calc(100% - 1rem))");
    expect(html).not.toContain(privateSessionId);
    expect(html).not.toContain("page:page-1");
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
