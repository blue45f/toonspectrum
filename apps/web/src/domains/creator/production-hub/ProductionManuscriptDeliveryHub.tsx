import {
  BadgeCheck,
  Check,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileArchive,
  Link2,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { StudioExportPanel } from "../studio-shell/StudioExportPanel";
import {
  verifyStudioVirtualSpaceReviewSubject,
  type StudioVirtualSpaceReviewSubject,
  type StudioVirtualSpaceReviewVerification,
} from "../virtual-space/studio-virtual-space-review-invitation";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

const StudioPinnedReviewShareManager = lazy(async () => ({
  default: (await import("../review-share/StudioPinnedReviewShareManager")).StudioPinnedReviewShareManager,
}));
const StudioReviewExport = lazy(async () => ({
  default: (await import("../review-export/StudioReviewExport")).StudioReviewExport,
}));

interface Props {
  readonly projectId: string;
  readonly subject: StudioVirtualSpaceReviewSubject | null;
  readonly process: ProductionManuscriptProcess | null;
  readonly onOpenFeedback: () => void;
}

async function copyPlainText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // A selection fallback is useful in restricted desktop webviews.
  }
  if (typeof document === "undefined") return false;
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

function CheckRow({ ok, children }: { readonly ok: boolean; readonly children: string }) {
  return <li className="flex items-start gap-2 text-xs leading-5 text-fg-2">
    {ok
      ? <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
      : <LockKeyhole className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />}
    <span>{children}</span>
  </li>;
}

