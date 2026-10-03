import { ArrowUpRight, CheckCircle2, PlugZap, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  probeUserAiConnection,
  userAiProbeResultMessage,
  type UserAiConnectionProbeResult,
} from "@/shared/ai/user-ai-connection-probe";
import { useUserAi } from "@/shared/ai/user-ai-store";
import {
  userAiConnectionApiKeys,
  USER_AI_SETTINGS_HREF,
  type UserAiConnection,
} from "@/shared/ai/user-ai-types";

import { summarizeAiKeyStatus } from "./api-key-hub-model";

const CAPABILITY_LABELS: Record<string, string> = {
  text: "글·대사",
  image: "이미지",
  inference: "영상",
  "three-d": "2D↔3D",
};

/**
 * AI API 키 상태 카드 — 실제 키 값은 절대 표시하지 않고 연결 요약만 보여준다.
 * 키 편집은 `/settings/ai` 한 곳에서만 (기존 소유권 유지).
 *
 * 벤치마킹: GitHub PAT 목록(스코프·마지막 사용 표시), Cloudflare(권한 템플릿 요약).
 */
export function AiKeyStatusCard() {
  const { configuration, persisted, notice } = useUserAi();
  const summary = summarizeAiKeyStatus(configuration);
  const configured = summary.configuredConnections > 0;
  const connections = (configuration.connections ?? []).filter(
    (connection) => userAiConnectionApiKeys(connection).length > 0,
  );
  // 연결별 실검증 상태. 결과에는 키를 담지 않는다(프로브 결과 타입 자체가 그렇다).
  const [probes, setProbes] = useState<
    Readonly<Record<string, { readonly testing: boolean; readonly result: UserAiConnectionProbeResult | null }>>
  >({});

  const runProbe = async (connection: UserAiConnection): Promise<void> => {
    setProbes((current) => ({ ...current, [connection.id]: { testing: true, result: null } }));
    const result = await probeUserAiConnection(connection);
    setProbes((current) => ({ ...current, [connection.id]: { testing: false, result } }));
  };

  return (
    <article
      className="flex min-h-64 flex-col rounded-2xl border border-line bg-card p-5 shadow-sm"
      aria-labelledby="ai-key-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles size={20} aria-hidden />
          </span>
          <div>
            <h2 id="ai-key-title" className="text-lg font-bold text-fg">
              AI API 키
            </h2>
            <p className="text-xs text-fg-3">텍스트·이미지·영상 생성 연결</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            configured ? "bg-good/10 text-good" : "bg-fg-3/10 text-fg-3"
          }`}
        >
          {configured ? <CheckCircle2 size={13} aria-hidden /> : null}
          {configured
            ? `${summary.configuredConnections}개 연결됨`
            : "미설정"}
        </span>
      </div>

      {configured ? (
        <div className="mt-4 flex-1">
          <ul className="flex flex-col gap-2" aria-label="연결된 AI 제공자">
            {connections.map((connection) => {
              const probe = probes[connection.id];
              const result = probe?.result ?? null;
              return (
                <li
                  key={connection.id}
                  className="rounded-xl border border-line bg-canvas px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-fg-2">
                      {connection.label || connection.baseUrl}
                    </span>
                    <button
                      type="button"
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-raised disabled:opacity-50"
                      disabled={probe?.testing}
                      onClick={() => void runProbe(connection)}
                    >
                      <PlugZap size={12} aria-hidden />
                      {probe?.testing ? "확인 중…" : "연결 테스트"}
                    </button>
                  </div>
                  {probe?.testing ? (
                    <p className="mt-1 text-xs text-fg-3" aria-live="polite">
                      제공자에 직접 확인하고 있어요…
                    </p>
                  ) : result ? (
                    <p
                      className={`mt-1 text-xs ${
                        result.status === "ok"
                          ? "text-good"
                          : result.status === "unreachable"
                            ? "text-warn"
                            : "text-danger"
                      }`}
                      aria-live="polite"
                    >
                      {userAiProbeResultMessage(result)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {summary.coveredCapabilities.length > 0 ? (
            <p className="mt-3 text-xs leading-6 text-fg-3">
              사용 중: {summary.coveredCapabilities.map((c) => CAPABILITY_LABELS[c] ?? c).join(" · ")}
              {persisted ? " · 암호화 보관함 저장됨" : " · 메모리 전용(브라우저 종료 시 소멸)"}
            </p>
          ) : (
            <p className="mt-3 text-xs leading-6 text-fg-3">
              {persisted ? "암호화 보관함에 저장됨" : "메모리에만 보관 중"} — 기능별 사용 순서는 AI 설정에서 지정하세요.
            </p>
          )}
          <p className="sr-only">{notice}</p>
        </div>
      ) : (
        <div className="mt-4 flex-1">
          <p className="text-sm leading-6 text-fg-2">
            아직 연결된 AI 키가 없어요. 키 하나만 연결하면 글·이미지 생성 기능을 바로 쓸 수 있습니다.
            무료 제공자부터 시작할 수 있어요.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-fg-3">
            <li>키 없이도 자동 무료 AI가 먼저 동작합니다</li>
            <li>내 키는 메모리 전용 또는 암호화 보관함에만 저장됩니다</li>
          </ul>
        </div>
      )}

      <div className="mt-auto pt-4">
        <Link
          to={USER_AI_SETTINGS_HREF}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-raised"
        >
          {configured ? "AI 설정에서 관리" : "AI 키 연결하기"} <ArrowUpRight size={14} aria-hidden />
        </Link>
      </div>
    </article>
  );
}
