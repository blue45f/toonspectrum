/**
 * 원고 뷰어 핀 피드백 — 크레코의 "뷰어 기반 피드백"을 뛰어넘는 시각적 핀 UX.
 *
 * - 원고 이미지 위에 직접 핀을 꽂고(클릭 한 번) 코멘트 스레드 연결
 * - 핀 디자인: 숫자 뱃지 + 상태별 색상(미해결/해결/긴급), 호버 확대, 꽂을 때 낙하 애니메이션
 * - 핀 목록 사이드바: 클릭 시 해당 위치로 부드럽게 이동(줌+패닝)
 * - StudioCommentsPanel 브리지: `ManuscriptPinFeedbackBridge`가 문서↔핀 변환 담당
 *
 * 하위 컴포넌트는 ManuscriptPinPopover / ManuscriptPinSidebar /
 * ManuscriptPinPlacementGuideArt 로 분리되어 있다.
 *
 * 기존 파일은 수정하지 않는다 (브리지 패턴).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  addStudioCommentReply,
  addStudioCommentThread,
  createStudioCommentMessageId,
  removeStudioCommentThread,
  reopenStudioCommentThread,
  resolveStudioCommentThread,
  type StudioCommentActor,
  type StudioCommentsDocument,
} from "../studio-comments";
import {
  clampPinCoordinate,
  commentsDocumentToManuscriptPins,
  computeFlyToTransform,
  countOpenManuscriptPins,
  extractMentionNamesFromBody,
  filterManuscriptPins,
  findThreadIdForPin,
  isPinOverlapping,
  MANUSCRIPT_PIN_URGENT_PREFIX,
  manuscriptPinToCommentAnchor,
  numberManuscriptPins,
  sortPinsForSidebar,
  stripManuscriptPinUrgentPrefix,
  type ManuscriptPin,
  type ManuscriptPinFeedbackPin,
  type ManuscriptPinFeedbackReply,
  type ManuscriptPinFilter,
  type ManuscriptPinStatus,
  type ManuscriptPinViewTransform,
} from "./manuscript-pin-feedback-model";
import {
  manuscriptPinStatusLabel,
} from "./manuscript-pin-feedback-text";
import { ManuscriptPinDraftPopover, ManuscriptPinThreadPopover } from "./ManuscriptPinPopover";
import { ManuscriptPinPlacementGuideArt } from "./ManuscriptPinPlacementGuideArt";
import { ManuscriptPinSidebar } from "./ManuscriptPinSidebar";
import "./manuscript-pin-feedback.css";

/** 빈 상태 일러스트 — 기존 AI 생성 에셋(`/images/empty-*.webp`) 재활용. 장식용. */
const PIN_EMPTY_STATE_ART_SRC = "/images/empty-generic.webp";

export interface ManuscriptPinFeedbackProps {
  /** 원고 이미지 URL (없으면 빈 상태 안내) */
  readonly imageSrc?: string | null;
  readonly imageAlt?: string;
  /** 브리지 식별용. 프레젠테이셔널 컴포넌트 자체는 사용하지 않는다. */
  readonly pageId: string;
  readonly pins: readonly ManuscriptPinFeedbackPin[];
  readonly currentActorId: string | null;
  readonly currentActorName: string;
  readonly onAddPin: (input: { x: number; y: number; body: string; urgent: boolean }) => void;
  readonly onAddReply: (pinId: string, body: string) => void;
  readonly onToggleResolve: (pinId: string) => void;
  readonly onDeletePin?: (pinId: string) => void;
}

