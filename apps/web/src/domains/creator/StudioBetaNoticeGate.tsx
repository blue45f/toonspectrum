import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
      "아직 정식 오픈 전의 테스트 버전입니다. 안정성과 운영 정책을 계속 개선하고 있어 아래와 같은 변경이 발생할 수 있습니다.",
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
    action: "확인하고 툰스튜디오 시작하기",
    revision:
      "이 안내는 현재 고지 버전에 대해 브라우저별 한 번 표시되며, 내용이 변경되면 다시 안내됩니다.",
  },
  en: {
    badge: "BETA TEST",
    title: "ToonStudio is currently in beta testing",
    intro:
      "This is a pre-release test version. As stability and operating policies continue to evolve, the following may occur.",
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
    action: "I understand — enter ToonStudio",
    revision:
      "This notice appears once per browser for the current revision and will appear again when the notice changes.",
  },
} as const;

export function StudioBetaNoticeGate({ pathname }: StudioBetaNoticeGateProps) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const copy = korean ? COPY.ko : COPY.en;
  const eligible = isStudioRoutePathname(pathname);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(
    () => eligible && !hasAcknowledgedStudioBetaNotice(),
  );

  useEffect(() => {
    if (!eligible) {
      setOpen(false);
      return;
    }
    if (!hasAcknowledgedStudioBetaNotice()) setOpen(true);
  }, [eligible]);

  const acknowledge = () => {
    acknowledgeStudioBetaNotice();
    setOpen(false);
  };

  if (!eligible) return null;

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
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-studio-beta-notice-overlay="true"
          className="fixed inset-0 z-[9998] bg-[oklch(0.09_0.018_265/0.88)] backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        />
        <Dialog.Content
          data-studio-beta-notice="true"
          data-stable-contrast="true"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const focusAction = () => actionRef.current?.focus();
            if (typeof window.requestAnimationFrame === "function") {
              window.requestAnimationFrame(focusAction);
            } else {
              focusAction();
            }
          }}
          className="fixed left-1/2 top-1/2 z-[9999] max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] border border-line-strong bg-panel p-5 text-fg shadow-2xl outline-none sm:p-8"
        >
          <div className="flex items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-warning/40 bg-warning-soft text-warning shadow-inner">
              <AlertTriangle size={28} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="inline-flex rounded-full border border-warning/40 bg-warning-soft px-3 py-1 text-[0.68rem] font-black tracking-[0.16em] text-warning">
                {copy.badge}
              </p>
              <Dialog.Title className="mt-3 font-display text-2xl font-black leading-tight tracking-[-0.03em] text-fg sm:text-3xl">
                {copy.title}
              </Dialog.Title>
            </div>
          </div>

          <Dialog.Description className="mt-5 text-sm leading-6 text-fg-2 sm:text-base sm:leading-7">
            {copy.intro}
          </Dialog.Description>

          <div className="mt-6 grid gap-3">
            {notices.map(({ icon: Icon, title, body, tone }) => (
              <section
                key={title}
                className="flex gap-3 rounded-2xl border border-line bg-card p-4"
              >
                <span
                  aria-hidden
                  className={`grid size-10 shrink-0 place-items-center rounded-xl border ${tone}`}
                >
                  <Icon size={19} />
                </span>
                <div>
                  <h3 className="text-sm font-black text-fg sm:text-base">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm sm:leading-6">
                    {body}
                  </p>
                </div>
              </section>
            ))}
          </div>

          <p className="mt-6 rounded-2xl border border-line-strong bg-raised/70 px-4 py-3 text-sm font-bold leading-6 text-fg">
            {copy.acknowledgement}
          </p>

          <button
            ref={actionRef}
            type="button"
            onClick={acknowledge}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-black text-on-accent shadow-lg transition hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {copy.action}
          </button>

          <p className="mt-3 text-center text-[0.68rem] leading-5 text-fg-3">
            {copy.revision}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default StudioBetaNoticeGate;
