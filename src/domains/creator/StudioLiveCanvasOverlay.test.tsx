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

const noop = () => undefined;

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

    expect(pins.find((pin) => pin.anchor.type === "element")).toMatchObject({ x: 182, y: 18 });
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
    expect(html).toContain("1페이지, 열림 댓글 3개");
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
      />
    );

    expect(html).toContain("실시간 공동작업 연결됨");
    expect(html).toContain("민호 · 이 탭 따라가기 중지");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("민호 · 이 탭 따라가기");
    expect(html).not.toContain(privateSessionId);
    expect(html).not.toContain("page-private-id");
  });

  it("keeps every participant color readable behind compact white labels", () => {
    for (const color of STUDIO_LIVE_PARTICIPANT_COLORS) {
      const contrast = 1.05 / (relativeLuminance(color) + 0.05);
      expect(contrast, color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