interface DraftPin {
  readonly x: number;
  readonly y: number;
  /** 드래프트 생성 시각 — 핀마다 새로 기록한다 */
  readonly createdAt: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
/** 화살표 키 한 번에 이동하는 팬 거리 (px) */
const KEYBOARD_PAN_STEP = 40;

export function ManuscriptPinFeedback({
  imageSrc,
  imageAlt,
  pins,
  currentActorId,
  currentActorName,
  onAddPin,
  onAddReply,
  onToggleResolve,
  onDeletePin,
}: ManuscriptPinFeedbackProps) {
  const bt = useBilingual("ManuscriptPinFeedback");
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<DraftPin | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ManuscriptPinFilter>("all");
  const [transform, setTransform] = useState<ManuscriptPinViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  const [composerBody, setComposerBody] = useState("");
  const [composerUrgent, setComposerUrgent] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [overlapWarning, setOverlapWarning] = useState(false);
  const panState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const numberedPins = useMemo(() => numberManuscriptPins(pins), [pins]);
  const visiblePins = useMemo(
    () => filterManuscriptPins(numberedPins, filter, currentActorId),
    [numberedPins, filter, currentActorId],
  );
  const sidebarPins = useMemo(() => sortPinsForSidebar(visiblePins), [visiblePins]);
  const openCount = useMemo(() => countOpenManuscriptPins(numberedPins), [numberedPins]);
  const selectedPin = useMemo(
    () => numberedPins.find((pin) => pin.id === selectedId) ?? null,
    [numberedPins, selectedId],
  );

  // 선택된 핀이 필터에서 사라지면 선택 해제
  useEffect(() => {
    if (selectedId && !visiblePins.some((pin) => pin.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visiblePins]);

  // Escape으로 배치 모드·팝오버 닫기
  useEffect(() => {
    if (!placing && !draft && !selectedPin) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlacing(false);
        setDraft(null);
        setSelectedId(null);
        setComposerBody("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, draft, selectedPin]);

  const zoomAt = useCallback((nextZoom: number) => {
    setTransform((prev) => ({
      ...prev,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)),
    }));
  }, []);

  /** 사이드바 클릭 → 핀 위치로 부드럽게 이동 (줌+패닝) */
  const flyToPin = useCallback((pin: ManuscriptPin) => {
    const viewer = viewerRef.current;
    const canvas = canvasRef.current;
    if (!viewer || !canvas) {
      setSelectedId(pin.id);
      return;
    }
    const viewerRect = viewer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const pinScreenX = canvasRect.left + pin.x * canvasRect.width - viewerRect.left;
    const pinScreenY = canvasRect.top + pin.y * canvasRect.height - viewerRect.top;
    setTransform((prev) =>
      computeFlyToTransform({
        viewerWidth: viewerRect.width,
        viewerHeight: viewerRect.height,
        pinScreenX,
        pinScreenY,
        current: prev,
      }),
    );
    setSelectedId(pin.id);
  }, []);

  /** 배치 모드에서 캔버스 클릭 → 드래프트 핀 생성 (팝오버 안의 클릭은 무시) */
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!placing || !canvasRef.current) return;
      // 팝오버(작성/스레드) 안의 클릭이 캔버스로 버블링되면 드래프트가 리셋되므로 무시한다
      if ((event.target as HTMLElement).closest(".manuscript-pin-popover")) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clampPinCoordinate((event.clientX - rect.left) / rect.width);
      const y = clampPinCoordinate((event.clientY - rect.top) / rect.height);
      setOverlapWarning(isPinOverlapping({ x, y }, numberedPins));
      setDraft({ x, y, createdAt: new Date().toISOString() });
      setComposerBody("");
      setComposerUrgent(false);
      setSelectedId(null);
    },
    [placing, numberedPins],
  );

  /** 키보드로 캔버스 패닝 (화살표 키) — 마우스 없이도 확대된 원고를 탐색 */
  const handleCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const panDelta: Record<string, readonly [number, number]> = {
      ArrowLeft: [KEYBOARD_PAN_STEP, 0],
      ArrowRight: [-KEYBOARD_PAN_STEP, 0],
      ArrowUp: [0, KEYBOARD_PAN_STEP],
      ArrowDown: [0, -KEYBOARD_PAN_STEP],
    };
    const delta = panDelta[event.key];
    if (!delta) return;
    event.preventDefault();
    setTransform((prev) => ({
      ...prev,
      panX: prev.panX + delta[0],
      panY: prev.panY + delta[1],
    }));
  }, []);

  const handlePanStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (placing || draft) return;
      panState.current = {
        startX: event.clientX,
        startY: event.clientY,
        panX: transform.panX,
        panY: transform.panY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [placing, draft, transform.panX, transform.panY],
  );

  const handlePanMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = panState.current;
    if (!state) return;
    setTransform((prev) => ({
      ...prev,
      panX: state.panX + (event.clientX - state.startX),
      panY: state.panY + (event.clientY - state.startY),
    }));
  }, []);

  const handlePanEnd = useCallback(() => {
    panState.current = null;
  }, []);

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setComposerBody("");
    setComposerUrgent(false);
    setOverlapWarning(false);
  }, []);

  const submitDraft = useCallback(() => {
    if (!draft) return;
    const body = composerBody.trim();
    if (!body) return;
    onAddPin({ x: draft.x, y: draft.y, body, urgent: composerUrgent });
    cancelDraft();
    setPlacing(false);
  }, [draft, composerBody, composerUrgent, onAddPin, cancelDraft]);

  const closeThread = useCallback(() => {
    setSelectedId(null);
    setReplyBody("");
  }, []);

  const submitReply = useCallback(() => {
    if (!selectedPin) return;
    const body = replyBody.trim();
    if (!body) return;
    onAddReply(selectedPin.id, body);
    setReplyBody("");
  }, [selectedPin, replyBody, onAddReply]);

  const canvasStyle: React.CSSProperties = {
    transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})`,
    transformOrigin: "0 0",
  };

  return (
    <div className="manuscript-pin-feedback" data-testid="manuscript-pin-feedback">
      <div
        ref={viewerRef}
        className="manuscript-pin-viewer"
        data-placing={placing || undefined}
      >
        {imageSrc ? (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- role="application"인 팬/줌 캔버스: 클릭 배치·포인터 팬·화살표 키 패닝이 명시된 기능이며 aria-label에 안내됨
          <div
            ref={canvasRef}
            className="manuscript-pin-canvas"
            style={canvasStyle}
            onClick={handleCanvasClick}
            onPointerDown={handlePanStart}
            onPointerMove={handlePanMove}
            onPointerUp={handlePanEnd}
            onPointerCancel={handlePanEnd}
            onKeyDown={handleCanvasKeyDown}
            role="application"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 위와 동일: 키보드 포커스를 받아 화살표 키로 패닝할 수 있어야 함
            tabIndex={0}
            aria-label={bt(
              "원고 뷰어. 핀 꽂기 모드에서 클릭하면 핀이 꽂힙니다. 화살표 키로 화면을 이동할 수 있습니다.",
              "Manuscript viewer. Click in pin placement mode to drop a pin. Use arrow keys to pan.",
            )}
          >
            <img
              src={imageSrc}
              alt={imageAlt ?? bt("원고 이미지", "Manuscript image")}
              className="manuscript-pin-image"
              draggable={false}
            />
            {visiblePins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                className="manuscript-pin"
                data-status={pin.status}
                data-selected={pin.id === selectedId || undefined}
                style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                aria-label={bt(
                  `핀 ${pin.number}, ${manuscriptPinStatusLabel(bt, pin.status)}, ${pin.authorName}`,
                  `Pin ${pin.number}, ${manuscriptPinStatusLabel(bt, pin.status)}, ${pin.authorName}`,
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(pin.id);
                  setReplyBody("");
                }}
              >
                <span className="manuscript-pin-shape" aria-hidden="true">
                  <span className="manuscript-pin-number">{pin.number}</span>
                </span>
              </button>
            ))}
            {draft && (
              <button
                type="button"
                className="manuscript-pin"
                data-status={composerUrgent ? "urgent" : "open"}
                data-just-placed="true"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                aria-label={bt("새 핀 위치", "New pin position")}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="manuscript-pin-shape" aria-hidden="true">
                  <span className="manuscript-pin-number">+</span>
                </span>
              </button>
            )}
            {draft && (
              <ManuscriptPinDraftPopover
                anchorX={draft.x}
                anchorY={draft.y}
                pinNumber={numberedPins.length + 1}
                authorName={currentActorName}
                createdAt={draft.createdAt}
                overlapWarning={overlapWarning}
                body={composerBody}
                urgent={composerUrgent}
                onBodyChange={setComposerBody}
                onUrgentChange={setComposerUrgent}
                onSubmit={submitDraft}
                onCancel={cancelDraft}
              />
            )}
            {selectedPin && !draft && (
              <ManuscriptPinThreadPopover
                pin={selectedPin}
                anchorX={selectedPin.x}
                anchorY={selectedPin.y}
                currentActorId={currentActorId}
                replyBody={replyBody}
                onReplyBodyChange={setReplyBody}
                onSubmitReply={submitReply}
                onToggleResolve={onToggleResolve}
                onDeletePin={onDeletePin}
                onClose={closeThread}
              />
            )}
          </div>
        ) : (
          <div className="manuscript-pin-empty">
            <img
              src={PIN_EMPTY_STATE_ART_SRC}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="manuscript-pin-empty-art"
            />
            <p className="manuscript-pin-empty-title">
              {bt("원고 이미지가 아직 없어요", "No manuscript image yet")}
            </p>
            <p className="manuscript-pin-empty-desc">
              {bt(
                "원고 이미지를 불러오면 핀을 꽂아 피드백을 시작할 수 있어요.",
                "Load a manuscript image to start dropping pins and leaving feedback.",
              )}
            </p>
          </div>
        )}

        {placing && !draft && (
          <div className="manuscript-pin-place-hint" aria-live="polite">
            <div className="manuscript-pin-place-hint-card">
              <span>{bt("원고에서 피드백할 위치를 클릭하세요", "Click where you want feedback on the manuscript")}</span>
              {numberedPins.length === 0 && <ManuscriptPinPlacementGuideArt />}
            </div>
          </div>
        )}

        <div className="manuscript-pin-toolbar">
          <button
            type="button"
            className="manuscript-pin-tool-btn"
            data-active={placing || undefined}
            disabled={!imageSrc}
            onClick={() => {
              setPlacing((prev) => !prev);
              setDraft(null);
              setSelectedId(null);
            }}
            aria-pressed={placing}
          >
            📌 {placing ? bt("취소", "Cancel") : bt("핀 꽂기", "Place pin")}
          </button>
        </div>

        <div className="manuscript-pin-zoom" role="group" aria-label={bt("줌", "Zoom")}>
          <button type="button" onClick={() => zoomAt(transform.zoom - 0.4)} aria-label={bt("축소", "Zoom out")} disabled={transform.zoom <= MIN_ZOOM}>−</button>
          <button type="button" onClick={() => setTransform({ zoom: 1, panX: 0, panY: 0 })} aria-label={bt("원래대로", "Reset")}>⟲</button>
          <button type="button" onClick={() => zoomAt(transform.zoom + 0.4)} aria-label={bt("확대", "Zoom in")} disabled={transform.zoom >= MAX_ZOOM}>+</button>
        </div>
      </div>

      <ManuscriptPinSidebar
        pins={sidebarPins}
        openCount={openCount}
        selectedId={selectedId}
        filter={filter}
        onFilterChange={setFilter}
        onSelectPin={flyToPin}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StudioCommentsPanel 브리지                                          */
/* ------------------------------------------------------------------ */

export interface ManuscriptPinFeedbackBridgeProps {
  readonly imageSrc?: string | null;
  readonly imageAlt?: string;
  readonly pageId: string;
  readonly document: StudioCommentsDocument;
  readonly onChange: (document: StudioCommentsDocument) => void;
  readonly currentActor: StudioCommentActor;
}

/**
 * StudioCommentsDocument ↔ 핀 피드백 브리지.
 * 기존 StudioCommentsPanel과 같은 문서를 공유하므로 핀↔댓글 스레드가 양방향 연결된다.
 */
export function ManuscriptPinFeedbackBridge({
  imageSrc,
  imageAlt,
  pageId,
  document,
  onChange,
  currentActor,
}: ManuscriptPinFeedbackBridgeProps) {
  const pins = useMemo<ManuscriptPinFeedbackPin[]>(() => {
    const base = commentsDocumentToManuscriptPins(document, pageId);
    const byThreadId = new Map(document.threads.map((thread) => [thread.id, thread]));
    return base.map((pin) => {
      const thread = pin.threadId ? byThreadId.get(pin.threadId) : undefined;
      return {
        ...pin,
        body: stripManuscriptPinUrgentPrefix(thread?.body ?? ""),
        mentions: (thread?.mentions ?? []).map((mention) => mention.displayName),
        replies: (thread?.replies ?? []).map((reply) => ({
          authorName: reply.author.displayName,
          body: reply.body,
          createdAt: reply.updatedAt,
        })),
      };
    });
  }, [document, pageId]);

  const handleAddPin = useCallback(
    (input: { x: number; y: number; body: string; urgent: boolean }) => {
      const now = new Date();
      const threadId = createStudioCommentMessageId("comment");
      const mentions = extractMentionNamesFromBody(input.body).map((displayName) => ({
        displayName,
      }));
      const next = addStudioCommentThread(
        document,
        {
          id: threadId,
          anchor: manuscriptPinToCommentAnchor(input, pageId),
          author: currentActor,
          body: input.urgent ? `${MANUSCRIPT_PIN_URGENT_PREFIX}${input.body}` : input.body,
          mentions,
        },
        now,
      );
      onChange(next);
    },
    [document, pageId, currentActor, onChange],
  );

  const handleAddReply = useCallback(
    (pinId: string, body: string) => {
      const threadId = findThreadIdForPin(document, pageId, pinId);
      if (!threadId) return;
      const mentions = extractMentionNamesFromBody(body).map((displayName) => ({
        displayName,
      }));
      const next = addStudioCommentReply(
        document,
        threadId,
        {
          id: createStudioCommentMessageId("reply"),
          author: currentActor,
          body,
          mentions,
        },
        new Date(),
      );
      onChange(next);
    },
    [document, pageId, currentActor, onChange],
  );

  const handleToggleResolve = useCallback(
    (pinId: string) => {
      const threadId = findThreadIdForPin(document, pageId, pinId);
      if (!threadId) return;
      const thread = document.threads.find((candidate) => candidate.id === threadId);
      if (!thread) return;
      const next = thread.resolved
        ? reopenStudioCommentThread(document, thread.id, new Date())
        : resolveStudioCommentThread(document, thread.id, currentActor, new Date());
      onChange(next);
    },
    [document, pageId, currentActor, onChange],
  );

  /** 핀 삭제 (작성자 본인만 — UI에서 canDelete로 제한) */
  const handleDeletePin = useCallback(
    (pinId: string) => {
      const threadId = findThreadIdForPin(document, pageId, pinId);
      if (!threadId) return;
      onChange(removeStudioCommentThread(document, threadId));
    },
    [document, pageId, onChange],
  );

  return (
    <ManuscriptPinFeedback
      imageSrc={imageSrc}
      imageAlt={imageAlt}
      pageId={pageId}
      pins={pins}
      currentActorId={currentActor.id ?? null}
      currentActorName={currentActor.displayName}
      onAddPin={handleAddPin}
      onAddReply={handleAddReply}
      onToggleResolve={handleToggleResolve}
      onDeletePin={handleDeletePin}
    />
  );
}

export type {
  ManuscriptPinFeedbackPin,
  ManuscriptPinFeedbackReply,
  ManuscriptPinFilter as ManuscriptPinFeedbackFilter,
  ManuscriptPinStatus as ManuscriptPinFeedbackStatus,
  ManuscriptPinViewTransform as ManuscriptPinFeedbackViewTransform,
};
