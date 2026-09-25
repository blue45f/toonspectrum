import {
  CheckCircle2,
  CircleAlert,
  RefreshCw,
} from "lucide-react";

import {
  requestServiceCapabilityRefresh,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";
import { Container } from "@/shared/components/section";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const CAPABILITIES = [
  ["publicCatalog", "작품 탐색", "정적 카탈로그와 공개 작품 정보를 확인합니다."],
  ["authSession", "로그인 상태", "기존 로그인 상태를 안전하게 유지합니다."],
  ["communityRead", "커뮤니티 조회", "글·댓글·커뮤니티 목록을 불러옵니다."],
  ["communityWrite", "커뮤니티 작성", "글·댓글·커뮤니티 변경을 저장합니다."],
  ["marketplaceRead", "마켓 리소스", "공유 리소스와 소유 내역을 확인합니다."],
  ["studioLocalEditing", "로컬 편집", "드로잉·레이어·로컬 자동 저장을 사용합니다."],
  ["studioProjectRead", "서버 프로젝트", "서버 프로젝트와 revision을 불러옵니다."],
  ["studioCloudSave", "클라우드 저장", "원고를 서버에 저장하고 동기화합니다."],
  ["realtimeCollaboration", "실시간 협업", "공동 편집과 팀 연결을 사용합니다."],
  ["publishing", "게시", "작품과 리소스를 공개합니다."],
  ["serverAi", "서버 AI", "서버 기반 AI 도구를 사용합니다."],
] as const;

export function ServiceStatusPage() {
  useDocumentTitle("서비스 상태");
  const state = useServiceCapabilityState();
  const report = state.report;

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="eyebrow text-accent">SERVICE STATUS</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
          서비스 상태
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-2 sm:text-base">
          전체 서비스가 아니라 기능별 상태를 표시합니다. 제한된 기능이 있어도 작품 탐색과 로컬 편집은 계속 사용할 수 있습니다.
        </p>
      </header>

      <section className="mt-8 rounded-3xl border border-line bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          {state.status === "degraded" ? (
            <CircleAlert className="size-6 text-warn" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-6 text-good" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">
              {state.status === "degraded"
                ? "일부 온라인 기능 제한"
                : state.status === "available"
                  ? "주요 기능 정상"
                  : "상태 확인 중"}
            </h2>
            <p className="mt-0.5 text-xs text-fg-3">
              {report?.checkedAt
                ? `마지막 확인 ${new Date(report.checkedAt).toLocaleString("ko-KR")}`
                : "아직 서버 상태를 확인하지 못했습니다."}
              {report?.incidentId ? ` · 장애 참조 ${report.incidentId}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={requestServiceCapabilityRefresh}
            disabled={state.checking}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${state.checking ? "animate-spin" : ""}`} aria-hidden="true" />
            다시 확인
          </button>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="capability-status-title">
        <h2 id="capability-status-title" className="text-xl font-bold">
          기능별 상태
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(([key, label, description]) => {
            const value = report?.capabilities[key] ?? "available";
            const available = value === "available";
            return (
              <li
                key={key}
                className={`rounded-2xl border p-4 ${available ? "border-line bg-card" : "border-warn/40 bg-warn/10"}`}
              >
                <div className="flex items-center gap-2">
                  {available ? (
                    <CheckCircle2 className="size-4 text-good" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="size-4 text-warn" aria-hidden="true" />
                  )}
                  <h3 className="font-bold">{label}</h3>
                  <span className={`ml-auto text-xs font-semibold ${available ? "text-good" : "text-warn"}`}>
                    {available ? "사용 가능" : "일시 제한"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fg-2">{description}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-panel p-5 text-sm leading-relaxed text-fg-2">
        <h2 className="font-bold text-fg">장애 중 데이터 보호 원칙</h2>
        <p className="mt-2">
          목록을 조회하지 못한 경우 0건으로 표시하지 않습니다. 작성 중인 입력은 유지하고, 스튜디오는 로컬 자동 저장과 파일 내보내기를 계속 제공합니다. 결제·게시·삭제처럼 중복 실행 위험이 있는 작업은 자동으로 다시 실행하지 않습니다.
        </p>
      </section>
    </Container>
  );
}

export default ServiceStatusPage;
