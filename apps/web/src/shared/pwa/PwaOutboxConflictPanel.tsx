import { AlertTriangle, Check, CloudOff, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  getBrowserPwaOfflineOutbox,
  type PwaOutboxItem,
} from "./pwa-offline-outbox";

import "./pwa-outbox-conflict.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-outbox-conflict", ko, en);

function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return String(timestamp);
  }
}

function ConflictRow({
  item,
  onResolve,
}: {
  item: PwaOutboxItem;
  onResolve: (id: string, strategy: "mine" | "theirs") => void;
}) {
  const conflict = item.conflict;
  return (
    <li className="pwa-conflict__row">
      <span className="pwa-conflict__icon" aria-hidden="true">
        <AlertTriangle size={18} />
      </span>
      <div className="pwa-conflict__body">
        <strong>{item.label}</strong>
        <span className="pwa-conflict__times">
          {bi("내 작업", "Mine")}: {formatTime(item.updatedAt)}
          {conflict && (
            <>
              {" · "}
              {bi("서버", "Server")}: {formatTime(conflict.remoteUpdatedAt)}
              {conflict.remoteLabel ? ` (${conflict.remoteLabel})` : ""}
            </>
          )}
        </span>
        <div className="pwa-conflict__actions">
          <button
            type="button"
            className="pwa-conflict__keep"
            onClick={() => onResolve(item.id, "mine")}
          >
            <Check size={15} aria-hidden="true" />
            {bi("내 것 유지", "Keep mine")}
          </button>
          <button
            type="button"
            className="pwa-conflict__theirs"
            onClick={() => onResolve(item.id, "theirs")}
          >
            <CloudOff size={15} aria-hidden="true" />
            {bi("서버 것 사용", "Use server's")}
          </button>
        </div>
      </div>
    </li>
  );
}

export interface PwaOutboxConflictPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * 오프라인 아웃박스 충돌 해결 패널.
 * 온라인 복귀 후 서버와 버전이 엇갈린 항목을 사용자가 직접 선택해 해결한다.
 */
export function PwaOutboxConflictPanel({ open, onClose }: PwaOutboxConflictPanelProps) {
  useBilingualI18nRevision();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [conflicts, setConflicts] = useState<readonly PwaOutboxItem[]>([]);

  const refresh = useCallback(() => {
    setConflicts(
      getBrowserPwaOfflineOutbox()
        .list()
        .filter((item) => item.status === "conflicted"),
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const unsubscribe = getBrowserPwaOfflineOutbox().subscribe(refresh);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      unsubscribe();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, refresh]);

  const handleResolve = useCallback(
    (id: string, strategy: "mine" | "theirs") => {
      getBrowserPwaOfflineOutbox().resolveConflict(id, strategy);
      refresh();
    },
    [refresh],
  );

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 오버레이 클릭 닫기. 키보드 닫기는 Escape 리스너로 제공.
    <div className="pwa-conflict__overlay" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 다이얼로그 내부 클릭 전파 차단용. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pwa-conflict__dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="pwa-conflict__close"
          onClick={onClose}
          aria-label={bi("닫기", "Close")}
          data-autofocus
        >
          <X size={20} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="pwa-conflict__title">
          {bi("동기화 충돌 확인", "Review sync conflicts")}
        </h2>
        <p className="pwa-conflict__description">
          {bi(
            "오프라인에서 작업하는 동안 서버에서도 같은 항목이 바뀌었어요. 어떤 버전을 남길지 선택해 주세요.",
            "While you were offline, the same items changed on the server. Choose which version to keep.",
          )}
        </p>
        {conflicts.length === 0 ? (
          <p className="pwa-conflict__empty">
            {bi("확인할 충돌이 없어요. 모두 해결됐습니다!", "No conflicts to review — all resolved!")}
          </p>
        ) : (
          <ul className="pwa-conflict__list">
            {conflicts.map((item) => (
              <ConflictRow key={item.id} item={item} onResolve={handleResolve} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
