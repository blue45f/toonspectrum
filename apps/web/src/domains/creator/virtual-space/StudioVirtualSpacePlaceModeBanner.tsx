/**
 * 장소 모드 UX 레이어 (Track 6).
 *
 * - join-prompt: "참여하기" 확인 다이얼로그 (회의실·스테이지). 너무 자동이면
 *   당황스러우니 확인을 거친다. Esc=나중에, Enter=참여.
 * - banner: 진입·이탈 토스트 (role="status", 자동 닫힘).
 * - session chip: 세션 중 하단 칩 — 모드 표시 + 나가기 + 마이크/카메라 토글.
 * - whiteboard offer: 회의 중 화이트보드 제안 CTA (트랙2 포트 연결).
 *
 * BGM 중복 UI 금지 규칙을 준수한다 — 오디오 토글은 미디어 세션의 마이크/카메라만
 * 다루며 배경음악 UI는 두지 않는다.
 */

import { useEffect, useRef } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { PlaceModeEvent, PlaceModeSessionSnapshot } from "./studio-virtual-space-place-mode-director";
import type { PlaceMediaSnapshot } from "./studio-virtual-space-place-media";
import { placeMediaPermissionHint } from "./studio-virtual-space-place-media";
import { placeModeWhiteboardCopy, placeWorkModeMeta } from "./studio-virtual-space-place-modes";
import { placeModeSessionLabel } from "./use-studio-virtual-space-place-modes";
import type { PlaceModeBanner } from "./use-studio-virtual-space-place-modes";

import "./studio-virtual-space-place-mode.css";

export interface StudioVirtualSpacePlaceModeBannerProps {
  readonly prompt: PlaceModeEvent | null;
  readonly banner: PlaceModeBanner | null;
  readonly session: PlaceModeSessionSnapshot | null;
  readonly media: PlaceMediaSnapshot;
  readonly whiteboardOffer: PlaceModeEvent | null;
  readonly onConfirmJoin: () => void;
  readonly onDeclineJoin: () => void;
  readonly onLeaveSession: () => void;
  readonly onDismissBanner: () => void;
  readonly onOpenWhiteboard: () => void;
  readonly onDismissWhiteboardOffer: () => void;
  readonly onToggleMicrophone: () => void;
  readonly onToggleCamera: () => void;
  readonly onStartScreenShare: () => void;
}

export function StudioVirtualSpacePlaceModeBanner({
  prompt, banner, session, media, whiteboardOffer,
  onConfirmJoin, onDeclineJoin, onLeaveSession, onDismissBanner,
  onOpenWhiteboard, onDismissWhiteboardOffer,
  onToggleMicrophone, onToggleCamera, onStartScreenShare,
}: StudioVirtualSpacePlaceModeBannerProps) {
  const bt = useBilingual("StudioVirtualSpacePlaceModeBanner");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const declineRef = useRef(onDeclineJoin);
  declineRef.current = onDeclineJoin;

  useEffect(() => {
    if (prompt) confirmRef.current?.focus({ preventScroll: true });
  }, [prompt]);

  // Esc로 프롬프트 닫기 — 다이얼로그 자체가 아닌 document에서 처리한다
  // (non-interactive 요소의 키보드 리스너는 a11y 규칙 위반).
  useEffect(() => {
    if (!prompt) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        declineRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prompt]);

  return (
    <div className="studio-vspace-place-layer" data-testid="place-mode-layer">
      {banner ? (
        <div key={banner.key} role="status" className="studio-vspace-place-toast" data-testid="place-mode-toast">
          <span aria-hidden>{banner.mode === "none" ? "🚶" : placeWorkModeMeta(banner.mode).icon}</span>
          <span>{bt(banner.textKo, banner.textEn)}</span>
          <button type="button" className="studio-vspace-place-toast-close"
            onClick={onDismissBanner} aria-label={bt("닫기", "Dismiss")}>×</button>
        </div>
      ) : null}

      {whiteboardOffer ? (
        <div role="status" className="studio-vspace-place-toast studio-vspace-place-toast--cta" data-testid="place-mode-whiteboard-offer">
          <span>{bt(placeModeWhiteboardCopy("ko").title, placeModeWhiteboardCopy("en").title)}</span>
          <button type="button" className="studio-vspace-place-btn studio-vspace-place-btn--primary"
            onClick={onOpenWhiteboard}>
            {bt(placeModeWhiteboardCopy("ko").cta, placeModeWhiteboardCopy("en").cta)}
          </button>
          <button type="button" className="studio-vspace-place-toast-close"
            onClick={onDismissWhiteboardOffer} aria-label={bt("닫기", "Dismiss")}>×</button>
        </div>
      ) : null}

      {prompt ? (
        <div role="alertdialog" aria-modal="false"
          aria-label={bt(prompt.textKo, prompt.textEn)}
          className="studio-vspace-place-dialog" data-testid="place-mode-join-prompt">
          <div className="studio-vspace-place-dialog-title">
            <span aria-hidden>{placeWorkModeMeta(prompt.mode).icon}</span>
            <span>{bt(prompt.textKo, prompt.textEn)}</span>
          </div>
          <p className="studio-vspace-place-dialog-hint">
            {bt(placeMediaPermissionHint("ko"), placeMediaPermissionHint("en"))}
          </p>
          {media.error ? (
            <p role="alert" className="studio-vspace-place-dialog-error" data-testid="place-mode-media-error">
              {bt(media.error.messageKo, media.error.messageEn)}
            </p>
          ) : null}
          <div className="studio-vspace-place-dialog-buttons">
            <button ref={confirmRef} type="button"
              className="studio-vspace-place-btn studio-vspace-place-btn--primary"
              onClick={onConfirmJoin}>
              {bt("참여하기", "Join")}
            </button>
            <button type="button" className="studio-vspace-place-btn" onClick={onDeclineJoin}>
              {bt("나중에", "Later")}
            </button>
          </div>
        </div>
      ) : null}

      {session && session.stage === "engaged" ? (
        <div className="studio-vspace-place-chip" data-testid="place-mode-session-chip">
          <span className="studio-vspace-place-chip-label">
            {bt(
              placeModeSessionLabel(session, "ko"),
              placeModeSessionLabel(session, "en"),
            )}
          </span>
          {media.active && (session.mode === "conference" || session.mode === "stage") ? (
            <span className="studio-vspace-place-chip-controls" role="group"
              aria-label={bt("미디어 조절", "Media controls")}>
              <button type="button" className="studio-vspace-place-chip-btn"
                aria-pressed={media.microphone} onClick={onToggleMicrophone}
                aria-label={bt("마이크 켜기/끄기", "Toggle microphone")}>
                {media.microphone ? "🎙️" : "🔇"}
              </button>
              <button type="button" className="studio-vspace-place-chip-btn"
                aria-pressed={media.camera} onClick={onToggleCamera}
                aria-label={bt("카메라 켜기/끄기", "Toggle camera")}>
                {media.camera ? "📹" : "🚫"}
              </button>
            </span>
          ) : null}
          {session.mode === "focus-desk" ? (
            <button type="button" className="studio-vspace-place-chip-btn"
              onClick={() => void onStartScreenShare()}
              aria-label={bt("화면 공유 시작", "Start screen sharing")}>
              🖥️ {bt("화면 공유", "Share screen")}
            </button>
          ) : null}
          <button type="button" className="studio-vspace-place-chip-btn"
            onClick={onLeaveSession} aria-label={bt("세션 나가기", "Leave session")}>
            {bt("나가기", "Leave")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
