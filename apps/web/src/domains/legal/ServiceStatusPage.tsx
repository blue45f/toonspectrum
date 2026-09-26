import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CloudOff,
  RefreshCw,
} from "lucide-react";

import {
  requestServiceCapabilityRefresh,
  type ServiceCapabilitiesReport,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

type CapabilityKey = keyof ServiceCapabilitiesReport["capabilities"];

const CAPABILITY_COPY: Record<
  CapabilityKey,
  { readonly label: string; readonly description: string }
> = {
  publicCatalog: {
    label: "작품 탐색·공개 콘텐츠",
    description: "정적 카탈로그와 공개 안내 페이지",
  },
  authSession: {
    label: "로그인 세션",
    description: "현재 로그인 확인과 계정 상태",
  },
  communityRead: {
    label: "커뮤니티 조회",
    description: "게시글·댓글·카페 목록 읽기",
  },
  communityWrite: {
    label: "커뮤니티 작성",
    description: "게시글·댓글·카페 작성과 운영",
  },
  marketplaceRead: {
    label: "마켓 리소스",
    description: "공유 리소스·라이선스·소유 상태 조회",
  },
  studioLocalEditing: {
    label: "Studio 로컬 편집",
    description: "드로잉·레이어·로컬 자동 저장·파일 내보내기",
  },
  studioProjectRead: {
    label: "서버 프로젝트 불러오기",
    description: "서버에 저장된 프로젝트와 버전 조회",
  },
  studioCloudSave: {
    label: "클라우드 저장",
    description: "초안·버전·에셋의 서버 반영",
  },
  realtimeCollaboration: {
    label: "실시간 협업",
    description: "공동 편집·댓글·통화 연결",
  },
  publishing: {
    label: "게시·배포",
    description: "작품 공개와 예약 게시",
  },
  serverAi: {
    label: "서버 AI",
    description: "서버 기반 생성·분석 작업",
  },
};

const STATE_COPY = {
  available: {
    label: "정상",
    className: "border-good/35 bg-good/10 text-good",
  },
  degraded: {
    label: "일부 제한",
    className: "border-warn/40 bg-warn/10 text-warn",
  },
  unavailable: {
    label: "일시 중지",
    className: "border-bad/35 bg-bad/10 text-bad",
  },
} as const;

function formatCheckedAt(value: string | undefined): string {
  if (!value) return "아직 확인하지 못했습니다.";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}
export function ServiceStatusPage() {
  useDocumentTitle("서비스 상태");
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
      <header className="rounded-3xl border border-line bg-card/80 p-6 shadow-sm sm:p-8">
        <p className="eyebrow text-accent">SERVICE STATUS</p>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-2xl border",
              unknown
                ? "border-line bg-panel text-fg-3"
                : degraded
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-good/35 bg-good/10 text-good",
            )}
          >
            {unknown
              ? <CloudOff className="size-6" aria-hidden="true" />
              : degraded
                ? <AlertTriangle className="size-6" aria-hidden="true" />
                : <CheckCircle2 className="size-6" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {unknown
                ? state.checking
                  ? "서비스 상태를 확인하고 있습니다."
                  : "서비스 상태를 아직 확인하지 못했습니다."
                : degraded
                  ? "일부 온라인 기능이 제한되어 있습니다."
                  : "현재 주요 기능이 정상입니다."}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
              {unknown
                ? "상태를 확인하는 동안 현재 입력과 Studio 로컬 작업은 그대로 유지됩니다."
                : degraded
                  ? "탐색과 Studio 로컬 편집은 계속 사용할 수 있습니다. 제한된 온라인 기능은 복구 전까지 읽기 또는 쓰기가 중지될 수 있습니다."
                  : "이 페이지는 사용자가 실제로 이용하는 기능별 상태를 표시합니다. 배포 인프라의 내부 상세 정보는 공개하지 않습니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={requestServiceCapabilityRefresh}
            disabled={state.checking}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 gap-2",
            })}
          >
            <RefreshCw
              className={cn("size-4", state.checking && "animate-spin")}
              aria-hidden="true"
            />
            {state.checking ? "상태 확인 중" : "지금 다시 확인"}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden="true" />
            최근 확인 {formatCheckedAt(report?.checkedAt)}
          </span>
          {report?.incidentId ? (
            <span className="font-mono">장애 ID {report.incidentId}</span>
          ) : null}
        </div>
      </header>
      <section className="mt-8" aria-labelledby="capability-status-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-accent">CAPABILITY STATUS</p>
            <h2 id="capability-status-title" className="mt-2 text-2xl font-bold text-fg">
              기능별 상태
            </h2>
          </div>
          <p className="text-xs text-fg-3">빈 데이터와 장애를 구분해 표시합니다.</p>
        </div>

        {entries.length > 0 ? (
          <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map(([key, capabilityState]) => {
              const copy = CAPABILITY_COPY[key];
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
                      {statusCopy.label}
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
              기능 상태를 아직 확인하지 못했습니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              인터넷 연결을 확인한 뒤 다시 시도해 주세요. 현재 입력이나 로컬 작업은 유지됩니다.
            </p>
          </div>
        )}
      </section>

      {state.lastError ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-warn/40 bg-warn/10 p-4"
        >
          <h2 className="text-sm font-bold text-fg">마지막 상태 확인에 실패했습니다.</h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">{state.lastError.message}</p>
          {state.lastError.requestId ? (
            <p className="mt-2 font-mono text-[0.68rem] text-fg-3">
              요청 ID {state.lastError.requestId}
            </p>
          ) : null}
        </section>
      ) : null}
    </Container>
  );
}
