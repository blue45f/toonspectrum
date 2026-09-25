import {
  ClipboardCopy,
  ExternalLink,
  FileJson2,
  PlugZap,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import {
  buildMusicProviderHandoff,
  MUSIC_PROVIDER_CATALOG,
  MUSIC_PROVIDER_VERIFIED_AT,
  type MusicProviderCapability,
  type MusicProviderId,
} from "./studio-music-provider-catalog";

import type { MusicBrief } from "@toonspectrum/core/studio-music";

interface MusicProviderToolkitProps {
  readonly brief: MusicBrief;
  readonly prompt: string;
  readonly onNotice: (message: string) => void;
  readonly onError: (message: string) => void;
}

const capabilityLabels: Record<MusicProviderCapability, string> = {
  browser: "WEB",
  api: "API",
  cli: "CLI",
  mcp: "MCP",
  local: "LOCAL",
};
const policyLabels = {
  "site-original": "사이트 원본 제작",
  "commercial-review": "상업 이용 검수",
  "license-review": "라이선스 검수",
  "draft-only": "시안 전용",
} as const;

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9가-힣_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
  return normalized || "untitled";
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
export function MusicProviderToolkit({
  brief,
  prompt,
  onNotice,
  onError,
}: MusicProviderToolkitProps) {
  const copyPrompt = async (providerName: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("이 브라우저에서는 클립보드 복사를 사용할 수 없습니다.");
      }
      await navigator.clipboard.writeText(prompt);
      onNotice(`${providerName}에 붙여 넣을 음악 프롬프트를 복사했습니다.`);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "음악 프롬프트를 복사하지 못했습니다.");
    }
  };

  const downloadHandoff = (providerId: MusicProviderId) => {
    try {
      const handoff = buildMusicProviderHandoff(providerId, brief, prompt);
      downloadJson(
        `ai-music-handoff-${providerId}-${safeFilename(brief.title)}.json`,
        handoff,
      );
      onNotice("외부 AI 음악 생성·권리 검수용 인계 JSON을 저장했습니다.");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "음악 인계 파일을 만들지 못했습니다.");
    }
  };
  return (
    <section
      aria-label="외부 AI 음악 툴킷"
      className="space-y-5 rounded-3xl border border-line bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-black tracking-[0.14em] text-accent">
            <PlugZap size={16} aria-hidden /> FREE MUSIC PROVIDER TOOLKIT
          </p>
          <h2 className="mt-2 text-xl font-bold">무료 크레딧·MCP·CLI로 제작 이어가기</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            현재 장면 프롬프트를 외부 서비스로 가져가거나 검수용 JSON으로 보관하세요.
            외부 결과는 자동 게시하지 않으며, 생성 당시 라이선스와 원본을 확인한 뒤 작품에 연결합니다.
          </p>
        </div>
        <span className="rounded-full border border-line px-3 py-1.5 text-xs text-fg-3">
          정보 확인 {MUSIC_PROVIDER_VERIFIED_AT}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {MUSIC_PROVIDER_CATALOG.map((provider) => (
          <div
            key={provider.id}
            className="flex min-w-0 flex-col rounded-2xl border border-line bg-canvas p-4"
            aria-label={`${provider.name} 음악 공급자`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-bold">{provider.name}</h3>
                <p className="mt-1 text-xs leading-5 text-fg-3">{provider.freeAccess}</p>
              </div>
              <span className="shrink-0 rounded-full border border-accent/30 bg-accent/5 px-2 py-1 text-[0.62rem] font-bold text-accent">
                {policyLabels[provider.publicationPolicy]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${provider.name} 연동 방식`}>
              {provider.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded-md border border-line px-2 py-1 text-[0.62rem] font-black tracking-wider text-fg-2"
                >
                  {capabilityLabels[capability]}
                </span>
              ))}
            </div>

            <p className="mt-3 text-xs leading-5 text-fg-2">{provider.recommendedFor}</p>
            <p className="mt-2 flex-1 text-[0.68rem] leading-5 text-fg-3">{provider.rightsNote}</p>

            {provider.mcp ? (
              <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-fg-2">
                <PlugZap size={13} aria-hidden /> OAuth MCP 제공
              </p>
            ) : provider.cli ? (
              <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-fg-2">
                <TerminalSquare size={13} aria-hidden /> CLI 제공
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={provider.homeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-xs font-semibold hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent"
              >
                <ExternalLink size={14} aria-hidden /> 열기
              </a>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-xs font-semibold hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => void copyPrompt(provider.name)}
              >
                <ClipboardCopy size={14} aria-hidden /> 프롬프트
              </button>
              <button
                type="button"
                className="col-span-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-accent/40 px-2 text-xs font-semibold text-accent hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => downloadHandoff(provider.id)}
              >
                <FileJson2 size={14} aria-hidden /> 검수 인계 JSON
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 rounded-2xl border border-line bg-panel/30 p-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden />
          <p className="text-xs leading-5 text-fg-2">
            <strong className="text-fg">게시 경계:</strong> 무료 크레딧이 곧 상업 이용권을 뜻하지 않습니다.
            시안 전용 공급자의 결과는 사이트 BGM으로 자동 승격하지 않습니다.
          </p>
        </div>
        <div className="flex gap-3">
          <TerminalSquare className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden />
          <p className="text-xs leading-5 text-fg-2">
            <strong className="text-fg">자동화 경계:</strong> MCP·CLI 인증은 각 공급자의 OAuth 또는
            로컬 환경에서 수행하며 브라우저 번들에 API 키를 저장하지 않습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