function ToolCard({ icon: Icon, eyebrow, title, description, children }: {
  readonly icon: typeof Link2;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return <section className="rounded-2xl border border-line bg-card p-4">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-accent">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.625rem] font-black uppercase tracking-[0.14em] text-fg-3">{eyebrow}</p>
        <h3 className="mt-1 font-black text-fg">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-fg-2">{description}</p>
      </div>
    </div>
    <div className="mt-4">{children}</div>
  </section>;
}

export function ProductionManuscriptDeliveryHub({ projectId, subject, process, onOpenFeedback }: Props) {
  const [verification, setVerification] = useState<StudioVirtualSpaceReviewVerification | null>(null);
  const [checking, setChecking] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const generation = useRef(0);
  const verify = useCallback(async () => {
    const own = ++generation.current;
    setVerification(null);
    if (!subject) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const result = await verifyStudioVirtualSpaceReviewSubject(subject, "view");
      if (own === generation.current) setVerification(result);
    } catch {
      if (own === generation.current) setVerification({ ok: false, reason: "unavailable" });
    } finally {
      if (own === generation.current) setChecking(false);
    }
  }, [subject]);

  useEffect(() => {
    void verify();
    return () => { generation.current += 1; };
  }, [verify]);

  useEffect(() => {
    if (copyStatus === "idle") return undefined;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 2_400);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const copyCurrentWorkspace = async () => {
    if (typeof window === "undefined") return;
    setCopyStatus(await copyPlainText(window.location.href) ? "copied" : "error");
  };

  const reviewApproved = verification?.ok === true && verification.review.status === "approved";
  const canCreateShare = verification?.ok === true && verification.project.access.edit;
  const finalReady = Boolean(process?.approvedRevision);
  const requiredClear = (process?.openRequiredFeedbackCount ?? 0) === 0;
  const headMatchesFinal = Boolean(process?.approvedRevision && !process.hasUnapprovedChanges);

  return <div className="space-y-4" data-production-delivery-hub="">
    <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="delivery-hub-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">SHARE · DELIVERY · EXPORT</p>
          <h2 id="delivery-hub-title" className="mt-2 text-xl font-black text-fg">링크 공유, 외부 검토, 공식 전달을 구분합니다</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
            현재 화면 URL은 내부 탐색 위치만 전달합니다. 외부 검토는 고정 snapshot, 공식 전달은 승인 원본과 manifest, 일반 내보내기는 목적별 변환 규칙을 사용합니다.
          </p>
        </div>
        <button type="button" onClick={() => void verify()} disabled={checking || !subject} className={buttonClass({ variant: "outline", size: "sm" })}>
          <RefreshCcw className={cn("size-4", checking && "animate-spin")} aria-hidden="true" /> 권한 다시 확인
        </button>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-4">
        <ToolCard
          icon={ClipboardCopy}
          eyebrow="INTERNAL URL"
          title="현재 업무 화면"
          description="회차·공정·필터 위치를 복원하는 내부 URL입니다. 원고 열람 권한이나 외부 공유 권한을 새로 부여하지 않습니다."
        >
          <button type="button" onClick={() => void copyCurrentWorkspace()} className={buttonClass({ variant: "outline", size: "sm" })}>
            {copyStatus === "copied" ? <Check className="size-4 text-good" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
            {copyStatus === "copied" ? "복사됨" : copyStatus === "error" ? "복사 실패" : "화면 링크 복사"}
          </button>
        </ToolCard>
        <ToolCard
          icon={ExternalLink}
          eyebrow="IMMUTABLE SHARE"
          title="외부 검토 링크"
          description="현재 HEAD가 아니라 선택한 검수 snapshot의 페이지·해시·만료·워터마크를 고정합니다."
        >
          <span className={cn(
            "inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-bold",
            canCreateShare ? "border-good/35 bg-good/10 text-good" : "border-line bg-raised text-fg-3",
          )}>
            {canCreateShare ? "공유 가능" : "검수본·편집 권한 필요"}
          </span>
        </ToolCard>
        <ToolCard
          icon={Users}
          eyebrow="OFFICIAL DELIVERY"
          title="공식 전달·수신 확인"
          description="승인 원본, 페이지 checksum, 수신자 binding을 manifest로 고정하고 발행·다운로드·수신 완료를 따로 기록합니다."
        >
          <span className={cn(
            "inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-bold",
            reviewApproved ? "border-good/35 bg-good/10 text-good" : "border-warn/35 bg-warn/10 text-warn",
          )}>
            {reviewApproved ? "승인본 전달 가능" : "검수 승인 필요"}
          </span>
        </ToolCard>
        <ToolCard
          icon={Download}
          eyebrow="TRANSFORMED EXPORT"
          title="목적별 내보내기"
          description="플랫폼·SNS·인쇄·PDF·보관 규격을 사전 검사한 뒤 별도의 변환 작업으로 생성합니다."
        >
          <span className="inline-flex min-h-8 items-center rounded-full border border-accent/35 bg-accent-soft px-2.5 text-xs font-bold text-accent">프로젝트 출력 도구</span>
        </ToolCard>
      </div>

      <div className="mt-4 grid gap-4 rounded-2xl border border-line bg-panel p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-black text-fg">전달 준비 점검</h3>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <CheckRow ok={Boolean(subject)}>고정 검수 snapshot 선택</CheckRow>
            <CheckRow ok={requiredClear}>열린 필수 수정 0개</CheckRow>
            <CheckRow ok={finalReady}>승인 FINAL 지정</CheckRow>
            <CheckRow ok={headMatchesFinal}>FINAL 이후 미승인 변경 없음</CheckRow>
            <CheckRow ok={reviewApproved}>선택 검수본 승인</CheckRow>
            <CheckRow ok={Boolean(process?.releaseRevision)}>RELEASE/전달 기록</CheckRow>
          </ul>
        </div>
        {!reviewApproved ? <button type="button" onClick={onOpenFeedback} className={buttonClass({ size: "sm" })}>
          검수로 이동 <PackageCheck className="size-4" aria-hidden="true" />
        </button> : <span className="inline-flex min-h-10 items-center rounded-xl border border-good/35 bg-good/10 px-3 text-sm font-bold text-good">
          <BadgeCheck className="mr-2 size-4" aria-hidden="true" /> 승인 검수본 준비됨
        </span>}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {copyStatus === "copied" ? "현재 업무 화면 링크를 복사했습니다." : copyStatus === "error" ? "현재 업무 화면 링크를 복사하지 못했습니다." : ""}
      </span>
    </section>

    {checking ? <section className="rounded-2xl border border-line bg-card p-5" role="status">
      <LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" /> 고정 검수본과 현재 권한을 확인하고 있습니다.
    </section> : null}

    {!checking && !subject ? <section className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
      <FileArchive className="mx-auto size-8 text-fg-3" aria-hidden="true" />
      <h3 className="mt-3 font-black text-fg">공유할 고정 검수본을 먼저 선택하세요</h3>
      <p className="mt-1 text-sm text-fg-2">편집 중인 HEAD를 바로 외부에 노출하지 않습니다. 검수 snapshot을 만든 뒤 피드백 탭에서 선택하세요.</p>
      <button type="button" onClick={onOpenFeedback} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>검수본 선택</button>
    </section> : null}

    {!checking && subject && verification && !verification.ok ? <section className="rounded-2xl border border-warn/35 bg-warn/10 p-5" role="alert">
      <h3 className="font-black text-fg">선택한 검수본을 다시 확인해야 합니다</h3>
      <p className="mt-1 text-sm text-fg-2">현재 권한, 고정 revision 또는 원고 해시가 달라 다른 버전으로 자동 대체하지 않았습니다.</p>
    </section> : null}

    {verification?.ok && canCreateShare ? <Suspense fallback={<p role="status" className="rounded-2xl border border-line bg-card p-4 text-sm">외부 공유 도구를 불러오는 중…</p>}>
      <StudioPinnedReviewShareManager verified={verification} />
    </Suspense> : null}

    {verification?.ok && verification.review.status === "approved" ? <Suspense fallback={<p role="status" className="rounded-2xl border border-line bg-card p-4 text-sm">승인본 전달 도구를 불러오는 중…</p>}>
      <StudioReviewExport verified={verification} />
    </Suspense> : null}

    <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="project-export-title">
      <div className="flex items-center gap-2">
        <FileArchive className="size-5 text-accent" aria-hidden="true" />
        <div>
          <h2 id="project-export-title" className="font-black text-fg">프로젝트 내보내기</h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">승인 검수본의 원본 ZIP·공식 전달과 별개로, 목적별 변환 프로필을 사용합니다.</p>
        </div>
      </div>
      <div className="mt-4"><StudioExportPanel projectId={projectId} locale="ko" /></div>
    </section>
  </div>;
}
