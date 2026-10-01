/**
 * 원고 뷰어 핀 피드백 — 스레드 팝오버 (새 핀 작성 / 기존 핀 스레드).
 *
 * ManuscriptPinFeedback의 프레젠테이셔널 하위 컴포넌트. CSS는
 * manuscript-pin-feedback.css를 공유한다.
 */

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type {
  ManuscriptPinAssigneeOption,
  ManuscriptPinFeedbackPin,
  ManuscriptPinStatus,
} from "./manuscript-pin-feedback-model";
import { formatManuscriptPinTime } from "./manuscript-pin-feedback-text";

/** 멘션 칩 목록 — StudioCommentsPanel의 멘션 칩과 같은 시각 언어 */
function ManuscriptPinMentionChips({
  mentions,
}: {
  readonly mentions: readonly string[];
}) {
  const bt = useBilingual("ManuscriptPinFeedback");
  if (mentions.length === 0) return null;
  return (
    <div className="manuscript-pin-mentions" aria-label={bt("멘션된 협업자", "Mentioned collaborators")}>
      {mentions.map((name) => (
        <span key={name} className="manuscript-pin-mention-chip">
          @{name}
        </span>
      ))}
    </div>
  );
}

interface PopoverShellProps {
  readonly pinNumber: number;
  readonly status: ManuscriptPinStatus;
  readonly authorName: string;
  readonly timeText: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}

