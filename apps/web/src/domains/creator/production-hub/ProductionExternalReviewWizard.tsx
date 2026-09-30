import { useState } from "react";
import { Check, Copy, Link2, LoaderCircle } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { InlineHelp, ProductionWizard } from "./ProductionUxKit";

export type ExternalReviewPermissionPreset = "viewer" | "commenter" | "approver";

export interface ExternalReviewWizardSubmission {
  readonly id: string;
  readonly label: string;
}

export interface ExternalReviewWizardInput {
  readonly submissionId: string;
  readonly label: string;
  readonly permission: ExternalReviewPermissionPreset;
  readonly allowDownload: boolean;
  readonly expiresInDays: number;
}

const PERMISSION_OPTIONS: readonly {
  readonly id: ExternalReviewPermissionPreset;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "viewer", label: "보기 전용", description: "원고를 읽기만 할 수 있습니다." },
  { id: "commenter", label: "보기·댓글", description: "댓글로 의견을 남길 수 있습니다." },
  { id: "approver", label: "보기·댓글·승인", description: "승인 또는 수정 요청을 결정할 수 있습니다." },
];

const EXPIRY_OPTIONS = [1, 3, 7, 14, 30] as const;

/**
 * 외부 검수 링크 만들기 — 3단계 마법사.
 *
 * 3클릭 원칙: 1) 제출본 선택 → 2) 링크 설정 → 3) 공유.
 * 검수자는 로그인 없이 링크 하나로 댓글·승인을 남긴다.
 */
export function ProductionExternalReviewWizard({
  submissions,
  onCreate,
  onCancel,
}: {
  readonly submissions: readonly ExternalReviewWizardSubmission[];
  /** 링크 생성 후 공유 URL을 반환한다. */
  readonly onCreate: (input: ExternalReviewWizardInput) => Promise<string>;
  readonly onCancel?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [submissionId, setSubmissionId] = useState(submissions[0]?.id ?? "");
  const [label, setLabel] = useState("편집부 최종 검수");
  const [permission, setPermission] = useState<ExternalReviewPermissionPreset>("approver");
  const [allowDownload, setAllowDownload] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const canProceedFromStep0 = submissionId.length > 0;

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const url = await onCreate({
        submissionId,
        label: label.trim() || "외부 검수",
        permission,
        allowDownload,
        expiresInDays,
      });
      setLink(url);
      setIndex(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "링크를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("자동 복사에 실패했습니다. 아래 링크를 직접 복사해 주세요.");
    }
  };

  return (
    <ProductionWizard
      steps={[
        { id: "pick", title: "제출본 선택", description: "검수자에게 보여줄 승인된 제출본을 고릅니다." },
        { id: "options", title: "링크 설정", description: "권한과 만료를 정합니다. 워터마크는 항상 적용됩니다." },
        { id: "share", title: "공유", description: "링크를 복사해 검수자에게 전달합니다." },
      ]}
      currentIndex={index}
      onIndexChange={(next) => {
        // 2단계(공유)는 링크 생성 후에만 진입
        if (next === 2 && !link) return;
        setIndex(next);
      }}
      onComplete={() => onCancel?.()}
      onCancel={onCancel}
      completeLabel="닫기"
      hideNextOnSteps={[1]}
      isNextDisabled={(stepIndex) => stepIndex === 0 && !canProceedFromStep0}
    >
      {(stepIndex) => {
        if (stepIndex === 0) {
          return (
            <div className="space-y-4">
              <label className="block text-sm font-semibold">
                검수할 제출본
                <select
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                  value={submissionId}
                  onChange={(event) => setSubmissionId(event.target.value)}
                >
                  {submissions.map((submission) => (
                    <option key={submission.id} value={submission.id}>
                      {submission.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                링크 이름
                <input
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                  value={label}
                  maxLength={40}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="예: 편집부 최종 검수"
                />
              </label>
              {!canProceedFromStep0 ? (
                <p role="alert" className="text-sm text-bad">
                  검수할 제출본을 먼저 선택해 주세요.
                </p>
              ) : null}
            </div>
          );
        }
        if (stepIndex === 1) {
          return (
            <div className="space-y-4">
              <fieldset>
                <legend className="flex items-center gap-1 text-sm font-semibold">
                  검수자 권한
                  <InlineHelp label="검수자 권한">
                    검수자는 로그인 없이 링크로만 참여합니다. 승인 권한을 주면 "승인/수정 요청" 버튼이 보이고,
                    댓글 권한만 주면 의견만 남길 수 있습니다.
                  </InlineHelp>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {PERMISSION_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={permission === option.id}
                      onClick={() => setPermission(option.id)}
                      className={cn(
                        "rounded-2xl border p-3 text-left",
                        permission === option.id
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-card hover:bg-raised",
                      )}
                    >
                      <span className="block text-sm font-bold">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-fg-2">{option.description}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  링크 만료
                  <select
                    className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(Number(event.target.value))}
                  >
                    {EXPIRY_OPTIONS.map((days) => (
                      <option key={days} value={days}>
                        {days}일 후 만료
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-3 pt-6 text-sm">
                  <input
                    type="checkbox"
                    checked={allowDownload}
                    onChange={(event) => setAllowDownload(event.target.checked)}
                    className="size-5 shrink-0"
                  />
                  원본 다운로드 허용
                </label>
              </div>
              <p className="text-xs leading-6 text-fg-3">
                워터마크는 항상 적용되며, 링크는 만료 후 자동으로 비활성화됩니다.
              </p>
              {error ? (
                <p role="alert" className="text-sm text-bad">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className={buttonClass()}
                disabled={busy || !canProceedFromStep0}
                onClick={() => void create()}
              >
                {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                링크 만들기
              </button>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-good">
              <Check size={16} aria-hidden="true" /> 링크가 만들어졌습니다
            </p>
            {link ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={link}
                  onFocus={(event) => event.target.select()}
                  aria-label="외부 검수 링크"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-sm"
                />
                <button type="button" className={buttonClass()} onClick={() => void copyLink()}>
                  <Copy size={16} aria-hidden="true" /> {copied ? "복사됨" : "복사하기"}
                </button>
              </div>
            ) : null}
            <p className="text-xs leading-6 text-fg-3">
              이 링크를 아는 사람은 로그인 없이 검수에 참여할 수 있습니다. 필요하면 언제든 링크를 회수할 수 있습니다.
            </p>
            {error ? (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            ) : null}
          </div>
        );
      }}
    </ProductionWizard>
  );
}
