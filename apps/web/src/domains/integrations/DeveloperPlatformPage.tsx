import { Braces, Download, KeyRound, Webhook } from "lucide-react";
import { useEffect, useState } from "react";

import { getApiErrorMessage } from "@/infrastructure/api";
import { useI18n } from "@/shared/lib/i18n";

import { IntegrationLoading, IntegrationPage } from "./IntegrationUi";
import { integrationPlatformClient } from "./integration-platform-client";
import { downloadIntegrationJson } from "./integration-platform-storage";
import type { DeveloperManifestResponse } from "./integration-platform-types";

function TokenList({ values }: { values: readonly string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.map((value) => (
        <code key={value} className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg-2">{value}</code>
      ))}
    </div>
  );
}

export function DeveloperPlatformPage() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const [manifest, setManifest] = useState<DeveloperManifestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void integrationPlatformClient.developerManifest()
      .then((response) => { if (!cancelled) setManifest(response); })
      .catch(async (reason: unknown) => {
        if (!cancelled) setError(await getApiErrorMessage(reason, "개발자 계약을 불러오지 못했습니다."));
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <IntegrationPage
      eyebrow={ko ? "API · Webhook · MCP" : "API · Webhook · MCP"}
      title={ko ? "개발자 플랫폼" : "Developer platform"}
      description={ko
        ? "공개 카탈로그와 사용자 승인 프로젝트 기능을 REST API·서명 Webhook·MCP 도구로 확장하기 위한 권한 계약입니다. 원본 파일 접근은 별도 강한 권한으로 분리됩니다."
        : "A scoped contract for public catalog, user-authorized project APIs, signed webhooks and MCP tools. Raw project files require a separate strong grant."}
    >
      {!manifest && !error ? <IntegrationLoading message={ko ? "개발자 계약을 불러오고 있습니다." : "Loading developer contract."} /> : null}
      {error ? <p className="rounded-2xl border border-danger/40 bg-danger/5 p-5 text-sm text-danger">{error}</p> : null}
      {manifest ? (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">{manifest.schema}</p>
              <p className="mt-1 text-sm text-fg-2">{ko ? `${manifest.providers}개 공급자 계약이 동일한 안전 경계를 사용합니다.` : `${manifest.providers} providers share the same safety boundary.`}</p>
            </div>
            <button type="button" onClick={() => downloadIntegrationJson("toonspectrum-developer-manifest.json", manifest)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg">
              <Download size={15} aria-hidden /> {ko ? "Manifest 다운로드" : "Download manifest"}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><KeyRound size={18} aria-hidden /> OAuth scopes</h2>
              <TokenList values={manifest.scopes} />
            </section>
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><Webhook size={18} aria-hidden /> Webhook contract</h2>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-canvas p-4 text-xs leading-6 text-fg-2">{JSON.stringify(manifest.webhook, null, 2)}</pre>
            </section>
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><Braces size={18} aria-hidden /> {ko ? "이벤트" : "Events"}</h2>
              <TokenList values={manifest.events} />
            </section>
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><Braces size={18} aria-hidden /> {ko ? "액션" : "Actions"}</h2>
              <TokenList values={manifest.actions} />
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-line bg-panel/50 p-5">
            <h2 className="font-bold text-fg">{ko ? "기본 안전 규칙" : "Default safety rules"}</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(manifest.safety).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-line bg-card p-3">
                  <dt className="break-all text-xs text-fg-3">{key}</dt>
                  <dd className={`mt-1 font-bold ${value ? "text-good" : "text-fg"}`}>{String(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm leading-6 text-fg-2">
              {ko
                ? "API 키 발급·OAuth 앱 심사·MCP 외부 공개는 운영자 활성화가 필요한 별도 단계입니다. 이 화면은 현재 구현된 범위와 권한 계약을 숨기지 않고 공개합니다."
                : "API key issuance, OAuth app review and public MCP exposure remain explicit operator activation steps. This surface exposes the implemented contract without implying activation."}
            </p>
          </section>
        </>
      ) : null}
    </IntegrationPage>
  );
}
