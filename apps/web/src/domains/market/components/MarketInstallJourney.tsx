import {
  CheckCircle2,
  CircleDashed,
  CloudDownload,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import type { MarketDeviceInstallSnapshot } from "../hooks/use-market-device-install";
import type { MarketStudioHandoff } from "../models/market-studio-handoff";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";

type JourneyStepState = "complete" | "active" | "pending" | "optional";

interface JourneyStep {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly state: JourneyStepState;
  readonly icon: typeof CheckCircle2;
}

function actionTitle(
  handoff: MarketStudioHandoff,
  record: Pick<CreatorMarketplaceResourceRecord, "resourceVersion">,
  snapshot: MarketDeviceInstallSnapshot,
): string {
  if (handoff.mode === "insert-current-canvas") return "현재 캔버스에 삽입";
  if (handoff.mode === "open-template-catalog") return "템플릿 카탈로그 열기";
  if (handoff.mode === "open-3d-background-catalog") return "3D 배경 카탈로그 열기";
  if (handoff.mode === "open-3d-asset-library") return "3D 에셋 라이브러리 열기";
  if (snapshot.state === "update-available") {
    return `기기 설치를 v${record.resourceVersion}로 업데이트`;
  }
  return "기기 Studio 라이브러리에 설치";
}

function journeySteps({
  acquired,
  handoff,
  record,
  snapshot,
}: {
  readonly acquired: boolean;
  readonly handoff: MarketStudioHandoff;
  readonly record: Pick<CreatorMarketplaceResourceRecord, "resourceVersion">;
  readonly snapshot: MarketDeviceInstallSnapshot;
}): readonly JourneyStep[] {
  const installed = snapshot.state === "installed-current";
  const updateAvailable = snapshot.state === "update-available";
  const installablePack = handoff.mode === "install-tool-pack";
  const downloadDetail = installed
    ? `v${record.resourceVersion} 패키지와 게시 매니페스트 해시가 이 브라우저의 설치 영수증과 일치합니다.`
    : updateAvailable
      ? `현재 기기에는 v${snapshot.receipt?.packageVersion ?? "?"}가 있습니다. Studio가 v${record.resourceVersion} 공개 릴리스를 다시 내려받아 해시와 호환성을 확인합니다.`
      : "Studio가 현재 공개 릴리스를 다시 조회하고, 패키지 크기·매니페스트 해시·엔진 호환성을 확인한 뒤 다음 단계로 진행합니다.";

  return [
    {
      id: "library",
      title: acquired ? "계정 보관 완료" : "내 보관함에 추가 (선택)",
      detail: acquired
        ? "계정 라이브러리에서 다시 찾을 수 있습니다. 계정 보관은 현재 기기 설치와 별도입니다."
        : "내 에셋 보관은 계정에 찾기 쉬운 링크와 권리 정보를 보관합니다. 설치 없이도 먼저 보관할 수 있습니다.",
      state: acquired ? "complete" : "optional",
      icon: FolderOpen,
    },
    {
      id: "download",
      title: "다운로드·무결성 검증",
      detail: downloadDetail,
      state: installed ? "complete" : "active",
      icon: installed ? ShieldCheck : updateAvailable ? RefreshCw : CloudDownload,
    },
    {
      id: "activate",
      title: actionTitle(handoff, record, snapshot),
      detail: handoff.summary,
      state: installed && installablePack ? "complete" : "pending",
      icon: installed && installablePack ? CheckCircle2 : CircleDashed,
    },
    {
      id: "destination",
      title: `사용·관리 위치 · ${handoff.destinationLabel}`,
      detail: handoff.completionEvidence,
      state: installed && installablePack ? "active" : "pending",
      icon: CircleDashed,
    },
  ];
}

const STATE_LABEL: Readonly<Record<JourneyStepState, string>> = {
  complete: "완료",
  active: "다음 단계",
  pending: "대기",
  optional: "선택",
};

export function MarketInstallJourney({
  acquired,
  handoff,
  record,
  snapshot,
}: {
  readonly acquired: boolean;
  readonly handoff: MarketStudioHandoff;
  readonly record: Pick<CreatorMarketplaceResourceRecord, "resourceVersion">;
  readonly snapshot: MarketDeviceInstallSnapshot;
}) {
  const steps = journeySteps({ acquired, handoff, record, snapshot });

  return (
    <section
      aria-labelledby="market-install-journey-heading"
      className="rounded-xl border border-line bg-panel/55 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="market-install-journey-heading" className="text-xs font-bold text-fg">
            실제 다운로드·설치 흐름
          </h2>
          <p className="mt-0.5 text-[0.66rem] leading-relaxed text-fg-3">
            소장, 기기 다운로드, 설치 또는 적용을 서로 다른 상태로 확인합니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-good/30 bg-good/10 px-2 py-0.5 text-[0.6rem] font-bold text-good">
          해시 검증
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              data-market-install-step={step.id}
              data-market-install-step-state={step.state}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2"
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[0.62rem] font-black",
                  step.state === "complete"
                    ? "border-good/40 bg-good/15 text-good"
                    : step.state === "active"
                      ? "border-accent/45 bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-3",
                )}
                aria-hidden="true"
              >
                {step.state === "complete"
                  ? <Icon className="size-3.5" />
                  : index + 1}
              </span>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <h3 className="text-[0.7rem] font-bold text-fg">{step.title}</h3>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[0.56rem] font-semibold",
                      step.state === "complete"
                        ? "bg-good/10 text-good"
                        : step.state === "active"
                          ? "bg-accent/10 text-accent"
                          : "bg-raised text-fg-3",
                    )}
                  >
                    {STATE_LABEL[step.state]}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.64rem] leading-relaxed text-fg-3">
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
