import { AlertTriangle, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  planStudioImport,
  type StudioImportPlanItem,
} from "../studio-import-compatibility";
import {
  STUDIO_IMPORT_HANDOFF_ACCEPT,
  registerStudioImportHandoff,
  studioImportHandoffHref,
  studioImportHandoffTargetForFormat,
} from "../studio-import-handoff";

export type StudioImportIntakeLocale = "ko" | "en";

type Selection = Readonly<{
  file: File;
  item: StudioImportPlanItem;
}>;

function statusClasses(status: StudioImportPlanItem["status"]): string {
  if (status === "accepted") return "border-success/35 bg-success/10 text-success";
  if (status === "review") return "border-warning/35 bg-warning/10 text-warning";
  return "border-danger/35 bg-danger/10 text-danger";
}

function statusLabel(status: StudioImportPlanItem["status"], locale: StudioImportIntakeLocale): string {
  if (status === "accepted") return locale === "ko" ? "바로 가져올 수 있음" : "Ready to import";
  if (status === "review") return locale === "ko" ? "변환 내용 확인 필요" : "Review conversion";
  return locale === "ko" ? "가져오기 차단" : "Import blocked";
}

function listLabel(values: readonly string[], fallback: string): string {
  return values.length > 0 ? values.join(" · ") : fallback;
}

/**
 * Runs a truthful compatibility preview, then hands the original browser File to the existing
 * editor import owner. Files never enter localStorage or URL state and the handoff is single-use.
 */
export function StudioImportIntake({ locale }: { readonly locale: StudioImportIntakeLocale }) {
  const navigate = useNavigate();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [message, setMessage] = useState("");

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setMessage("");
    if (!file) return;
    try {
      const plan = planStudioImport([{
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
      }]);
      setSelection(Object.freeze({ file, item: plan.items[0]! }));
    } catch (error) {
      setSelection(null);
      setMessage(error instanceof Error ? error.message : "Import preflight failed.");
    }
  };

  const continueImport = () => {
    if (!selection || selection.item.status === "blocked") return;
    if (!studioImportHandoffTargetForFormat(selection.item.format)) {
      setMessage(locale === "ko"
        ? "이 형식은 아래 전용 작업공간에서 가져와야 합니다. 파일은 전송하거나 저장하지 않았습니다."
        : "This format must be imported in its dedicated workspace. The file was not uploaded or stored.");
      return;
    }
    try {
      const handoff = registerStudioImportHandoff(selection.file, selection.item.format);
      navigate(studioImportHandoffHref(handoff));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import handoff failed.");
    }
  };

  const operational = selection
    ? studioImportHandoffTargetForFormat(selection.item.format) !== null
    : false;
  const Icon = selection?.item.status === "accepted"
    ? CheckCircle2
    : selection?.item.status === "review"
      ? AlertTriangle
      : ShieldCheck;

  return (
    <section
      className="mt-8 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"
      aria-labelledby="studio-import-intake-title"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            SAFE IMPORT
          </p>
          <h2 id="studio-import-intake-title" className="mt-1 text-xl font-black text-fg">
            {locale === "ko" ? "먼저 분석하고, 기존 편집기로 안전하게 전달" : "Analyze first, then hand off safely to the editor"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-3">
            {locale === "ko"
              ? "JSON·PSD·ORA·CBZ·브러시 팩과 이미지 파일은 보존 항목과 변환 손실을 확인한 뒤 기존 검증된 가져오기 경로로 전달합니다. 파일 자체는 URL이나 저장소에 기록하지 않습니다."
              : "JSON, PSD, ORA, CBZ, brush packs and images are previewed for preservation and loss, then passed to the established import owner. File bytes are never written to URL or storage."}
          </p>
        </div>
        <label className={buttonClass({ size: "lg", className: "shrink-0 cursor-pointer gap-2" })}>
          <FileUp size={17} aria-hidden="true" />
          {locale === "ko" ? "파일 선택" : "Choose file"}
          <input
            type="file"
            accept={STUDIO_IMPORT_HANDOFF_ACCEPT}
            className="sr-only"
            onChange={selectFile}
          />
        </label>
      </div>

      {selection ? (
        <article className="mt-5 rounded-2xl border border-line bg-panel/55 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
                  statusClasses(selection.item.status),
                )}>
                  <Icon size={14} aria-hidden="true" />
                  {statusLabel(selection.item.status, locale)}
                </span>
                <strong className="truncate text-sm text-fg">{selection.file.name}</strong>
                <span className="text-xs uppercase text-fg-3">{selection.item.format}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-fg-2">{locale === "ko" ? "보존" : "Preserved"}</dt>
                  <dd className="mt-1 leading-5 text-fg-3">
                    {listLabel(selection.item.preservedFeatures, locale === "ko" ? "보존 항목 없음" : "No preserved features")}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-fg-2">{locale === "ko" ? "변환·손실" : "Conversion and loss"}</dt>
                  <dd className="mt-1 leading-5 text-fg-3">
                    {listLabel(selection.item.losses, locale === "ko" ? "알려진 손실 없음" : "No known loss")}
                  </dd>
                </div>
              </dl>
              {selection.item.warnings.length > 0 ? (
                <p className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/10 px-3 py-2 text-xs leading-5 text-warning">
                  {selection.item.warnings.join(" · ")}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={selection.item.status === "blocked" || !operational}
              onClick={continueImport}
              className={buttonClass({
                className: "shrink-0 gap-2",
                disabled: selection.item.status === "blocked" || !operational,
              })}
            >
              {locale === "ko" ? "편집기에서 가져오기" : "Import in editor"}
              <FileUp size={15} aria-hidden="true" />
            </button>
          </div>
        </article>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-xs text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
