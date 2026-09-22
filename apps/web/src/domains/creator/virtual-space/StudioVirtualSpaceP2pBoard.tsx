import { Eraser, Pencil, StickyNote, UsersRound } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_P2P_BOARD_COLORS,
  type StudioP2pBoardColor,
  type StudioP2pBoardPoint,
  type StudioP2pBoardSnapshot,
} from "./studio-virtual-space-p2p-board";

export interface StudioVirtualSpaceP2pBoardProps {
  readonly snapshot: StudioP2pBoardSnapshot;
  readonly selfSessionId: string | undefined;
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
}

function boardPath(points: readonly StudioP2pBoardPoint[]): string {
  return points
    .map((point) => `${Math.round(point.x * 1000)},${Math.round(point.y * 600)}`)
    .join(" ");
}

export function StudioVirtualSpaceP2pBoard({
  snapshot,
  selfSessionId,
  onStroke,
  onNote,
  onRemove,
  onClearOwn,
}: StudioVirtualSpaceP2pBoardProps) {
  const bt = useBilingual("StudioVirtualSpaceP2pBoard");
  const [color, setColor] = useState<StudioP2pBoardColor>(STUDIO_P2P_BOARD_COLORS[0]);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<readonly StudioP2pBoardPoint[]>([]);
  const drawing = useRef(false);
  const boardRef = useRef<SVGSVGElement>(null);
  const strokes = useMemo(
    () => snapshot.entities.filter((entity) => entity.kind === "stroke"),
    [snapshot.entities],
  );
  const notes = useMemo(
    () => snapshot.entities.filter((entity) => entity.kind === "note"),
    [snapshot.entities],
  );
  const ownCount = useMemo(
    () => snapshot.entities.filter((entity) => entity.ownerSessionId === selfSessionId).length,
    [selfSessionId, snapshot.entities],
  );

  const eventPoint = (
    event: ReactPointerEvent<SVGSVGElement>,
  ): StudioP2pBoardPoint | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };
  const startDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!snapshot.canEdit || event.button !== 0) return;
    const point = eventPoint(event);
    if (!point) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft([point]);
  };
  const continueDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const point = eventPoint(event);
    if (!point) return;
    setDraft((current) => current.length >= 48 ? current : [...current, point]);
  };
  const finishDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraft((current) => {
      if (current.length >= 2) onStroke(current, color, 5);
      return [];
    });
  };

  return <section className="studio-p2p-board" data-space-interactive="true"
    aria-label={bt("P2P 공유 화이트보드", "P2P shared whiteboard")}>
    <header>
      <div>
        <h2>{bt("P2P 공유 화이트보드", "P2P shared whiteboard")}</h2>
        <p>{bt(
          "획과 메모는 현재 팀원에게 직접 전송됩니다. 서버 보드 저장이나 미디어 권한을 만들지 않아요.",
          "Strokes and notes go directly to current teammates. This creates no server board storage or media permission.",
        )}</p>
      </div>
      <span className="studio-p2p-board-participants">
        <UsersRound size={14} aria-hidden />
        {snapshot.readyPeerIds.length + 1}
      </span>
    </header>
    <div className="studio-p2p-board-tools">
      <span role="group" aria-label={bt("펜 색상", "Pen color")}>
        {STUDIO_P2P_BOARD_COLORS.map((value) => <button
          key={value}
          type="button"
          className={cn("studio-p2p-board-color", color === value && "is-selected")}
          style={{ backgroundColor: value }}
          aria-label={bt(`${value} 색상`, `${value} color`)}
          aria-pressed={color === value}
          onClick={() => setColor(value)}
        />)}
      </span>
      <label className="studio-p2p-board-note-input">
        <StickyNote size={15} aria-hidden />
        <span className="sr-only">{bt("메모", "Note")}</span>
        <input
          maxLength={160}
          value={note}
          placeholder={bt("공유 메모", "Shared note")}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button type="button" disabled={!snapshot.canEdit || !note.trim()} onClick={() => {
        const index = notes.length % 8;
        const created = onNote(
          .12 + (index % 4) * .22,
          .14 + Math.floor(index / 4) * .32,
          note,
          color,
        );
        if (created) setNote("");
      }}>
        <StickyNote size={15} aria-hidden />{bt("메모 놓기", "Place note")}
      </button>
      <button type="button" disabled={!snapshot.canEdit || ownCount === 0}
        onClick={onClearOwn}>
        <Eraser size={15} aria-hidden />{bt("내 항목 지우기", "Clear mine")}
      </button>
    </div>
    <div className="studio-p2p-board-surface" data-board-available={snapshot.available || undefined}>
      <svg
        ref={boardRef}
        viewBox="0 0 1000 600"
        role="img"
        aria-label={bt("직접 그리는 공유 보드", "Shared drawing board")}
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      >
        <defs>
          <pattern id="studio-board-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1000" height="600" className="studio-p2p-board-grid"
          fill="url(#studio-board-grid)" />
        {strokes.map((stroke) => <polyline
          key={`${stroke.ownerSessionId}:${stroke.id}`}
          points={boardPath(stroke.points)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />)}
        {draft.length ? <polyline
          points={boardPath(draft)}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        /> : null}
      </svg>
      {notes.map((item) => <article
        key={`${item.ownerSessionId}:${item.id}`}
        className="studio-p2p-board-note"
        style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, backgroundColor: item.color }}
      >
        <p>{item.text}</p>
        {item.ownerSessionId === selfSessionId ? <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={bt("내 메모 삭제", "Delete my note")}
        >×</button> : null}
      </article>)}
      {!snapshot.available ? <div className="studio-p2p-board-offline">
        <Pencil size={20} aria-hidden />
        {bt("같은 프로젝트의 P2P 연결을 확인 중입니다.", "Waiting for a P2P connection to this project.")}
      </div> : null}
    </div>
    <p className="studio-p2p-board-foot">{snapshot.canEdit
      ? bt(
          "이 브라우저에서 만든 항목만 로컬 복구되고, 팀원 항목은 연결 중에만 유지됩니다.",
          "Only items made in this browser are recovered locally; teammate items live only while connected.",
        )
      : bt(
          "보기 권한으로 참여 중이어서 보드를 수정할 수 없습니다.",
          "You joined with view-only access and cannot edit the board.",
        )}</p>
  </section>;
}
