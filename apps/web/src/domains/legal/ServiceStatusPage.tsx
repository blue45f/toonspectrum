import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CloudOff,
  RefreshCw,
} from "lucide-react";

import { SitePageHeader } from "./public/site-page-header";

import {
  requestServiceCapabilityRefresh,
  type ServiceCapabilitiesReport,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("ServiceStatusPage", ko, en);

type CapabilityKey = keyof ServiceCapabilitiesReport["capabilities"];

const CAPABILITY_COPY: Record<
  CapabilityKey,
  { readonly ko: { readonly label: string; readonly description: string }; readonly en: { readonly label: string; readonly description: string } }
> = {
  publicCatalog: {
    ko: { label: "작품 탐색·공개 콘텐츠", description: "정적 카탈로그와 공개 안내 페이지" },
    en: { label: "Discovery & public content", description: "Static catalog and public guide pages" },
  },
  authSession: {
    ko: { label: "로그인 세션", description: "현재 로그인 확인과 계정 상태" },
    en: { label: "Login session", description: "Current sign-in check and account status" },
  },
  communityRead: {
    ko: { label: "커뮤니티 조회", description: "게시글·댓글·카페 목록 읽기" },
    en: { label: "Community reading", description: "Reading posts, comments and cafe lists" },
  },
  communityWrite: {
    ko: { label: "커뮤니티 작성", description: "게시글·댓글·카페 작성과 운영" },
    en: { label: "Community writing", description: "Writing and managing posts, comments and cafes" },
  },
  marketplaceRead: {
    ko: { label: "마켓 리소스", description: "공유 리소스·라이선스·소유 상태 조회" },
    en: { label: "Market resources", description: "Viewing shared resources, licenses and ownership state" },
  },
  studioLocalEditing: {
    ko: { label: "Studio 로컬 편집", description: "드로잉·레이어·로컬 자동 저장·파일 내보내기" },
    en: { label: "Studio local editing", description: "Drawing, layers, local autosave and file export" },
  },
  studioProjectRead: {
    ko: { label: "서버 프로젝트 불러오기", description: "서버에 저장된 프로젝트와 버전 조회" },
    en: { label: "Load server projects", description: "Viewing projects and versions saved on the server" },
  },
  studioCloudSave: {
    ko: { label: "클라우드 저장", description: "초안·버전·에셋의 서버 반영" },
    en: { label: "Cloud save", description: "Syncing drafts, versions and assets to the server" },
  },
  realtimeCollaboration: {
    ko: { label: "실시간 협업", description: "공동 편집·댓글·통화 연결" },
    en: { label: "Realtime collaboration", description: "Co-editing, comments and call connections" },
  },
  publishing: {
    ko: { label: "게시·배포", description: "작품 공개와 예약 게시" },
    en: { label: "Publishing", description: "Publishing works and scheduled releases" },
  },
  serverAi: {
    ko: { label: "서버 AI", description: "서버 기반 생성·분석 작업" },
    en: { label: "Server AI", description: "Server-based generation and analysis jobs" },
  },
};

const STATE_COPY = {
  available: {
    ko: "정상",
    en: "Operational",
    className: "border-good/35 bg-good/10 text-good",
  },
  degraded: {
    ko: "일부 제한",
    en: "Partially limited",
    className: "border-warn/40 bg-warn/10 text-warn",
  },
  unavailable: {
    ko: "일시 중지",
    en: "Paused",
    className: "border-bad/35 bg-bad/10 text-bad",
  },
} as const;

function formatCheckedAt(value: string | undefined): string {
  if (!value) return bi("아직 확인하지 못했습니다.", "Not checked yet.");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const locale = getActiveI18nLocale().startsWith("en") ? "en-US" : "ko-KR";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}
export function ServiceStatusPage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("서비스 상태", "Service status"));
  const state = useServiceCapabilityState();
  const report = state.report;
  const unknown = state.status === "unknown";
  const degraded = state.status === "degraded";
  const entries = report
    ? Object.entries(report.capabilities) as Array<[
        CapabilityKey,
        ServiceCapabilitiesReport["capabilities"][CapabilityKey],
      ]>
    : [];

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <SitePageHeader
        icon={Activity}
        eyebrow="SERVICE STATUS"
        title={
          unknown
            ? state.checking
              ? bi("서비스 상태를 확인하고 있습니다.", "Checking the service status.")
              : bi("서비스 상태를 아직 확인하지 못했습니다.", "The service status has not been checked yet.")
            : degraded
              ? bi("일부 온라인 기능이 제한되어 있습니다.", "Some online features are limited.")
              : bi("현재 주요 기능이 정상입니다.", "Key features are currently operational.")
        }
        description={
          unknown
            ? bi("상태를 확인하는 동안 현재 입력과 Studio 로컬 작업은 그대로 유지됩니다.", "Your current input and Studio local work are preserved while the status is being checked.")
            : degraded
              ? bi("탐색과 Studio 로컬 편집은 계속 사용할 수 있습니다. 제한된 온라인 기능은 복구 전까지 읽기 또는 쓰기가 중지될 수 있습니다.", "Discovery and Studio local editing remain available. Limited online features may stop reading or writing until recovery.")
              : bi("이 페이지는 사용자가 실제로 이용하는 기능별 상태를 표시합니다. 배포 인프라의 내부 상세 정보는 공개하지 않습니다.", "This page shows the status of the features you actually use. Internal deployment infrastructure details are not published.")
        }
        actions={
          <>
            <button
              type="button"
              onClick={requestServiceCapabilityRefresh}
              disabled={state.checking}
              className={buttonClass({ size: "md", className: "min-h-11 gap-2" })}
            >
              <RefreshCw className={cn("size-4", state.checking && "animate-spin")} aria-hidden="true" />
              {state.checking ? bi("상태 확인 중", "Checking…") : bi("지금 다시 확인", "Check again")}
            </button>
            <Link href="/feedback" className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11" })}>
              {bi("문제 제보하기", "Report a problem")}
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-3">
          <span
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 font-bold",
              unknown
                ? "border-line bg-panel text-fg-2"
                : degraded
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-good/35 bg-good/10 text-good",
            )}
          >
            {unknown
              ? <CloudOff className="size-4" aria-hidden="true" />
              : degraded
                ? <AlertTriangle className="size-4" aria-hidden="true" />
                : <CheckCircle2 className="size-4" aria-hidden="true" />}
            {unknown ? bi("확인 전", "Unchecked") : degraded ? bi("일부 제한", "Partially limited") : bi("정상", "Operational")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {bi("최근 확인", "Last checked")} {formatCheckedAt(report?.checkedAt)}
          </span>
          {report?.incidentId ? (
            <span className="font-mono">{bi("장애 ID", "Incident ID")} {report.incidentId}</span>
          ) : null}
        </div>
      </SitePageHeader>
      <section className="mt-8" aria-labelledby="capability-status-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-accent">CAPABILITY STATUS</p>
            <h2 id="capability-status-title" className="mt-2 text-2xl font-bold text-fg">
              {bi("기능별 상태", "Status by feature")}
            </h2>
          </div>
          <p className="text-xs text-fg-3">{bi("빈 데이터와 장애를 구분해 표시합니다.", "Empty data and outages are shown differently.")}</p>
        </div>

        {entries.length > 0 ? (
          <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map(([key, capabilityState]) => {
              const copy = bi(CAPABILITY_COPY[key].ko, CAPABILITY_COPY[key].en);
              const statusCopy = STATE_COPY[capabilityState];
              return (
                <li key={key} className="rounded-2xl border border-line bg-card/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-fg">{copy.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-fg-3">{copy.description}</p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold",
                      statusCopy.className,
                    )}>
                      {bi(statusCopy.ko, statusCopy.en)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-panel/50 p-8 text-center">
            <CloudOff className="mx-auto size-6 text-fg-3" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-fg">
              {bi("기능 상태를 아직 확인하지 못했습니다.", "Feature status has not been checked yet.")}
            </p>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              {bi("인터넷 연결을 확인한 뒤 다시 시도해 주세요. 현재 입력이나 로컬 작업은 유지됩니다.", "Check your connection and try again. Your current input and local work are preserved.")}
            </p>
          </div>
        )}
      </section>

      {state.lastError ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-warn/40 bg-warn/10 p-4"
        >
          <h2 className="text-sm font-bold text-fg">{bi("마지막 상태 확인에 실패했습니다.", "The last status check failed.")}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">{state.lastError.message}</p>
          {state.lastError.requestId ? (
            <p className="mt-2 font-mono text-[0.68rem] text-fg-3">
              {bi("요청 ID", "Request ID")} {state.lastError.requestId}
            </p>
          ) : null}
        </section>
      ) : null}
    </Container>
  );
}
