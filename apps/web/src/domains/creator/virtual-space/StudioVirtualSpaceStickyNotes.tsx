import "./studio-virtual-space-sticky-notes.css";

import {
  Check,
  ChevronDown,
  Download,
  Eye,
  Palette,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioP2pBoardNote } from "./studio-virtual-space-p2p-board";
import {
  STUDIO_STICKY_NOTE_COLORS,
  type StudioStickyNote,
  type StudioStickyNoteColor,
} from "./studio-virtual-space-sticky-notes";

export interface StudioVirtualSpaceStickyNotesProps {
  readonly notes: readonly StudioStickyNote[];
  readonly canEdit: boolean;
  /** 보드 메모를 포스트잇으로 가져올 수 있을 때 전달. */
  readonly boardNotes?: readonly StudioP2pBoardNote[];
  readonly onCreate: (input: {
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly color: StudioStickyNoteColor;
  }) => void;
  readonly onMove: (id: string, x: number, y: number) => void;
  readonly onResize: (id: string, width: number, height: number) => void;
  readonly onEdit: (id: string, text: string) => void;
  readonly onToggleDone: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onRecolor: (id: string, color: StudioStickyNoteColor) => void;
  readonly onImportBoardNote?: (note: StudioP2pBoardNote) => void;
}

type StickyFilter = "all" | "todo" | "done";

