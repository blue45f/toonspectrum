import "./studio-virtual-space-whiteboard.css";

import {
  ChevronDown,
  Eraser,
  Maximize2,
  Minimize2,
  Pencil,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Undo2,
  UsersRound,
  WifiOff,
  Wrench,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_P2P_BOARD_COLORS,
  type StudioP2pBoardColor,
  type StudioP2pBoardEntity,
  type StudioP2pBoardPoint,
  type StudioP2pBoardSnapshot,
} from "./studio-virtual-space-p2p-board";

export interface StudioVirtualSpaceWhiteboardProps {
  readonly snapshot: StudioP2pBoardSnapshot;
  readonly selfSessionId: string | undefined;
  /** 세션 id → 표시 이름. 다른 사람 스트로크의 이름표를 그리는 데 사용한다. */
  readonly authorNameOf: (sessionId: string) => string;
  readonly onStroke: (
    points: readonly StudioP2pBoardPoint[],
    color: StudioP2pBoardColor,
    width?: number,
  ) => string | null;
  readonly onNote: (
    x: number,
    y: number,
    text: string,
    color: StudioP2pBoardColor,
  ) => string | null;
  readonly onRemove: (id: string) => boolean;
  readonly onClearOwn: () => void;
  /** true이면 도킹(축소) 모드, false이면 풀스크린 모드. */
  readonly docked?: boolean;
  readonly onToggleDock?: () => void;
}

type WhiteboardTool = "pen" | "eraser" | "note";

const PEN_WIDTHS = [2, 5, 10] as const;

function boardPath(points: readonly StudioP2pBoardPoint[]): string {
  return points
    .map((point) => `${Math.round(point.x * 1000)},${Math.round(point.y * 600)}`)
    .join(" ");
}

function toViewBoxPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect | undefined,
): { readonly x: number; readonly y: number } | null {
  if (!rect?.width || !rect.height) return null;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

function isOwn(entity: StudioP2pBoardEntity, selfSessionId: string | undefined): boolean {
  return selfSessionId != null && entity.ownerSessionId === selfSessionId;
}

/* 도구 버튼. 핵심 액션(펜)은 그라데이션으로 항상 강조하고, 2차 도구는 격하시킨다. */
function WhiteboardToolButton({
  tool,
  current,
  onSelect,
  label,
  primary = false,
  children,
}: {
  readonly tool: WhiteboardTool;
  readonly current: WhiteboardTool;
  readonly onSelect: (tool: WhiteboardTool) => void;
  readonly label: string;
  readonly primary?: boolean;
  readonly children: ReactNode;
}) {
  const active = tool === current;
  return <button
    type="button"
    className={cn("studio-whiteboard-tool", active && "is-active", primary && "is-primary")}
    aria-pressed={active}
    onClick={() => onSelect(tool)}
  >
    {children}
    {label}
  </button>;
}

/* 펜 색상·굵기 같은 세부 설정은 <details>로 접어둬서 도구 바를 가볍게 유지한다. */
function PenSettingsPanel({
  color,
  onColorChange,
  penWidth,
  onPenWidthChange,
  penActive,
}: {
  readonly color: StudioP2pBoardColor;
  readonly onColorChange: (color: StudioP2pBoardColor) => void;
  readonly penWidth: number;
  readonly onPenWidthChange: (width: number) => void;
  readonly penActive: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceWhiteboard");
  return <details className="studio-whiteboard-pen-settings">
    <summary>
      <SlidersHorizontal size={14} aria-hidden />
      {bt("펜 설정", "Pen settings")}
      <ChevronDown size={14} aria-hidden className="studio-whiteboard-pen-settings-chevron" />
    </summary>
    <div className="studio-whiteboard-pen-settings-body">
      <span role="group" aria-label={bt("펜 색상", "Pen color")} className="studio-whiteboard-colors">
        {STUDIO_P2P_BOARD_COLORS.map((value) => <button
          key={value}
          type="button"
          className={cn("studio-whiteboard-color", color === value && "is-selected")}
          style={{ backgroundColor: value }}
          aria-label={bt(`${value} 색상`, `${value} color`)}
          aria-pressed={color === value}
          onClick={() => onColorChange(value)}
        />)}
      </span>
      <span role="group" aria-label={bt("펜 굵기", "Pen width")} className="studio-whiteboard-widths">
        {PEN_WIDTHS.map((value) => <button
          key={value}
          type="button"
          className={cn("studio-whiteboard-width", penWidth === value && "is-selected")}
          aria-pressed={penWidth === value}
          aria-label={bt(`굵기 ${value}`, `Width ${value}`)}
          onClick={() => onPenWidthChange(value)}
          disabled={!penActive}
        >
          <span style={{ height: value }} aria-hidden />
        </button>)}
      </span>
    </div>
  </details>;
}

/* 빈 보드 일러스트: 점선 가이드를 따라 펜이 선을 긋는 장면. */
function WhiteboardEmptyIllustration() {
  return <svg
    viewBox="0 0 220 150"
    aria-hidden="true"
    focusable="false"
    className="studio-whiteboard-empty-art"
  >
    <rect x="18" y="12" width="184" height="126" rx="14" className="wb-art-board" />
    <path
      d="M48 96 C 76 52, 104 118, 132 72 S 168 62, 184 92"
      fill="none"
      className="wb-art-guide"
      strokeWidth="4"
      strokeLinecap="round"
      strokeDasharray="1 10"
    />
    <path
      d="M48 96 C 76 52, 104 118, 132 72"
      fill="none"
      className="wb-art-stroke"
      strokeWidth="6"
      strokeLinecap="round"
    />
    <g transform="rotate(28 140 62)">
      <rect x="133" y="30" width="14" height="34" rx="4" className="wb-art-pen" />
      <path d="M133 64 L140 78 L147 64 Z" className="wb-art-pen-tip" />
    </g>
    <path d="M40 34 v12 M34 40 h12" className="wb-art-spark" strokeWidth="4" strokeLinecap="round" />
    <path d="M186 116 v10 M181 121 h10" className="wb-art-spark" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}

/* 빈 보드 상태: 일러스트 + 다음 행동 가이드 + 핵심 액션 CTA. */
function WhiteboardEmptyBoard({
  canDraw,
  onStartDrawing,
}: {
  readonly canDraw: boolean;
  readonly onStartDrawing: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceWhiteboard");
  return <div className="studio-whiteboard-empty">
    <WhiteboardEmptyIllustration />
    <strong>{bt("아직 아무것도 그려지지 않았어요.", "The board is still blank.")}</strong>
    <p>{canDraw
      ? bt(
        "펜으로 첫 선을 그어보세요. 팀원에게 실시간으로 공유됩니다.",
        "Draw your first stroke with the pen — it's shared with your team in real time.",
      )
      : bt(
        "편집 권한이 있는 팀원이 그리면 여기에 표시됩니다.",
        "Strokes from teammates with edit access will appear here.",
      )}</p>
    {canDraw ? <button
      type="button"
      className="studio-whiteboard-empty-cta"
      onClick={onStartDrawing}
    >
      <Pencil size={15} aria-hidden />
      {bt("펜으로 그리기 시작", "Start drawing")}
    </button> : null}
  </div>;
}

/* 보드 위에 겹쳐 표시되는 메모. */
function WhiteboardNoteItem({
  item,
  mine,
  tag,
  eraserArmed,
  onRemove,
}: {
  readonly item: Extract<StudioP2pBoardEntity, { kind: "note" }>;
  readonly mine: boolean;
  readonly tag: string | null;
  readonly eraserArmed: boolean;
  readonly onRemove: (id: string) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceWhiteboard");
  const authorLabel = tag ?? bt("나", "Me");
  return <article
    className={cn("studio-whiteboard-note", mine && "is-mine")}
    style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, backgroundColor: item.color }}
    aria-label={bt(
      `${authorLabel}의 메모: ${item.text}`,
      `Note by ${authorLabel}: ${item.text}`,
    )}
    onPointerDown={eraserArmed && mine ? () => onRemove(item.id) : undefined}
  >
    {tag ? <span className="studio-whiteboard-note-tag">{tag}</span> : null}
    <p>{item.text}</p>
    {mine ? <button
      type="button"
      className="studio-whiteboard-note-remove"
      onClick={() => onRemove(item.id)}
      aria-label={bt("내 메모 삭제", "Delete my note")}
    >×</button> : null}
  </article>;
}

/* 연결 오류 패널: 무엇이 문제인지 + 어떻게 해결하는지 함께 안내한다. */
function WhiteboardOfflinePanel() {
  const bt = useBilingual("StudioVirtualSpaceWhiteboard");
  return <div className="studio-whiteboard-offline" role="status">
    <WifiOff size={22} aria-hidden />
    <div className="studio-whiteboard-offline-body">
      <strong>{bt("연결을 기다리고 있어요", "Waiting for connection")}</strong>
      <p>{bt(
        "같은 프로젝트의 참가자와 P2P로 연결 중입니다.",
        "Connecting to teammates in this project over P2P.",
      )}</p>
      <p className="studio-whiteboard-offline-fix">
        <Wrench size={13} aria-hidden />
        {bt(
          "해결 방법: 같은 프로젝트 방에 입장했는지, Wi-Fi 등 네트워크 연결을 확인하세요.",
          "Fix: make sure you've joined the same project room and your network (Wi-Fi) is on.",
        )}
      </p>
    </div>
  </div>;
}

export function StudioVirtualSpaceWhiteboard({
  snapshot,
  selfSessionId,
  authorNameOf,
  onStroke,
  onNote,
  onRemove,
  onClearOwn,
  docked = false,
  onToggleDock,
}: StudioVirtualSpaceWhiteboardProps) {
  const bt = useBilingual("StudioVirtualSpaceWhiteboard");
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [color, setColor] = useState<StudioP2pBoardColor>(STUDIO_P2P_BOARD_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(5);
  const [noteText, setNoteText] = useState("");
  const [draft, setDraft] = useState<readonly StudioP2pBoardPoint[]>([]);
  const drawing = useRef(false);
  const boardRef = useRef<SVGSVGElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const strokes = useMemo(
    () => snapshot.entities.filter((entity): entity is Extract<typeof entity, { kind: "stroke" }> => entity.kind === "stroke"),
    [snapshot.entities],
  );
  const notes = useMemo(
    () => snapshot.entities.filter((entity): entity is Extract<typeof entity, { kind: "note" }> => entity.kind === "note"),
    [snapshot.entities],
  );
  const ownEntities = useMemo(
    () => snapshot.entities
      .filter((entity) => isOwn(entity, selfSessionId))
      .sort((a, b) => b.revision - a.revision),
    [snapshot.entities, selfSessionId],
  );
  const isEmptyBoard = snapshot.available && strokes.length === 0 && notes.length === 0;

  const undoLast = () => {
    const latest = ownEntities[0];
    if (latest) onRemove(latest.id);
  };

  const boardPointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) =>
    toViewBoxPoint(event.clientX, event.clientY, boardRef.current?.getBoundingClientRect());

  const eraseAt = (clientX: number, clientY: number) => {
    const point = toViewBoxPoint(clientX, clientY, boardRef.current?.getBoundingClientRect());
    if (!point) return;
    const vx = point.x * 1000;
    const vy = point.y * 600;
    const hit = strokes.find((stroke) => {
      if (!isOwn(stroke, selfSessionId)) return false;
      return stroke.points.some((p) => {
        const dx = p.x * 1000 - vx;
        const dy = p.y * 600 - vy;
        return dx * dx + dy * dy <= 24 * 24;
      });
    });
    if (hit) onRemove(hit.id);
  };

  const placeNoteAt = (point: { readonly x: number; readonly y: number }) => {
    const text = noteText.trim();
    if (!text) {
      noteInputRef.current?.focus();
      return;
    }
    if (onNote(point.x, point.y, text, color)) setNoteText("");
  };

  const startPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!snapshot.canEdit || event.button !== 0) return;
    if (tool === "eraser") {
      eraseAt(event.clientX, event.clientY);
      return;
    }
    const point = boardPointFromEvent(event);
    if (!point) return;
    if (tool === "note") {
      placeNoteAt(point);
      return;
    }
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft([point]);
  };
  const continuePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current || tool !== "pen") return;
    const point = boardPointFromEvent(event);
    if (!point) return;
    setDraft((current) => current.length >= 48 ? current : [...current, point]);
  };
  const finishPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraft((current) => {
      if (current.length >= 2) onStroke(current, color, penWidth);
      return [];
    });
  };

  const noteTag = (ownerSessionId: string) =>
    ownerSessionId === selfSessionId ? null : authorNameOf(ownerSessionId);

  return <section
    className={cn("studio-whiteboard", docked && "is-docked")}
    data-space-interactive="true"
    aria-label={bt("협업 화이트보드", "Collaboration whiteboard")}
  >
    <header className="studio-whiteboard-head">
      <div className="studio-whiteboard-title">
        <h2>{bt("협업 화이트보드", "Collaboration whiteboard")}</h2>
        <p>{bt(
          "팀원과 실시간으로 그리고 메모하세요. 다른 사람의 획에는 이름표가 표시됩니다.",
          "Draw and leave notes with teammates in real time. Strokes from others show a name tag.",
        )}</p>
      </div>
      <div className="studio-whiteboard-head-actions">
        <span className="studio-whiteboard-peers" title={bt("참여자", "Participants")}>
          <UsersRound size={14} aria-hidden />
          {snapshot.readyPeerIds.length + 1}
        </span>
        {onToggleDock ? <button
          type="button"
          className="studio-whiteboard-icon-btn"
          onClick={onToggleDock}
          aria-label={docked
            ? bt("화이트보드 크게 보기", "Expand whiteboard")
            : bt("화이트보드 도킹", "Dock whiteboard")}
        >
          {docked ? <Maximize2 size={16} aria-hidden /> : <Minimize2 size={16} aria-hidden />}
        </button> : null}
      </div>
    </header>

    <div className="studio-whiteboard-toolbar" role="toolbar" aria-label={bt("화이트보드 도구", "Whiteboard tools")}>
      <span role="group" aria-label={bt("도구", "Tool")} className="studio-whiteboard-tool-group">
        <WhiteboardToolButton tool="pen" current={tool} onSelect={setTool} label={bt("펜", "Pen")} primary>
          <Pencil size={15} aria-hidden />
        </WhiteboardToolButton>
        <WhiteboardToolButton tool="eraser" current={tool} onSelect={setTool} label={bt("지우개", "Eraser")}>
          <Eraser size={15} aria-hidden />
        </WhiteboardToolButton>
        <WhiteboardToolButton tool="note" current={tool} onSelect={setTool} label={bt("메모", "Note")}>
          <StickyNote size={15} aria-hidden />
        </WhiteboardToolButton>
      </span>

      <PenSettingsPanel
        color={color}
        onColorChange={setColor}
        penWidth={penWidth}
        onPenWidthChange={setPenWidth}
        penActive={tool === "pen"}
      />

      {tool === "note" ? <label className="studio-whiteboard-note-input">
        <StickyNote size={15} aria-hidden />
        <span className="sr-only">{bt("메모 내용", "Note text")}</span>
        <input
          ref={noteInputRef}
          maxLength={160}
          value={noteText}
          placeholder={bt("보드를 눌러 메모 놓기", "Tap the board to place the note")}
          onChange={(event) => setNoteText(event.target.value)}
        />
      </label> : null}

      <span className="studio-whiteboard-history" role="group" aria-label={bt("편집 기록", "Edit history")}>
        <button
          type="button"
          className="studio-whiteboard-icon-btn"
          disabled={!snapshot.canEdit || ownEntities.length === 0}
          onClick={undoLast}
          aria-label={bt("실행 취소 (내 마지막 항목)", "Undo (my latest item)")}
          title={bt("실행 취소", "Undo")}
        >
          <Undo2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="studio-whiteboard-icon-btn is-danger"
          disabled={!snapshot.canEdit || ownEntities.length === 0}
          onClick={onClearOwn}
          aria-label={bt("내 항목 모두 지우기", "Clear all my items")}
          title={bt("내 항목 모두 지우기", "Clear all my items")}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </span>
    </div>

    <div
      className={cn("studio-whiteboard-surface", tool === "eraser" && "is-erasing", tool === "note" && "is-noting")}
      data-board-available={snapshot.available || undefined}
    >
      <svg
        ref={boardRef}
        viewBox="0 0 1000 600"
        role="img"
        aria-label={bt("직접 그리는 공유 보드", "Shared drawing board")}
        onPointerDown={startPointer}
        onPointerMove={continuePointer}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <defs>
          <pattern id="studio-whiteboard-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1000" height="600" className="studio-whiteboard-grid" fill="url(#studio-whiteboard-grid)" />
        {strokes.map((stroke) => {
          const tag = noteTag(stroke.ownerSessionId);
          const first = stroke.points[0];
          return <g key={`${stroke.ownerSessionId}:${stroke.id}`}>
            <polyline
              points={boardPath(stroke.points)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {tag && first ? <text
              x={Math.min(985, Math.max(15, first.x * 1000))}
              y={Math.max(18, first.y * 600 - 10)}
              className="studio-whiteboard-author-tag"
              textAnchor="start"
            >{tag}</text> : null}
          </g>;
        })}
        {draft.length >= 2 ? <polyline
          points={boardPath(draft)}
          fill="none"
          stroke={color}
          strokeWidth={penWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="studio-whiteboard-draft"
        /> : null}
      </svg>

      {notes.map((item) => {
        const mine = isOwn(item, selfSessionId);
        return <WhiteboardNoteItem
          key={`${item.ownerSessionId}:${item.id}`}
          item={item}
          mine={mine}
          tag={mine ? null : noteTag(item.ownerSessionId)}
          eraserArmed={tool === "eraser"}
          onRemove={onRemove}
        />;
      })}

      {isEmptyBoard ? <WhiteboardEmptyBoard
        canDraw={snapshot.canEdit}
        onStartDrawing={() => setTool("pen")}
      /> : null}

      <aside className="studio-whiteboard-minimap" aria-label={bt("보드 미니맵", "Board minimap")}>
        <svg viewBox="0 0 1000 600" aria-hidden="true" focusable="false">
          {strokes.map((stroke) => <polyline
            key={`m:${stroke.ownerSessionId}:${stroke.id}`}
            points={boardPath(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={18}
            strokeLinecap="round"
            opacity={isOwn(stroke, selfSessionId) ? 1 : 0.75}
          />)}
          {notes.map((item) => <rect
            key={`m:${item.ownerSessionId}:${item.id}`}
            x={item.x * 1000}
            y={item.y * 600}
            width={90}
            height={64}
            fill={item.color}
            opacity={0.9}
          />)}
        </svg>
      </aside>

      {!snapshot.available ? <WhiteboardOfflinePanel /> : null}
    </div>

    <p className="studio-whiteboard-foot">{snapshot.canEdit
      ? bt(
          "지우개와 실행 취소는 내가 만든 항목에만 적용됩니다.",
          "The eraser and undo apply only to items you made.",
        )
      : bt(
          "보기 권한으로 참여 중이어서 보드를 수정할 수 없습니다.",
          "You joined with view-only access and cannot edit the board.",
        )}</p>
  </section>;
}
