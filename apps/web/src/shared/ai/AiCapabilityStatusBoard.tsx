import {
  AudioLines,
  Box,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cloud,
  HardDrive,
  Image,
  Mic2,
  Music2,
  PenTool,
  Server,
  WalletCards,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/platform/api";

import {
  buildAiCapabilityRegistry,
  type AiCapabilityAvailability,
  type AiCapabilityExecution,
  type AiCapabilityStatusItem,
} from "./ai-capability-registry";
import { useUnifiedAiAuxSettings } from "./unified-ai-settings";

interface CreatorIntelligenceRemoteStatus {
  readonly paidExecution?: {
    readonly enabled: boolean;
    readonly reason: "ready" | "disabled" | "coordination-required";
  };
  readonly voice?: Readonly<Record<string, { readonly status?: string }>>;
  readonly soundEffects?: { readonly status?: string };
}

interface MusicRemoteStatus {
  readonly enabled: boolean;
  readonly reason: "ready" | "disabled" | "configuration-required";
}

export interface AiCapabilityStatusBoardProps {
  readonly managedText: "ready" | "checking" | "unavailable";
  readonly userText: boolean;
  readonly userImage: boolean;
  readonly userInference: boolean;
  readonly userThreeD: boolean;
}

type RemoteState =
  | { readonly mode: "checking" }
  | {
      readonly mode: "ready";
      readonly creator: CreatorIntelligenceRemoteStatus | null;
      readonly music: MusicRemoteStatus | null;
    };

const STATUS_LABELS: Readonly<Record<AiCapabilityAvailability, string>> = {
  ready: "사용 가능",
  "setup-required": "연결 필요",
  unavailable: "현재 비활성",
  checking: "확인 중",
  local: "기기에서 사용",
};
const EXECUTION_LABELS: Readonly<Record<AiCapabilityExecution, string>> = {
  "service-cloud": "서비스 클라우드",
  "browser-byok": "브라우저 · 내 키",
  "external-runtime": "외부 Runtime",
  "local-device": "기기 내부",
};

const ICONS: Readonly<Record<AiCapabilityStatusItem["id"], typeof Cloud>> = {
  text: Cloud,
  image: Image,
  music: Music2,
  voice: Mic2,
  "sound-effect": AudioLines,
  "three-d": Box,
  "external-runtime": Server,
  "smart-tools": PenTool,
};

function providerReady(
  providers: Readonly<Record<string, { readonly status?: string }>> | undefined,
): boolean {
  return Boolean(providers && Object.values(providers).some((provider) =>
    provider.status === "ready",
  ));
}

function statusClasses(status: AiCapabilityAvailability): string {
  if (status === "ready" || status === "local") {
    return "border-good/35 bg-good/10 text-good";
  }
  if (status === "checking") {
    return "border-line bg-raised text-fg-2";
  }
  if (status === "setup-required") {
    return "border-warn/35 bg-warn/10 text-warn";
  }
  return "border-bad/30 bg-bad/10 text-bad";
}

function StatusIcon({ status }: { readonly status: AiCapabilityAvailability }) {
  if (status === "ready" || status === "local") {
    return <CheckCircle2 size={14} aria-hidden />;
  }
  if (status === "checking") return <Clock3 size={14} aria-hidden />;
  return <CircleAlert size={14} aria-hidden />;
}

function metadata(item: AiCapabilityStatusItem): readonly string[] {
  const billing = item.billing === "service"
    ? "서비스 한도"
    : item.billing === "creator"
      ? "내 계정 비용"
      : "비용 없음";
  const storage = item.persistence === "project"
    ? "프로젝트 저장"
    : item.persistence === "device"
      ? "기기 저장"
      : item.persistence === "provider-runtime"
        ? "Runtime 저장"
        : "혼합 저장";
  return [EXECUTION_LABELS[item.execution], billing, storage];
}

export function AiCapabilityStatusBoard({
  managedText,
  userText,
  userImage,
  userInference,
  userThreeD,
}: AiCapabilityStatusBoardProps) {
  const aux = useUnifiedAiAuxSettings();
  const [remote, setRemote] = useState<RemoteState>({ mode: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      api.get<CreatorIntelligenceRemoteStatus>("/creator-intelligence/status", {
        signal: controller.signal,
        credentials: "omit",
        timeout: 8_000,
        retry: 0,
      }),
      api.get<MusicRemoteStatus>("/studio-music/status", {
        signal: controller.signal,
        timeout: 8_000,
        retry: 0,
      }),
    ]).then(([creator, music]) => {
      if (controller.signal.aborted) return;
      setRemote({
        mode: "ready",
        creator: creator.status === "fulfilled" ? creator.value : null,
        music: music.status === "fulfilled" ? music.value : null,
      });
    });
    return () => controller.abort();
  }, []);

  const items = useMemo(() => {
    const creator = remote.mode === "ready" ? remote.creator : null;
    const paidExecution = remote.mode === "checking"
      ? "checking" as const
      : !creator
        ? "unavailable" as const
        : creator.paidExecution?.enabled
          ? "ready" as const
          : creator.paidExecution?.reason === "coordination-required"
            ? "coordination-required" as const
            : "disabled" as const;
    const music = remote.mode === "checking"
      ? "checking" as const
      : !remote.music
        ? "unavailable" as const
        : remote.music.enabled && remote.music.reason === "ready"
          ? "ready" as const
          : remote.music.reason === "disabled"
            ? "disabled" as const
            : "unavailable" as const;

    return buildAiCapabilityRegistry({
      managedText,
      userText,
      userImage,
      userInference,
      userThreeD,
      hyper3d: Boolean(aux.settings.hyper3dApiKey),
      externalRuntime: Boolean(
        aux.settings.creatorRuntimeBaseUrl && aux.settings.creatorRuntimeToken,
      ),
      creatorPaidExecution: paidExecution,
      voiceProvider: providerReady(creator?.voice),
      soundEffectProvider: creator?.soundEffects?.status === "ready",
      music,
    });
  }, [
    aux.settings.creatorRuntimeBaseUrl,
    aux.settings.creatorRuntimeToken,
    aux.settings.hyper3dApiKey,
    managedText,
    remote,
    userImage,
    userInference,
    userText,
    userThreeD,
  ]);

  const readyCount = items.filter((item) =>
    item.availability === "ready" || item.availability === "local",
  ).length;
  const setupCount = items.filter((item) => item.availability === "setup-required").length;

  return (
    <section
      aria-labelledby="ai-capability-status-title"
      className="overflow-hidden rounded-3xl border border-line bg-panel/60"
      data-ai-capability-status-board="true"
    >
      <header className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-2 text-accent">
            <WandSparkles size={14} aria-hidden /> CAPABILITY STATUS
          </p>
          <h3 id="ai-capability-status-title" className="mt-1 text-lg font-black">
            기능별 AI 사용 상태
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">
            연결됨 하나로 표시하지 않고, 실행 위치·비용 부담·저장 위치를 기능마다 구분합니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="min-w-24 rounded-xl border border-good/25 bg-good/10 px-3 py-2">
            <span className="block text-[11px] text-fg-3">바로 사용</span>
            <strong className="text-lg text-good">{readyCount}</strong>
          </div>
          <div className="min-w-24 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2">
            <span className="block text-[11px] text-fg-3">연결 필요</span>
            <strong className="text-lg text-warn">{setupCount}</strong>
          </div>
        </div>
      </header>

      <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = ICONS[item.id];
          return (
            <article key={item.id} className="min-w-0 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                  <Icon size={19} />
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${statusClasses(item.availability)}`}>
                  <StatusIcon status={item.availability} />
                  {STATUS_LABELS[item.availability]}
                </span>
              </div>
              <h4 className="mt-3 font-bold">{item.title}</h4>
              <p className="mt-1 min-h-10 text-xs leading-5 text-fg-3">{item.description}</p>
              <p className="mt-3 text-xs font-semibold text-fg-2">{item.availabilityDetail}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metadata(item).map((label, index) => {
                  const MetaIcon = index === 0 ? Cloud : index === 1 ? WalletCards : HardDrive;
                  return (
                    <span key={label} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-1 text-[10px] text-fg-3">
                      <MetaIcon size={11} aria-hidden /> {label}
                    </span>
                  );
                })}
              </div>
              {!item.generative && (
                <p className="mt-3 rounded-lg border border-line bg-raised/60 px-2 py-1.5 text-[10px] leading-4 text-fg-3">
                  생성형 AI가 아닌 로컬 규칙 기반 도구입니다.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
