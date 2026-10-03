/**
 * PublishSpecChecklistPanel — 내보내기 다이얼로그의 발행 규격 체크리스트 + 자동 최적화.
 *
 * 규격 프리셋(Canvas/Tapas/자체)을 고르면 체크리스트 행이 갱신되고, 규격 위반이
 * 있으면 "자동 최적화" 버튼 한 번으로 리사이즈·슬라이싱·용량 맞춤·썸네일 3종 생성까지
 * 실행한다. 실제 최적화 실행은 부모(StudioExportMenuPanel)가 담당하고, 이 패널은
 * 표시와 버튼만 맡는다.
 */

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Sparkles, XCircle } from "lucide-react";

import {
  PUBLISH_SPEC_PRESET_IDS,
  PUBLISH_SPEC_PRESETS,
  type PublishSpecCheckRow,
  type PublishSpecCheckStatus,
  type PublishSpecPresetId,
} from "./spec-validator";
import { cx } from "@/shared/lib/cx";

const STATUS_ICON: Record<PublishSpecCheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
  unknown: HelpCircle,
};

const STATUS_STYLE: Record<PublishSpecCheckStatus, string> = {
  pass: "text-good",
  fail: "text-bad",
  warn: "text-warning",
  unknown: "text-fg-3",
};

const STATUS_LABEL: Record<PublishSpecCheckStatus, string> = {
  pass: "적합",
  fail: "위반",
  warn: "주의",
  unknown: "확인 필요",
};

export interface PublishSpecChecklistStatus {
  tone: "info" | "good" | "warn";
  text: string;
}

export interface PublishSpecChecklistPanelProps {
  presetId: PublishSpecPresetId;
  onPresetChange: (id: PublishSpecPresetId) => void;
  rows: PublishSpecCheckRow[];
  busy: boolean;
  canOptimize: boolean;
  status: PublishSpecChecklistStatus | null;
  onAutoOptimize: () => void;
}

export function PublishSpecChecklistPanel({
  presetId,
  onPresetChange,
  rows,
  busy,
  canOptimize,
  status,
  onAutoOptimize,
}: PublishSpecChecklistPanelProps) {
  const preset = PUBLISH_SPEC_PRESETS[presetId];
  const failCount = rows.filter((row) => row.status === "fail").length;

  return (
    <section
      aria-label="발행 규격 체크리스트"
      className="mb-2.5 rounded-xl border border-line/70 bg-card/40 p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="block text-sm font-bold text-fg">발행 규격 체크리스트</span>
        <span className="tabular-nums text-xs text-fg-2">
          {failCount === 0 ? "위반 없음" : `위반 ${failCount}건`}
        </span>
      </div>

      <label className="mt-2 block text-xs font-semibold text-fg-2">
        게시 목적지
        <select
          value={presetId}
          onChange={(event) => {
            // 선택지는 프리셋 목록뿐이지만, 값을 단언하지 않고 목록에서 찾아 넘긴다.
            const next = PUBLISH_SPEC_PRESET_IDS.find((id) => id === event.target.value);
            if (next) onPresetChange(next);
          }}
          disabled={busy}
          aria-label="발행 규격 프리셋"
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        >
          {PUBLISH_SPEC_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {PUBLISH_SPEC_PRESETS[id].label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs leading-snug text-fg-2">{preset.note}</p>

      <ul className="mt-1.5 space-y-1" aria-label="규격 검사 항목">
        {rows.map((row) => {
          const Icon = STATUS_ICON[row.status];
          return (
            <li
              key={row.id}
              className="flex items-start gap-1.5 rounded-lg border border-line/50 bg-panel/60 px-2 py-1.5"
            >
              <Icon
                size={13}
                aria-hidden
                className={cx("mt-px shrink-0", STATUS_STYLE[row.status])}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-fg">{row.label}</span>
                  <span className={cx("shrink-0 text-xs font-semibold", STATUS_STYLE[row.status])}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-fg-2">
                  {row.detail}
                </span>
                {row.hint ? (
                  <span className="mt-0.5 block text-xs leading-snug text-fg-2">
                    {row.hint}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onAutoOptimize}
        disabled={!canOptimize || busy}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Sparkles size={14} aria-hidden />
        )}
        {busy ? "자동 최적화 중…" : "자동 최적화 — 규격에 맞게 저장"}
      </button>
      <p className="mt-1 text-xs leading-snug text-fg-2">
        리사이즈·슬라이싱·용량 맞춤 후 썸네일 {preset.thumbnails.length}종까지 한 번에 저장해요.
      </p>

      {status ? (
        <p
          role="status"
          aria-live="polite"
          className={cx(
            "mt-1.5 rounded-md px-2 py-1.5 text-xs leading-snug",
            status.tone === "good"
              ? "bg-good/10 text-good"
              : status.tone === "warn"
                ? "bg-warning/10 text-warning"
                : "bg-card/70 text-fg-2"
          )}
        >
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
