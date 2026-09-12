import {
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FileImage,
  PackagePlus,
  RotateCcw,
  Send,
  Store,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  evaluateStudioMarketplaceSubmission,
  transitionStudioMarketplaceSubmission,
  type StudioMarketplaceAiClassification,
  type StudioMarketplaceFileRole,
  type StudioMarketplaceSubmission,
} from "../studio-marketplace-submission";
import {
  createStudioMarketplaceSubmissionDraft,
  readStudioMarketplaceSubmissionDraft,
  writeStudioMarketplaceSubmissionDraft,
} from "../studio-marketplace-submission-store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type Locale = "ko" | "en";

const FIELD_CLASS =
  "mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60";

async function checksum(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure file verification is not available in this browser.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function extension(fileName: string): string {
  const value = fileName.split(".").at(-1)?.trim().toLowerCase();
  return value && value !== fileName.toLowerCase() ? value : "file";
}

function statusTone(status: string): string {
  if (["ready", "approved", "published"].includes(status)) {
    return "border-success/30 bg-success-soft/15 text-success";
  }
  if (["blocked", "rejected"].includes(status)) {
    return "border-danger/35 bg-danger-soft/15 text-danger";
  }
  return "border-warning/35 bg-warning-soft/15 text-warning";
}

function statusLabel(status: string, locale: Locale): string {
  const ko: Readonly<Record<string, string>> = {
    draft: "작성 중",
    submitted: "심사 중",
    "changes-requested": "수정 요청",
    approved: "승인됨",
    published: "판매 중",
    rejected: "거절됨",
    withdrawn: "철회됨",
    ready: "제출 가능",
    review: "확인 필요",
    blocked: "수정 필요",
  };
  const en: Readonly<Record<string, string>> = {
    draft: "Draft",
    submitted: "In review",
    "changes-requested": "Changes requested",
    approved: "Approved",
    published: "Published",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    ready: "Ready to submit",
    review: "Review",
    blocked: "Blocked",
  };
  return (locale === "ko" ? ko[status] : en[status]) ?? status;
}

/** A real seller draft, file checksum, readiness and moderation-state workflow. */
export function StudioMarketplaceSellerPanel({
  sellerId,
  locale,
}: {
  readonly sellerId: string;
  readonly locale: Locale;
}) {
  const [submission, setSubmission] = useState<StudioMarketplaceSubmission>(() => (
    createStudioMarketplaceSubmissionDraft(sellerId)
  ));
  const [busyRole, setBusyRole] = useState<StudioMarketplaceFileRole | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSubmission(
      readStudioMarketplaceSubmissionDraft(window.localStorage, sellerId)
      ?? createStudioMarketplaceSubmissionDraft(sellerId),
    );
  }, [sellerId]);

  const readiness = useMemo(
    () => evaluateStudioMarketplaceSubmission(submission),
    [submission],
  );
  const editable = submission.status === "draft" || submission.status === "changes-requested";

  const commit = (next: StudioMarketplaceSubmission, nextMessage?: string) => {
    const stored = typeof window === "undefined"
      ? next
      : writeStudioMarketplaceSubmissionDraft(window.localStorage, next, window);
    setSubmission(stored);
    setMessage(nextMessage ?? (locale === "ko" ? "판매 초안을 저장했습니다." : "Saved seller draft."));
    setError(null);
  };

  const patch = <K extends keyof StudioMarketplaceSubmission>(
    key: K,
    value: StudioMarketplaceSubmission[K],
  ) => commit({
    ...submission,
    [key]: value,
    updatedAt: new Date().toISOString(),
  });

  const attachFile = async (role: StudioMarketplaceFileRole, file: File | null) => {
    if (!file) return;
    setBusyRole(role);
    setError(null);
    try {
      const nextFile = Object.freeze({
        path: `${role}/${file.name}`,
        role,
        format: extension(file.name),
        sizeBytes: file.size,
        checksum: await checksum(file),
      });
      commit({
        ...submission,
        files: Object.freeze([
          ...submission.files.filter((item) => item.role !== role),
          nextFile,
        ]),
        updatedAt: new Date().toISOString(),
      }, locale === "ko" ? `${file.name}의 무결성을 확인했습니다.` : `Verified ${file.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ko" ? "파일을 확인하지 못했습니다." : "Could not verify the file."));
    } finally {
      setBusyRole(null);
    }
  };

  const submit = () => {
    try {
      commit(transitionStudioMarketplaceSubmission(submission, {
        type: "submit",
        at: new Date().toISOString(),
      }), locale === "ko" ? "심사 요청을 준비했습니다. 서버 연결 시 안전하게 제출됩니다." : "Review request is prepared and will submit through the configured server.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ko" ? "제출할 수 없습니다." : "Submission is not available."));
    }
  };

  const withdraw = () => {
    try {
      commit(transitionStudioMarketplaceSubmission(submission, {
        type: "withdraw",
        at: new Date().toISOString(),
      }), locale === "ko" ? "심사 요청을 철회했습니다." : "Withdrew the review request.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ko" ? "철회할 수 없습니다." : "Could not withdraw."));
    }
  };

  const reset = () => {
    commit(createStudioMarketplaceSubmissionDraft(sellerId), locale === "ko" ? "새 판매 초안을 시작했습니다." : "Started a new seller draft.");
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="seller-panel-title">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Store size={14} aria-hidden="true" /> SELLER CENTER
          </p>
          <h2 id="seller-panel-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "파일부터 권리·심사까지 한 번에" : "From files to rights and review"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "실제 판매 파일과 미리보기의 SHA-256을 계산하고, 품질·호환성·라이선스·AI 사용 여부를 모두 확인한 뒤에만 심사를 요청합니다."
              : "Calculate SHA-256 for real product and preview files, then require quality, compatibility, license and AI disclosure checks before review."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", statusTone(submission.status))}>
            {statusLabel(submission.status, locale)}
          </span>
          <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", statusTone(readiness.status))}>
            {statusLabel(readiness.status, locale)}
          </span>
        </div>
      </div>

      {message ? <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-xs font-bold text-success">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-xs font-bold text-danger">{error}</p> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-black text-fg-2">
              {locale === "ko" ? "에셋 이름" : "Asset title"}
              <input disabled={!editable} value={submission.title} onChange={(event) => patch("title", event.target.value)} className={FIELD_CLASS} />
            </label>
            <label className="text-xs font-black text-fg-2">
              {locale === "ko" ? "에셋 종류" : "Asset type"}
              <select disabled={!editable} value={submission.assetType} onChange={(event) => patch("assetType", event.target.value)} className={FIELD_CLASS}>
                <option value="brush">{locale === "ko" ? "브러시" : "Brush"}</option>
                <option value="image">{locale === "ko" ? "2D 이미지·소재" : "2D image"}</option>
                <option value="3d">{locale === "ko" ? "3D" : "3D"}</option>
                <option value="font">{locale === "ko" ? "글꼴" : "Font"}</option>
                <option value="audio">{locale === "ko" ? "오디오" : "Audio"}</option>
                <option value="design-template">{locale === "ko" ? "디자인 템플릿" : "Design template"}</option>
                <option value="plugin">{locale === "ko" ? "확장 기능" : "Extension"}</option>
              </select>
            </label>
            <label className="text-xs font-black text-fg-2 sm:col-span-2">
              {locale === "ko" ? "설명" : "Description"}
              <textarea disabled={!editable} rows={4} value={submission.description} onChange={(event) => patch("description", event.target.value)} className={`${FIELD_CLASS} py-2`} />
            </label>
            <label className="text-xs font-black text-fg-2">
              {locale === "ko" ? "가격" : "Price"}
              <input disabled={!editable} type="number" min={0} step={100} value={submission.priceMinor} onChange={(event) => patch("priceMinor", Math.max(0, Number(event.target.value) || 0))} className={FIELD_CLASS} />
            </label>
            <label className="text-xs font-black text-fg-2">
              {locale === "ko" ? "기술 품질 점수" : "Technical quality score"}
              <input disabled={!editable} type="number" min={0} max={100} value={submission.qualityScore} onChange={(event) => patch("qualityScore", Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className={FIELD_CLASS} />
            </label>
            <label className="text-xs font-black text-fg-2">
              {locale === "ko" ? "라이선스" : "License"}
              <select disabled={!editable} value={submission.licenseId} onChange={(event) => patch("licenseId", event.target.value)} className={FIELD_CLASS}>
                <option value="commercial-standard">Commercial Standard</option>
                <option value="commercial-extended">Commercial Extended</option>
                <option value="editorial-only">Editorial only</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="text-xs font-black text-fg-2">
              {locale === "ko" ? "AI 사용" : "AI use"}
              <select disabled={!editable} value={submission.aiClassification} onChange={(event) => patch("aiClassification", event.target.value as StudioMarketplaceAiClassification)} className={FIELD_CLASS}>
                <option value="none">{locale === "ko" ? "사용하지 않음" : "Not used"}</option>
                <option value="assisted">{locale === "ko" ? "일부 보조" : "AI assisted"}</option>
                <option value="generated">{locale === "ko" ? "AI 생성 포함" : "Includes AI-generated content"}</option>
              </select>
            </label>
            {submission.aiClassification !== "none" ? (
              <label className="text-xs font-black text-fg-2 sm:col-span-2">
                {locale === "ko" ? "사용한 AI 도구·모델" : "AI tools and models"}
                <input
                  disabled={!editable}
                  value={submission.aiProviderNames.join(", ")}
                  onChange={(event) => patch("aiProviderNames", Object.freeze(event.target.value.split(",").map((value) => value.trim()).filter(Boolean)))}
                  placeholder={locale === "ko" ? "예: Firefly, 모델명" : "Example: Firefly, model name"}
                  className={FIELD_CLASS}
                />
              </label>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["primary", PackagePlus, locale === "ko" ? "판매할 실제 파일" : "Product file", locale === "ko" ? "브러시·PSD·GLB·폰트·오디오·템플릿 파일" : "Brush, PSD, GLB, font, audio or template"],
              ["preview", FileImage, locale === "ko" ? "미리보기" : "Preview", locale === "ko" ? "사용 전 결과를 판단할 이미지·영상" : "Image or video that demonstrates the result"],
            ] as const).map(([role, Icon, title, description]) => {
              const file = submission.files.find((item) => item.role === role);
              return (
                <label key={role} className={cn(
                  "relative flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center transition-colors",
                  editable ? "border-line bg-panel hover:border-accent/45" : "cursor-not-allowed border-line bg-panel opacity-60",
                )}>
                  <input
                    type="file"
                    disabled={!editable || busyRole !== null}
                    className="sr-only"
                    onChange={(event) => void attachFile(role, event.target.files?.[0] ?? null)}
                  />
                  <Icon size={24} className="text-accent" aria-hidden="true" />
                  <b className="mt-2 text-sm text-fg">{title}</b>
                  <span className="mt-1 text-xs leading-5 text-fg-3">{description}</span>
                  {file ? (
                    <span className="mt-2 max-w-full truncate rounded-full border border-success/30 bg-success-soft/15 px-2.5 py-1 text-[0.65rem] font-bold text-success">
                      {file.path.split("/").at(-1)} · {Math.ceil(file.sizeBytes / 1024)}KB
                    </span>
                  ) : null}
                  {busyRole === role ? <span className="mt-2 text-xs font-bold text-accent">{locale === "ko" ? "무결성 확인 중…" : "Verifying…"}</span> : null}
                </label>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2">
              <input disabled={!editable} type="checkbox" checked={submission.sourceReferencesCleared} onChange={(event) => patch("sourceReferencesCleared", event.target.checked)} />
              {locale === "ko" ? "참조 원본과 포함 파일의 판매 권리를 확인했습니다" : "I have cleared rights for references and included files"}
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2">
              <input
                disabled={!editable}
                type="checkbox"
                checked={submission.compatibilityTargets.includes("desktop")}
                onChange={(event) => patch("compatibilityTargets", Object.freeze(event.target.checked ? ["web", "desktop"] : ["web"]))}
              />
              {locale === "ko" ? "데스크톱 앱에서도 사용 가능" : "Also compatible with desktop app"}
            </label>
          </div>
        </div>

        <aside className="rounded-2xl border border-line bg-panel/55 p-4 xl:sticky xl:top-6 xl:self-start">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg">
            <FileCheck2 size={17} className="text-accent" aria-hidden="true" />
            {locale === "ko" ? "제출 전 확인" : "Before submission"}
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "품질 점수" : "Quality"}</p><b className="mt-1 block text-lg text-fg">{submission.qualityScore}</b></div>
            <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "첨부 파일" : "Files"}</p><b className="mt-1 block text-lg text-fg">{submission.files.length}</b></div>
            <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "확인 항목" : "Findings"}</p><b className="mt-1 block text-lg text-fg">{readiness.findings.length}</b></div>
          </div>

          <div className="mt-3 space-y-2">
            {readiness.findings.slice(0, 8).map((finding) => (
              <div key={finding.code} className={cn(
                "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5",
                finding.severity === "error"
                  ? "border-danger/30 bg-danger-soft/10 text-danger"
                  : "border-warning/30 bg-warning-soft/10 text-fg-2",
              )}>
                <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {locale === "ko" ? finding.messageKo : finding.messageEn}
              </div>
            ))}
            {readiness.findings.length === 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-soft/12 px-3 py-2 text-xs leading-5 text-fg-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                {locale === "ko" ? "심사를 요청할 준비가 됐습니다." : "Ready to request review."}
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2">
            {editable ? (
              <button type="button" disabled={readiness.status === "blocked" || busyRole !== null} onClick={submit} className={buttonClass({ className: "gap-2" })}>
                <Send size={16} aria-hidden="true" />
                {locale === "ko" ? "심사 요청 준비" : "Prepare review request"}
              </button>
            ) : null}
            {["submitted", "changes-requested", "approved"].includes(submission.status) ? (
              <button type="button" onClick={withdraw} className={buttonClass({ variant: "outline", className: "gap-2" })}>
                <RotateCcw size={16} aria-hidden="true" />
                {locale === "ko" ? "요청 철회" : "Withdraw"}
              </button>
            ) : null}
            {["withdrawn", "rejected", "published"].includes(submission.status) ? (
              <button type="button" onClick={reset} className={buttonClass({ variant: "outline", className: "gap-2" })}>
                <PackagePlus size={16} aria-hidden="true" />
                {locale === "ko" ? "새 에셋 등록" : "New submission"}
              </button>
            ) : null}
          </div>

          <p className="mt-3 flex items-start gap-2 text-[0.67rem] leading-5 text-fg-3">
            <Upload size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {locale === "ko"
              ? "브라우저에서는 파일 무결성과 제출 준비 상태를 저장합니다. 실제 업로드·결제·공개는 인증된 서버 연결이 있을 때만 수행됩니다."
              : "The browser stores file integrity and submission readiness. Actual upload, payment and publication require an authenticated server connection."}
          </p>
        </aside>
      </div>
    </section>
  );
}