/** 방향키 → 이동 방향. handleKey의 if/else 체인을 단순화한다. */
const STICKY_KEY_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function timeAgo(bt: (ko: string, en: string) => string, timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return bt("방금 전", "just now");
  if (minutes < 60) return bt(`${minutes}분 전`, `${minutes}m ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return bt(`${hours}시간 전`, `${hours}h ago`);
  const days = Math.floor(hours / 24);
  return bt(`${days}일 전`, `${days}d ago`);
}

/* 빈 보드 일러스트: 접힌 모서리의 포스트잇에 연필이 줄을 긋는 장면. */
function StickyNoteEmptyIllustration() {
  return <svg
    viewBox="0 0 160 140"
    aria-hidden="true"
    focusable="false"
    className="studio-sticky-notes-empty-art"
  >
    <g transform="rotate(-6 80 70)">
      <rect x="38" y="22" width="88" height="88" rx="6" className="sn-art-note" />
      <path d="M126 22 v20 h-20 z" className="sn-art-fold" />
      <line x1="54" y1="50" x2="110" y2="50" className="sn-art-line" />
      <line x1="54" y1="68" x2="94" y2="68" className="sn-art-line sn-art-line-dim" />
      <line x1="54" y1="86" x2="102" y2="86" className="sn-art-line sn-art-line-faint" />
    </g>
    <g transform="rotate(24 138 104)">
      <rect x="131" y="82" width="13" height="34" rx="4" className="sn-art-pencil" />
      <path d="M131 116 L137.5 130 L144 116 Z" className="sn-art-pencil-tip" />
    </g>
    <path d="M28 30 v14 M21 37 h14" className="sn-art-spark" strokeWidth="4" strokeLinecap="round" />
    <circle cx="140" cy="34" r="4" className="sn-art-dot" />
  </svg>;
}

/* 빈 보드 상태: 일러스트 + 다음 행동 가이드 + 핵심 액션 CTA. */
function StickyNoteEmptyBoard({
  canEdit,
  onStartPlacing,
}: {
  readonly canEdit: boolean;
  readonly onStartPlacing: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceStickyNotes");
  return <div className="studio-sticky-notes-empty">
    <StickyNoteEmptyIllustration />
    <strong>{bt("아직 포스트잇이 없어요.", "No sticky notes yet.")}</strong>
    <p>{bt(
      "아이디어와 할 일을 자유롭게 붙여보세요. 완료 체크하면 칸반처럼 정리됩니다.",
      "Stick ideas and to-dos freely. Check them off to tidy up like a kanban.",
    )}</p>
    {canEdit ? <button
      type="button"
      className="studio-sticky-notes-empty-cta"
      onClick={onStartPlacing}
      // 보드에 버블링되면 배치 모드에서 원치 않는 메모가 생기므로 차단한다.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Plus size={15} aria-hidden />
      {bt("첫 포스트잇 붙이기", "Stick the first note")}
    </button> : null}
  </div>;
}

interface StickyNoteCardProps {
  readonly note: StudioStickyNote;
  readonly canEdit: boolean;
  readonly selected: boolean;
  readonly editing: boolean;
  readonly draftText: string;
  readonly onDraftTextChange: (text: string) => void;
  readonly onBeginDrag: (event: ReactPointerEvent, note: StudioStickyNote, kind: "move" | "resize") => void;
  readonly onContinueDrag: (event: ReactPointerEvent) => void;
  readonly onFinishDrag: (event: ReactPointerEvent, note: StudioStickyNote) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent, note: StudioStickyNote) => void;
  readonly onToggleDone: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onRecolor: (id: string, color: StudioStickyNoteColor) => void;
  readonly onStartEditing: (note: StudioStickyNote) => void;
  readonly onCommitEditing: (note: StudioStickyNote) => void;
  readonly onCancelEditing: () => void;
}

/* 낱장 포스트잇 카드: 드래그·키보드 이동·인라인 편집·색상 변경을 담당한다. */
function StickyNoteCard({
  note,
  canEdit,
  selected,
  editing,
  draftText,
  onDraftTextChange,
  onBeginDrag,
  onContinueDrag,
  onFinishDrag,
  onKeyDown,
  onToggleDone,
  onRemove,
  onRecolor,
  onStartEditing,
  onCommitEditing,
  onCancelEditing,
}: StickyNoteCardProps) {
  const bt = useBilingual("StudioVirtualSpaceStickyNotes");
  // 드래그 가능한 위젯: 포인터 + 키보드(방향키 이동/Enter 편집/Delete 삭제)를 모두 지원한다.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <article
    className={cn(
      "studio-sticky-note",
      selected && "is-selected",
      note.done && "is-done",
    )}
    style={{
      left: `${note.x * 100}%`,
      top: `${note.y * 100}%`,
      width: `${note.width * 100}%`,
      height: `${note.height * 100}%`,
      backgroundColor: note.color,
    }}
    // 키보드 드래그를 위해 포커스 가능해야 한다 (aria-keyshortcuts로 단축키 안내).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    tabIndex={0}
    aria-label={bt(
      `${note.authorName}의 포스트잇: ${note.text}${note.done ? ` (${bt("완료", "done")})` : ""}`,
      `Sticky note by ${note.authorName}: ${note.text}${note.done ? " (done)" : ""}`,
    )}
    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Delete"
    onPointerDown={(event) => onBeginDrag(event, note, "move")}
    onPointerMove={onContinueDrag}
    onPointerUp={(event) => onFinishDrag(event, note)}
    onPointerCancel={(event) => onFinishDrag(event, note)}
    onKeyDown={(event) => onKeyDown(event, note)}
  >
    <div className="studio-sticky-note-top">
      <button
        type="button"
        className={cn("studio-sticky-note-check", note.done && "is-checked")}
        role="checkbox"
        aria-checked={note.done}
        aria-label={bt("완료 체크", "Mark done")}
        disabled={!canEdit}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onToggleDone(note.id); }}
      >
        {note.done ? <Check size={12} aria-hidden /> : null}
      </button>
      <span className="studio-sticky-note-meta">
        {note.authorName} · {timeAgo(bt, note.updatedAt)}
      </span>
      {canEdit ? <span className="studio-sticky-note-buttons">
        <button
          type="button"
          aria-label={bt("편집", "Edit")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onStartEditing(note); }}
        ><Pencil size={12} aria-hidden /></button>
        <button
          type="button"
          aria-label={bt("삭제", "Delete")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onRemove(note.id); }}
        ><Trash2 size={12} aria-hidden /></button>
      </span> : null}
    </div>

    {editing ? <textarea
      className="studio-sticky-note-editor"
      value={draftText}
      maxLength={160}
      ref={(element) => { element?.focus(); }}
      aria-label={bt("포스트잇 내용 편집", "Edit sticky note text")}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onDraftTextChange(event.target.value)}
      onBlur={() => onCommitEditing(note)}
      onKeyDown={(event) => {
        if (event.key === "Escape") { onCancelEditing(); event.stopPropagation(); }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onCommitEditing(note);
        event.stopPropagation();
      }}
    /> : <p
      className="studio-sticky-note-text"
      onDoubleClick={() => { if (canEdit) onStartEditing(note); }}
    >{note.text}</p>}

    {selected && canEdit ? <div
      className="studio-sticky-note-palette"
      role="group"
      aria-label={bt("포스트잇 색상", "Sticky note color")}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Palette size={12} aria-hidden />
      {STUDIO_STICKY_NOTE_COLORS.map((value) => <button
        key={value}
        type="button"
        className={cn("studio-sticky-notes-swatch", note.color === value && "is-selected")}
        style={{ backgroundColor: value }}
        aria-label={bt(`${value} 색상`, `${value} color`)}
        aria-pressed={note.color === value}
        onClick={(event) => { event.stopPropagation(); onRecolor(note.id, value); }}
      />)}
    </div> : null}

    {canEdit ? <span
      className="studio-sticky-note-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label={bt("크기 조절", "Resize")}
      onPointerDown={(event) => { event.stopPropagation(); onBeginDrag(event, note, "resize"); }}
      onPointerMove={onContinueDrag}
      onPointerUp={(event) => onFinishDrag(event, note)}
      onPointerCancel={(event) => onFinishDrag(event, note)}
    /> : null}
  </article>;
}

export function StudioVirtualSpaceStickyNotes({
  notes,
  canEdit,
  boardNotes = [],
  onCreate,
  onMove,
  onResize,
  onEdit,
  onToggleDone,
  onRemove,
  onRecolor,
  onImportBoardNote,
}: StudioVirtualSpaceStickyNotesProps) {
  const bt = useBilingual("StudioVirtualSpaceStickyNotes");
  const [filter, setFilter] = useState<StickyFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeColor, setPlaceColor] = useState<StudioStickyNoteColor>(STUDIO_STICKY_NOTE_COLORS[0]);
  const [showImporter, setShowImporter] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    id: string;
    kind: "move" | "resize";
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
    moved: boolean;
  } | null>(null);

  const visible = notes.filter((note) => {
    if (filter === "todo") return !note.done;
    if (filter === "done") return note.done;
    return true;
  });
  const todoCount = notes.filter((note) => !note.done).length;
  const doneCount = notes.length - todoCount;

  const filters = [
    { value: "all" as const, label: bt("전체", "All"), count: notes.length },
    { value: "todo" as const, label: bt("진행 중", "To do"), count: todoCount },
    { value: "done" as const, label: bt("완료", "Done"), count: doneCount },
  ];

  const boardPoint = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      rect,
    };
  };

  const placeAt = (clientX: number, clientY: number) => {
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    onCreate({ x: point.x, y: point.y, text: bt("새 메모", "New note"), color: placeColor });
    setPlacing(false);
  };

  const beginDrag = (
    event: ReactPointerEvent,
    note: StudioStickyNote,
    kind: "move" | "resize",
  ) => {
    if (!canEdit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      id: note.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originX: note.x,
      originY: note.y,
      originW: note.width,
      originH: note.height,
      moved: false,
    };
  };

  const continueDrag = (event: ReactPointerEvent) => {
    const state = dragState.current;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!state || !rect?.width || !rect.height) return;
    const dx = (event.clientX - state.startX) / rect.width;
    const dy = (event.clientY - state.startY) / rect.height;
    if (Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) > 5) {
      state.moved = true;
    }
    if (!state.moved) return;
    if (state.kind === "move") {
      onMove(state.id, state.originX + dx, state.originY + dy);
    } else {
      onResize(state.id, state.originW + dx, state.originH + dy);
    }
  };

  const finishDrag = (event: ReactPointerEvent, note: StudioStickyNote) => {
    const state = dragState.current;
    dragState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (state && !state.moved) {
      setSelectedId((current) => (current === note.id ? null : note.id));
    }
  };

  const startEditing = (note: StudioStickyNote) => {
    setEditingId(note.id);
    setDraftText(note.text);
  };

  const commitEditing = (note: StudioStickyNote) => {
    if (draftText.trim() && draftText.trim() !== note.text) {
      onEdit(note.id, draftText);
    }
    setEditingId(null);
  };

  const handleKey = (event: ReactKeyboardEvent, note: StudioStickyNote) => {
    if (!canEdit) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta = STICKY_KEY_DELTAS[event.key];
    if (delta) {
      onMove(note.id, note.x + delta[0] * step, note.y + delta[1] * step);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && editingId !== note.id) {
      startEditing(note);
      event.preventDefault();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      onRemove(note.id);
      event.preventDefault();
    }
  };

  const importable = boardNotes.filter(
    (boardNote) => !notes.some((note) => note.id === `imported-${boardNote.id}`),
  );

  return <section className="studio-sticky-notes" data-space-interactive="true"
    aria-label={bt("포스트잇 보드", "Sticky notes board")}>
    <header className="studio-sticky-notes-head">
      <div>
        <h2>{bt("포스트잇 보드", "Sticky notes board")}</h2>
        <p>{bt(
          "드래그로 옮기고 모서리를 잡아 크기를 조절하세요. 완료 체크하면 칸반처럼 정리됩니다.",
          "Drag to move, grab a corner to resize. Check done to tidy up like a kanban.",
        )}</p>
      </div>
      <div className="studio-sticky-notes-actions">
        <span role="group" aria-label={bt("필터", "Filter")} className="studio-sticky-notes-filter">
          {filters.map(({ value, label, count }) => <button
            key={value}
            type="button"
            className={cn("studio-sticky-notes-filter-btn", filter === value && "is-active")}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >{label} <span aria-hidden="true">{count}</span></button>)}
        </span>
        <button
          type="button"
          className={cn("studio-sticky-notes-add", placing && "is-active")}
          aria-pressed={placing}
          disabled={!canEdit}
          onClick={() => setPlacing((current) => !current)}
        >
          {placing ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          {bt("포스트잇 붙이기", "Add sticky note")}
        </button>
      </div>
    </header>

    {!canEdit ? <div className="studio-sticky-notes-readonly" role="status">
      <Eye size={15} aria-hidden />
      <p>{bt(
        "읽기 전용으로 보고 있어요. 포스트잇을 옮기거나 편집하려면 호스트에게 편집 권한을 요청하세요.",
        "You're viewing read-only. Ask the host for edit access to move or edit sticky notes.",
      )}</p>
    </div> : null}

    {placing ? <div className="studio-sticky-notes-placer" role="group" aria-label={bt("새 포스트잇 색상", "New sticky color")}>
      <span className="studio-sticky-notes-placer-hint">
        {bt("보드를 눌러 붙일 위치를 정하세요", "Tap the board to choose where to stick it")}
      </span>
      {STUDIO_STICKY_NOTE_COLORS.map((value) => <button
        key={value}
        type="button"
        className={cn("studio-sticky-notes-swatch", placeColor === value && "is-selected")}
        style={{ backgroundColor: value }}
        aria-label={bt(`${value} 색상`, `${value} color`)}
        aria-pressed={placeColor === value}
        onClick={() => setPlaceColor(value)}
      />)}
    </div> : null}

    {importable.length > 0 && onImportBoardNote ? <details
      className="studio-sticky-notes-importer"
      open={showImporter}
    >
      <summary
        className="studio-sticky-notes-importer-summary"
        onClick={(event) => { event.preventDefault(); setShowImporter((current) => !current); }}
      >
        <Download size={15} aria-hidden />
        {bt(`보드 메모 ${importable.length}개 가져오기`, `Import ${importable.length} board notes`)}
        <ChevronDown
          size={14}
          aria-hidden
          className={cn("studio-sticky-notes-importer-chevron", showImporter && "is-open")}
        />
      </summary>
      <ul
        className="studio-sticky-notes-importer-list"
        aria-label={bt("가져올 보드 메모", "Board notes to import")}
      >
        {importable.map((boardNote) => <li key={boardNote.id}>
          <span className="studio-sticky-notes-importer-text">{boardNote.text}</span>
          <button type="button" onClick={() => onImportBoardNote(boardNote)}>
            <Download size={14} aria-hidden />{bt("가져오기", "Import")}
          </button>
        </li>)}
      </ul>
    </details> : null}

    <div
      ref={boardRef}
      className={cn("studio-sticky-notes-board", placing && "is-placing")}
      role="region"
      aria-label={bt("포스트잇 보드 영역", "Sticky notes board area")}
      onPointerDown={placing ? (event) => placeAt(event.clientX, event.clientY) : undefined}
    >
      {visible.length === 0 ? <StickyNoteEmptyBoard
        canEdit={canEdit}
        onStartPlacing={() => setPlacing(true)}
      /> : null}

      {visible.map((note) => <StickyNoteCard
        key={note.id}
        note={note}
        canEdit={canEdit}
        selected={selectedId === note.id}
        editing={editingId === note.id}
        draftText={draftText}
        onDraftTextChange={setDraftText}
        onBeginDrag={beginDrag}
        onContinueDrag={continueDrag}
        onFinishDrag={finishDrag}
        onKeyDown={handleKey}
        onToggleDone={onToggleDone}
        onRemove={onRemove}
        onRecolor={onRecolor}
        onStartEditing={startEditing}
        onCommitEditing={commitEditing}
        onCancelEditing={() => setEditingId(null)}
      />)}
    </div>
  </section>;
}
