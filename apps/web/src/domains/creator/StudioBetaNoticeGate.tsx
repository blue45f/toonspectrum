import "./studio-shell/studio-visual-identity-v2.css";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  acknowledgeStudioBetaNotice,
  hasAcknowledgedStudioBetaNotice,
} from "./studio-beta-notice-storage";
import { isStudioRoutePathname } from "./studio-workspace-route";

interface StudioBetaNoticeGateProps {
  readonly pathname: string;
}

const COPY = {
  ko: {
    badge: "BETA TEST",
    title: "툰스튜디오는 현재 베타 테스트 중입니다",
    intro:
      "저장 정책과 기능이 바뀔 수 있습니다. 캔버스 작업은 계속할 수 있으며, 중요한 결과물은 별도로 백업해 주세요.",
    dataTitle: "저장 데이터 초기화 가능",
    dataBody:
      "테스트 또는 장애 복구 과정에서 프로젝트, 설정 등 일부 또는 전체 데이터가 초기화될 수 있습니다.",
    policyTitle: "기능·정책 수시 변경",
    policyBody:
      "기능, 화면 구성, 이용 범위와 운영 정책은 테스트 결과에 따라 자주 변경될 수 있습니다.",
    backupTitle: "중요한 작업은 별도 백업",
    backupBody:
      "원본 파일과 중요한 결과물은 로컬 파일이나 별도 저장소에 반드시 백업해 주세요.",
    acknowledgement:
      "위 내용을 확인했으며 베타 테스트 환경임을 이해합니다.",
    action: "확인했어요",
    showDetails: "주의사항 자세히",
    hideDetails: "주의사항 접기",
    revision:
      "현재 고지 버전은 브라우저별 한 번만 표시되며, 내용이 변경되면 다시 안내됩니다.",
  },
  en: {
    badge: "BETA TEST",
    title: "ToonStudio is currently in beta testing",
    intro:
      "Storage policies and features may change. You can keep working on the canvas, but keep a separate backup of important results.",
    dataTitle: "Stored data may be reset",
    dataBody:
      "Some or all project and settings data may be reset during testing or incident recovery.",
    policyTitle: "Features and policies may change",
    policyBody:
      "Features, interface structure, availability, and operating policies may change frequently based on test results.",
    backupTitle: "Keep a separate backup",
    backupBody:
      "Back up original files and important results locally or in another storage location.",
    acknowledgement:
      "I understand that this is a beta test environment.",
    action: "I understand",
    showDetails: "Review beta risks",
    hideDetails: "Hide beta risks",
    revision:
      "This notice appears once per browser for the current revision and will appear again when the notice changes.",
  },
} as const;

export function StudioBetaNoticeGate({ pathname }: StudioBetaNoticeGateProps) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const copy = korean ? COPY.ko : COPY.en;
  const eligible = isStudioRoutePathname(pathname);
  const titleId = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(
    () => eligible && !hasAcknowledgedStudioBetaNotice(),
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!eligible) {
      setOpen(false);
      setDetailsOpen(false);
      return;
    }
    setOpen(!hasAcknowledgedStudioBetaNotice());
  }, [eligible]);

  const acknowledge = () => {
    acknowledgeStudioBetaNotice();
    setOpen(false);
    setDetailsOpen(false);
  };

  if (!eligible || !open) return null;

  const notices = [
    {
      icon: Database,
      title: copy.dataTitle,
      body: copy.dataBody,
      tone: "border-bad/30 bg-bad/10 text-bad",
    },
    {
      icon: RefreshCw,
      title: copy.policyTitle,
      body: copy.policyBody,
      tone: "border-warning/35 bg-warning-soft text-warning",
    },
    {
      icon: ShieldCheck,
      title: copy.backupTitle,
      body: copy.backupBody,
      tone: "border-accent/30 bg-accent/10 text-accent",
    },
  ] as const;

  return (
    <div
      data-studio-beta-notice-host="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[90] flex justify-end px-3 sm:bottom-4 sm:px-4"
    >
      <aside
        role="region"
        aria-labelledby={titleId}
        aria-live="polite"
        data-studio-beta-notice="true"
        data-stable-contrast="true"
        data-studio-beta-notice-mode="compact"
        className="pointer-events-auto grid w-[min(31rem,calc(100vw-1.5rem))] grid-cols-[minmax(0,1fr)_auto] overflow-hidden sm:block rounded-2xl border border-warning/45 bg-panel/95 text-fg shadow-[0_20px_70px_oklch(0.05_0.02_265/0.55)] backdrop-blur-xl"
      >
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 p-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-warning/40 bg-warning-soft text-warning">
            <AlertTriangle size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-[0.62rem] font-black tracking-[0.14em] text-warning">
                {copy.badge}
              </span>
              <h2 id={titleId} className="sr-only">{copy.title}</h2>
              <p aria-hidden="true" className="text-xs font-black leading-5 text-fg sm:text-sm">
                {korean ? "중요 작업은 별도 백업하세요" : "Keep a separate backup"}
              </p>
            </div>
            <p className="mt-1 hidden text-[0.68rem] leading-5 text-fg-2 lg:block">{copy.intro}</p>
          </div>
        </div>

        {detailsOpen ? (
          <div id={detailsId} className="col-span-2 grid max-h-[55dvh] gap-2 overflow-y-auto border-t border-line/70 px-3.5 py-3 sm:px-4">
            {notices.map(({ icon: Icon, title, body, tone }) => (
              <section key={title} className="flex gap-2.5 rounded-xl border border-line bg-card/75 p-3">
                <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-lg border ${tone}`}>
                  <Icon size={15} />
                </span>
                <div>
                  <h3 className="text-xs font-black text-fg">{title}</h3>
                  <p className="mt-0.5 text-[0.7rem] leading-5 text-fg-2">{body}</p>
                </div>
              </section>
            ))}
            <p className="rounded-xl bg-raised/70 px-3 py-2 text-[0.7rem] font-bold leading-5 text-fg">
              {copy.acknowledgement}
            </p>
            <p className="text-center text-[0.62rem] leading-4 text-fg-3">{copy.revision}</p>
          </div>
        ) : null}

        <div className="col-start-2 row-start-1 flex items-center gap-1 border-l border-line/70 bg-card/45 p-2 sm:flex sm:border-l-0 sm:border-t sm:justify-end sm:gap-2 sm:px-4">
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((current) => !current)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {detailsOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            <span className="sr-only sm:not-sr-only">{detailsOpen ? copy.hideDetails : copy.showDetails}</span>
          </button>
          <button
            type="button"
            aria-label={copy.action}
            data-studio-beta-notice-acknowledge="true"
            onClick={acknowledge}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-xs font-black text-on-accent shadow-sm transition hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="sm:hidden">{korean ? "확인" : "OK"}</span>
            <span className="hidden sm:inline">{copy.action}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export default StudioBetaNoticeGate;
