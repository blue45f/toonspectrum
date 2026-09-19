import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";

import { cx } from "@/shared/lib/cx";

import type { Bg3dTemplateLibraryEntry } from "./studio-bg3d-template-library-loader";

export type StudioBg3dTemplateLibraryStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface StudioBg3dTemplateLibraryNotice {
  readonly tone: "success" | "error";
  readonly message: string;
}

export interface StudioBg3dUserTemplateLibraryPanelProps {
  readonly entries: readonly Bg3dTemplateLibraryEntry[];
  readonly status: StudioBg3dTemplateLibraryStatus;
  readonly notice: StudioBg3dTemplateLibraryNotice | null;
  readonly isSaving: boolean;
  readonly applyingTemplateId: string | null;
  readonly saveDisabled: boolean;
  readonly applyDisabled: boolean;
  readonly onSave: () => void;
  readonly onApply: (entry: Bg3dTemplateLibraryEntry) => void;
  readonly onDelete: (id: string) => void;
  readonly onRetry: () => void;
}

export function StudioBg3dUserTemplateLibraryPanel({
  entries,
  status,
  notice,
  isSaving,
  applyingTemplateId,
  saveDisabled,
  applyDisabled,
  onSave,
  onApply,
  onDelete,
  onRetry,
}: StudioBg3dUserTemplateLibraryPanelProps) {
  const busy = applyingTemplateId !== null;

  return (
    <section
      className="mt-5 border-t border-line pt-4"
      aria-labelledby="bg3d-user-template-library-title"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4
          id="bg3d-user-template-library-title"
          className="flex items-center gap-1.5 text-xs font-bold text-fg"
        >
          내 템플릿
        </h4>
        <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg-3">
          {entries.length}개
        </span>
      </div>
      <p className="mb-3 text-[0.66rem] leading-relaxed text-fg-3">
        현재 장면을 이 브라우저의 SQLite/OPFS에 저장하고 다시 불러올 수 있습니다.
      </p>
      <button
        type="button"
        className={cx(
          "mb-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors sm:min-h-9",
          "border-accent/50 bg-accent text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
        )}
        disabled={status !== "ready" || saveDisabled || isSaving || busy}
        onClick={onSave}
      >
        {isSaving ? (
          <Loader2 className="animate-spin" size={14} aria-hidden />
        ) : (
          <Upload size={14} aria-hidden />
        )}
        현재 장면을 내 템플릿으로 저장
      </button>

      {status === "idle" || status === "loading" ? (
        <div
          role="status"
          className="mb-3 rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3"
        >
          템플릿을 불러오는 중입니다.
        </div>
      ) : null}
      {status === "error" ? (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-danger/40 bg-danger/5 px-3 py-3 text-xs leading-relaxed text-fg-2"
        >
          <p>
            {notice?.message ?? "템플릿 목록을 불러오지 못했습니다."}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-[0.68rem] font-bold text-fg-2 hover:bg-raised sm:min-h-9"
            onClick={onRetry}
          >
            <RefreshCw size={13} aria-hidden />
            다시 불러오기
          </button>
        </div>
      ) : null}

      {status === "ready" && notice?.tone === "success" ? (
        <p
          role="status"
          className="mb-3 rounded-xl border border-good/35 bg-[oklch(0.80_0.15_150/0.08)] px-3 py-2.5 text-xs leading-relaxed text-good"
        >
          {notice.message}
        </p>
      ) : null}
      {status === "ready" && entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-card/45 px-3 py-4 text-center text-xs leading-relaxed text-fg-3">
          저장된 템플릿이 없습니다.
        </div>
      ) : null}

      {status === "ready" && entries.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="relative overflow-hidden rounded-xl border border-line bg-card transition-colors hover:bg-raised"
            >
              <button
                type="button"
                aria-label={`${entry.name} 적용`}
                className="grid min-h-[5rem] w-full gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={status !== "ready" || applyDisabled || busy}
                onClick={() => onApply(entry)}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg">
                  {applyingTemplateId === entry.id ? (
                    <Loader2 className="shrink-0 animate-spin" size={13} aria-hidden />
                  ) : null}
                  <span className="block truncate">{entry.name}</span>
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <span
                    className={cx(
                      "inline-flex rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold",
                      entry.commercialUse
                        ? "bg-[oklch(0.80_0.15_150/0.14)] text-good"
                        : "bg-raised text-fg-3",
                    )}
                  >
                    {entry.commercialUse ? "상업 이용 가능" : "상업 이용 확인 필요"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={formatI18nTemplate(
                  translateCurrentStaticSourceText(
                    "domains.creator.bg3d.StudioBg3dUserTemplateLibraryPanel",
                    "ko",
                    "{v0} 템플릿 삭제",
                  ),
                  { v0: String(entry.name) },
                )}
                title={translateCurrentStaticSourceText(
                  "domains.creator.bg3d.StudioBg3dUserTemplateLibraryPanel",
                  "ko",
                  "템플릿 삭제",
                )}
                className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-lg border border-line bg-panel/90 text-fg-3 transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 sm:size-7"
                disabled={status !== "ready" || busy}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(entry.id);
                }}
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