/** 팝오버 공통 프레임: 위치 계산 + 헤더(번호·작성자·시간·닫기) */
export function ManuscriptPinPopoverShell({
  pinNumber,
  status,
  authorName,
  timeText,
  anchorX,
  anchorY,
  onClose,
  children,
}: PopoverShellProps) {
  const bt = useBilingual("ManuscriptPinFeedback");
  // 핀이 오른쪽에 있으면 팝오버를 왼쪽으로 뒤집어 화면 밖으로 나가지 않게 한다
  const flip = anchorX > 0.62;
  const style: React.CSSProperties = {
    left: flip ? undefined : `${Math.min(anchorX * 100, 96)}%`,
    right: flip ? `${Math.max((1 - anchorX) * 100 - 4, 0)}%` : undefined,
    top: `${Math.min(anchorY * 100 + 4, 88)}%`,
  };
  return (
    <div
      className="manuscript-pin-popover"
      style={style}
      role="dialog"
      aria-label={bt(`핀 ${pinNumber} 스레드`, `Pin ${pinNumber} thread`)}
    >
      <div className="manuscript-pin-popover-head">
        <span className="manuscript-pin-popover-num" data-status={status}>
          {pinNumber}
        </span>
        <div className="manuscript-pin-popover-meta">
          <div className="manuscript-pin-popover-author">{authorName}</div>
          <div className="manuscript-pin-popover-time">{timeText}</div>
        </div>
        <button
          type="button"
          className="manuscript-pin-popover-close"
          aria-label={bt("닫기", "Close")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

interface DraftPopoverProps {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly pinNumber: number;
  readonly authorName: string;
  readonly createdAt: string;
  readonly overlapWarning: boolean;
  readonly body: string;
  readonly urgent: boolean;
  readonly onBodyChange: (value: string) => void;
  readonly onUrgentChange: (value: boolean) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}

/** 새 핀 작성 팝오버 */
export function ManuscriptPinDraftPopover({
  anchorX,
  anchorY,
  pinNumber,
  authorName,
  createdAt,
  overlapWarning,
  body,
  urgent,
  onBodyChange,
  onUrgentChange,
  onSubmit,
  onCancel,
}: DraftPopoverProps) {
  const bt = useBilingual("ManuscriptPinFeedback");
  return (
    <ManuscriptPinPopoverShell
      pinNumber={pinNumber}
      status={urgent ? "urgent" : "open"}
      authorName={authorName}
      timeText={formatManuscriptPinTime(bt, createdAt)}
      anchorX={anchorX}
      anchorY={anchorY}
      onClose={onCancel}
    >
      <div className="manuscript-pin-composer">
        {overlapWarning && (
          <div className="manuscript-pin-comment" role="note">
            {bt(
              "근처에 이미 핀이 있어요. 위치를 살짝 옮겨보세요.",
              "There's already a pin nearby. Try moving it slightly.",
            )}
          </div>
        )}
        <textarea
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder={bt("이 위치에 대한 피드백을 남겨보세요…", "Leave feedback for this spot…")}
          aria-label={bt("새 핀 코멘트", "New pin comment")}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- 핀 작성 팝오버는 캔버스 클릭(사용자 액션)으로만 열리고, 다음 행동이 코멘트 입력이므로 즉시 포커스가 정답
          autoFocus
        />
        <p className="manuscript-pin-composer-hint">
          {bt("@이름 으로 협업자를 멘션할 수 있어요", "Mention collaborators with @name")}
        </p>
        <div className="manuscript-pin-composer-row">
          <label className="manuscript-pin-urgent-label">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(event) => onUrgentChange(event.target.checked)}
            />
            {bt("긴급", "Urgent")}
          </label>
          <button type="button" className="manuscript-pin-btn" onClick={onCancel}>
            {bt("취소", "Cancel")}
          </button>
          <button
            type="button"
            className="manuscript-pin-btn"
            data-primary="true"
            disabled={!body.trim()}
            onClick={onSubmit}
          >
            {bt("핀 꽂기", "Place pin")}
          </button>
        </div>
      </div>
    </ManuscriptPinPopoverShell>
  );
}

interface ThreadPopoverProps {
  readonly pin: ManuscriptPinFeedbackPin;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly currentActorId: string | null;
  readonly replyBody: string;
  readonly onReplyBodyChange: (value: string) => void;
  readonly onSubmitReply: () => void;
  readonly onToggleResolve: (pinId: string) => void;
  readonly onDeletePin?: (pinId: string) => void;
  readonly assigneeOptions?: readonly ManuscriptPinAssigneeOption[];
  readonly onAssign?: (pinId: string, assigneeId: string | null) => void;
  readonly onClose: () => void;
}

/**
 * 핀 담당 지정. 고를 수 있는 사람이 있을 때만 선택 칸을 보여 주고,
 * 목록에 없는 기존 담당자도 이름을 잃지 않도록 선택지에 남긴다.
 */
function ManuscriptPinAssigneeField({
  pin,
  options,
  onAssign,
}: {
  readonly pin: ManuscriptPinFeedbackPin;
  readonly options: readonly ManuscriptPinAssigneeOption[];
  readonly onAssign?: (pinId: string, assigneeId: string | null) => void;
}) {
  const bt = useBilingual("ManuscriptPinFeedback");
  const currentId = pin.assigneeId ?? "";
  if (!onAssign || options.length === 0) {
    return pin.assigneeName ? (
      <p className="manuscript-pin-assignee-text">{bt(`반영 담당: ${pin.assigneeName}`, `Assignee: ${pin.assigneeName}`)}</p>
    ) : null;
  }
  const missingCurrent = currentId !== "" && !options.some((option) => option.id === currentId);
  return (
    <label className="manuscript-pin-assignee">
      <span>{bt("반영 담당", "Assignee")}</span>
      <select
        value={currentId}
        aria-label={bt(`핀 ${pin.number} 반영 담당`, `Pin ${pin.number} assignee`)}
        onChange={(event) => onAssign(pin.id, event.target.value || null)}
      >
        <option value="">{bt("지정 안 함", "Unassigned")}</option>
        {missingCurrent ? <option value={currentId}>{pin.assigneeName ?? currentId}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.detail ? `${option.displayName} · ${option.detail}` : option.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 기존 핀의 스레드 팝오버 (본문 + 답글 목록 + 답글 작성) */
export function ManuscriptPinThreadPopover({
  pin,
  anchorX,
  anchorY,
  currentActorId,
  replyBody,
  onReplyBodyChange,
  onSubmitReply,
  onToggleResolve,
  onDeletePin,
  assigneeOptions = [],
  onAssign,
  onClose,
}: ThreadPopoverProps) {
  const bt = useBilingual("ManuscriptPinFeedback");
  const canDelete = onDeletePin != null && pin.authorId === currentActorId;
  return (
    <ManuscriptPinPopoverShell
      pinNumber={pin.number}
      status={pin.status}
      authorName={pin.authorName}
      timeText={formatManuscriptPinTime(bt, pin.createdAt)}
      anchorX={anchorX}
      anchorY={anchorY}
      onClose={onClose}
    >
      <div className="manuscript-pin-popover-body">
        <div className="manuscript-pin-comment">
          <div className="manuscript-pin-comment-author">{pin.authorName}</div>
          {pin.body}
          <ManuscriptPinMentionChips mentions={pin.mentions} />
        </div>
        {pin.replies.map((reply, index) => (
          <div key={`${reply.createdAt}-${index}`} className="manuscript-pin-comment" data-kind="reply">
            <div className="manuscript-pin-comment-author">{reply.authorName}</div>
            {reply.body}
          </div>
        ))}
        <ManuscriptPinAssigneeField pin={pin} options={assigneeOptions} onAssign={onAssign} />
      </div>
      <div className="manuscript-pin-composer">
        <textarea
          value={replyBody}
          onChange={(event) => onReplyBodyChange(event.target.value)}
          placeholder={bt("답글을 입력하세요…", "Write a reply…")}
          aria-label={bt("답글 입력", "Reply input")}
        />
        <p className="manuscript-pin-composer-hint">
          {bt("@이름 으로 협업자를 멘션할 수 있어요", "Mention collaborators with @name")}
        </p>
        <div className="manuscript-pin-composer-row">
          <button
            type="button"
            className="manuscript-pin-btn"
            data-tone={pin.status === "resolved" ? undefined : "danger"}
            onClick={() => onToggleResolve(pin.id)}
          >
            {pin.status === "resolved" ? bt("다시 열기", "Reopen") : bt("해결하기", "Resolve")}
          </button>
          {canDelete && (
            <button
              type="button"
              className="manuscript-pin-btn"
              data-tone="danger"
              onClick={() => onDeletePin(pin.id)}
            >
              {bt("삭제", "Delete")}
            </button>
          )}
          <button
            type="button"
            className="manuscript-pin-btn"
            data-primary="true"
            disabled={!replyBody.trim()}
            onClick={onSubmitReply}
          >
            {bt("답글", "Reply")}
          </button>
        </div>
      </div>
    </ManuscriptPinPopoverShell>
  );
}
