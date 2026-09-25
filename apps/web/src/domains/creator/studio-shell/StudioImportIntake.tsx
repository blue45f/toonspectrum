import { translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { AlertTriangle, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  planStudioImport,
  type StudioImportPlanItem,
} from "../studio-import-compatibility";
import { importStudioProjectPackage } from "../save-first/studio-project-package-import";
import {
  STUDIO_IMPORT_HANDOFF_ACCEPT,
  registerStudioImportHandoff,
  studioImportHandoffHref,
  studioImportHandoffTargetForFormat,
} from "../studio-import-handoff";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioImportIntake", ko, en);

export type StudioImportIntakeLocale = string;

type Selection = Readonly<{
  file: File;
  item: StudioImportPlanItem;
}>;

function statusClasses(status: StudioImportPlanItem["status"]): string {
  if (status === "accepted") return "border-success/35 bg-success/10 text-success";
  if (status === "review") return "border-warning/35 bg-warning/10 text-warning";
  return "border-danger/35 bg-danger/10 text-danger";
}

function statusLabel(status: StudioImportPlanItem["status"], _locale: string): string {
  if (status === "accepted") return bi("바로 가져올 수 있음", "Ready to import");
  if (status === "review") return bi("변환 내용 확인 필요", "Review conversion");
  return bi("가져오기 차단", "Import blocked");
}

function listLabel(values: readonly string[], fallback: string): string {
  return values.length > 0 ? values.join(" · ") : fallback;
}

/**
 * Runs a truthful compatibility preview, then hands the original browser File to the existing
 * editor import owner. Files never enter localStorage or URL state and the handoff is single-use.
 */
export function StudioImportIntake({ locale }: { readonly locale: StudioImportIntakeLocale }) {
  useBilingualI18nRevision();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

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

  const continueImport = async () => {
    if (!selection || selection.item.status === "blocked" || importing) return;
    if (selection.item.format === "toonstudio") {
      setImporting(true);
      setMessage("");
      try {
        const restored = await importStudioProjectPackage(selection.file, {
          storage: window.localStorage,
          target: window,
          authUserId: session?.user?.id ?? null,
        });
        navigate(restored.href, { replace: true });
      } catch (error) {
        setMessage(error instanceof Error
          ? error.message
          : bi("ToonStudio 프로젝트 파일을 복원하지 못했습니다.", "The ToonStudio project file could not be restored."));
        setImporting(false);
      }
      return;
    }
    if (!studioImportHandoffTargetForFormat(selection.item.format)) {
      setMessage(bi("이 형식은 아래 전용 작업공간에서 가져와야 합니다. 파일은 전송하거나 저장하지 않았습니다.", "This format must be imported in its dedicated workspace. The file was not uploaded or stored."));
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
    ? selection.item.format === "toonstudio"
      || studioImportHandoffTargetForFormat(selection.item.format) !== null
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
            {translateCurrentStaticSourceText("domains.creator.studio.shell.StudioImportIntake", "en", "SAFE IMPORT")}</p>
          <h2 id="studio-import-intake-title" className="mt-1 text-xl font-black text-fg">
            {bi("먼저 분석하고, 기존 편집기로 안전하게 전달", "Analyze first, then hand off safely to the editor")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-3">
            {bi("ToonStudio 프로젝트·JSON·PSD·ORA·CBZ·브러시 팩과 이미지 파일은 보존 항목과 변환 손실을 확인한 뒤 검증된 가져오기 경로로 전달합니다. 프로젝트 파일은 원고 스냅샷까지 새 로컬 프로젝트로 복원합니다.", "ToonStudio projects, JSON, PSD, ORA, CBZ, brush packs and images are previewed for preservation and loss, then sent through verified import paths. Project packages restore canvas snapshots into a new local project.")}
          </p>
        </div>
        <label className={buttonClass({ size: "lg", className: "shrink-0 cursor-pointer gap-2" })}>
          <FileUp size={17} aria-hidden="true" />
          {bi("파일 선택", "Choose file")}
          <input
            type="file"
            accept={STUDIO_IMPORT_HANDOFF_ACCEPT}
            disabled={importing}
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
                  <dt className="font-bold text-fg-2">{bi("보존", "Preserved")}</dt>
                  <dd className="mt-1 leading-5 text-fg-3">
                    {listLabel(selection.item.preservedFeatures, bi("보존 항목 없음", "No preserved features"))}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-fg-2">{bi("변환·손실", "Conversion and loss")}</dt>
                  <dd className="mt-1 leading-5 text-fg-3">
                    {listLabel(selection.item.losses, bi("알려진 손실 없음", "No known loss"))}
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
              disabled={selection.item.status === "blocked" || !operational || importing}
              onClick={() => { void continueImport(); }}
              className={buttonClass({ className: "shrink-0 gap-2" })}
            >
              {importing
                ? bi("프로젝트 복원 중…", "Restoring project…")
                : selection.item.format === "toonstudio"
                  ? bi("프로젝트 복원", "Restore project")
                  : bi("편집기에서 가져오기", "Import in editor")}
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
