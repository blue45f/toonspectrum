import {
  Activity,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  DatabaseZap,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getApiErrorMessage } from "@/infrastructure/api";
import { useI18n } from "@/shared/lib/i18n";

import { integrationPlatformClient } from "./integration-platform-client";
import type {
  IntegrationRuntimeConnectorStatus,
  IntegrationRuntimeExecutionResponse,
  IntegrationRuntimeReceipt,
} from "./integration-platform-types";
import {
  buildRuntimeExecutionRequest,
  executionResultLabel,
  newIntegrationMutationId,
  runtimeExampleJson,
} from "./integration-runtime-workbench-model";

const FIELD = "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45";

const RECEIPT_LABELS: Readonly<Record<IntegrationRuntimeReceipt["state"], string>> = {
  pending: "처리 중",
  succeeded: "성공",
  failed: "실패",
  uncertain: "결과 불확실",
};

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function receiptTone(state: IntegrationRuntimeReceipt["state"]): string {
  if (state === "succeeded") return "border-good/30 bg-good/5 text-good";
  if (state === "failed") return "border-danger/30 bg-danger/5 text-danger";
  if (state === "uncertain") return "border-warn/40 bg-warn/10 text-warn";
  return "border-line bg-panel text-fg-2";
}

export function IntegrationRuntimeWorkbench() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const [connectors, setConnectors] = useState<readonly IntegrationRuntimeConnectorStatus[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [inputJson, setInputJson] = useState("{}");
  const [mutationId, setMutationId] = useState(() => newIntegrationMutationId());
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<IntegrationRuntimeExecutionResponse | null>(null);
  const [receipts, setReceipts] = useState<readonly IntegrationRuntimeReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"plan" | "execute" | "receipts" | null>(null);
  const [error, setError] = useState("");
  const [receiptError, setReceiptError] = useState("");

  const connector = useMemo(
    () => connectors.find((candidate) => candidate.providerId === selectedProviderId) ?? null,
    [connectors, selectedProviderId],
  );

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await integrationPlatformClient.runtimeConnectors();
      setConnectors(response.connectors);
      setSelectedProviderId((current) => {
        if (response.connectors.some((candidate) => candidate.providerId === current)) {
          return current;
        }
        return (
          response.connectors.find((candidate) => candidate.configured)?.providerId
          ?? response.connectors[0]?.providerId
          ?? ""
        );
      });
    } catch (cause) {
      setError(await getApiErrorMessage(
        cause,
        ko ? "실행 가능한 연동을 불러오지 못했습니다." : "Could not load executable integrations.",
      ));
    } finally {
      setLoading(false);
    }
  }, [ko]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  useEffect(() => {
    if (!connector) return;
    setInputJson(runtimeExampleJson(connector));
    setMutationId(newIntegrationMutationId());
    setConfirmed(false);
    setResult(null);
    setError("");
  }, [connector]);

  const loadReceipts = useCallback(async (targetProjectId = projectId.trim()) => {
    if (!targetProjectId) {
      setReceiptError(ko ? "영수증을 확인할 프로젝트 ID를 입력해 주세요." : "Enter a project ID to load receipts.");
      return;
    }
    setBusy("receipts");
    setReceiptError("");
    try {
      const response = await integrationPlatformClient.runtimeReceipts(targetProjectId, 30);
      setReceipts(response.receipts);
    } catch (cause) {
      setReceiptError(await getApiErrorMessage(
        cause,
        ko ? "실행 영수증을 불러오지 못했습니다." : "Could not load execution receipts.",
      ));
    } finally {
      setBusy(null);
    }
  }, [ko, projectId]);

  async function run(dryRun: boolean) {
    if (!connector) return;
    setBusy(dryRun ? "plan" : "execute");
    setError("");
    try {
      const request = buildRuntimeExecutionRequest({
        connector,
        projectId,
        mutationId,
        inputJson,
        dryRun,
        confirm: confirmed,
      });
      const response = await integrationPlatformClient.executeRuntime(request);
      setResult(response);
      if (!dryRun) {
        setConfirmed(false);
        setMutationId(newIntegrationMutationId());
        await loadReceipts(request.projectId);
      }
    } catch (cause) {
      setError(await getApiErrorMessage(
        cause,
        dryRun
          ? (ko ? "실행 계획을 확인하지 못했습니다." : "Could not validate the execution plan.")
          : (ko ? "외부 실행을 완료하지 못했습니다." : "Could not complete the external execution."),
      ));
    } finally {
      setBusy(null);
    }
  }

  function resetDraft() {
    if (!connector) return;
    setInputJson(runtimeExampleJson(connector));
    setMutationId(newIntegrationMutationId());
    setConfirmed(false);
    setResult(null);
    setError("");
  }

  function changeProject(value: string) {
    setProjectId(value);
    setReceipts([]);
    setReceiptError("");
    setResult(null);
    setConfirmed(false);
    setMutationId(newIntegrationMutationId());
  }

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-line bg-card shadow-sm" aria-labelledby="integration-runtime-title">
      <header className="border-b border-line bg-panel/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <DatabaseZap size={20} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                {ko ? "실제 공급자 실행" : "Live provider execution"}
              </p>
              <h2 id="integration-runtime-title" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
                {ko ? "연동 실행 워크벤치" : "Integration runtime workbench"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
                {ko
                  ? "프로젝트 권한을 다시 확인하고, 계획 확인 후에만 외부 시스템을 호출합니다. 성공·실패·결과 불확실 상태는 데이터베이스 영수증으로 남습니다."
                  : "Project access is rechecked before every request. External calls require a reviewed plan, and durable receipts distinguish success, failure and uncertain outcomes."}
              </p>
            </div>
          </div>
          <button type="button" className={BUTTON} onClick={() => void loadConnectors()} disabled={loading || busy !== null}>
            <RefreshCw size={16} aria-hidden />
            {ko ? "상태 새로고침" : "Refresh status"}
          </button>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {loading ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-fg-2" aria-busy="true">
            {ko ? "실행 공급자 상태를 확인하고 있습니다." : "Checking connector readiness."}
          </p>
        ) : null}

        {!loading && connectors.length === 0 ? (
          <p className="rounded-2xl border border-warn/40 bg-warn/10 p-5 text-sm text-warn">
            {error || (ko ? "사용 가능한 실행 공급자가 없습니다." : "No runtime connectors are available.")}
          </p>
        ) : null}

        {connectors.length > 0 ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
              <label className="block text-sm font-semibold text-fg">
                {ko ? "제작 프로젝트 ID" : "Production project ID"}
                <input
                  value={projectId}
                  onChange={(event) => changeProject(event.currentTarget.value)}
                  placeholder="production-project-id"
                  className={`${FIELD} mt-2`}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="block text-sm font-semibold text-fg">
                {ko ? "실행 공급자" : "Runtime connector"}
                <select
                  value={selectedProviderId}
                  onChange={(event) => setSelectedProviderId(event.currentTarget.value)}
                  className={`${FIELD} mt-2`}
                >
                  {connectors.map((item) => (
                    <option key={item.providerId} value={item.providerId}>
                      {item.name} · {item.action}{item.configured ? "" : ` · ${ko ? "설정 필요" : "configuration required"}`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="self-end">
                <span className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${connector?.configured ? "border-good/30 bg-good/10 text-good" : "border-warn/40 bg-warn/10 text-warn"}`}>
                  {connector?.configured ? <CheckCircle2 size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
                  {connector?.configured
                    ? (ko ? "실행 설정 완료" : "Configured")
                    : (ko ? "운영 설정 필요" : "Configuration required")}
                </span>
              </div>
            </div>

            {connector ? (
              <div className="mt-4 rounded-2xl border border-line bg-panel/50 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-3">
                  <span className="rounded-full border border-line px-2.5 py-1">{connector.category}</span>
                  <span className="rounded-full border border-line px-2.5 py-1">{connector.executionMode}</span>
                  <span className="rounded-full border border-line px-2.5 py-1">
                    {connector.writesExternalState ? (ko ? "외부 상태 변경" : "Writes external state") : (ko ? "읽기 전용" : "Read only")}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-fg-2">{connector.summary}</p>
              </div>
            ) : null}

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
              <label className="block text-sm font-semibold text-fg">
                {ko ? "공급자 입력 JSON" : "Provider input JSON"}
                <textarea
                  value={inputJson}
                  onChange={(event) => {
                    setInputJson(event.currentTarget.value);
                    setResult(null);
                    setConfirmed(false);
                    setMutationId(newIntegrationMutationId());
                  }}
                  rows={17}
                  spellCheck={false}
                  className="mt-2 w-full resize-y rounded-2xl border border-line bg-canvas p-4 font-mono text-xs leading-6 text-fg outline-none focus:border-accent"
                />
              </label>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
                    <ShieldCheck size={17} className="text-accent" aria-hidden />
                    {ko ? "실행 안전 경계" : "Execution safety"}
                  </h3>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-fg-2">
                    <li>{ko ? "API 키와 Webhook 주소는 서버 Secret에서만 읽습니다." : "Keys and webhook URLs are read only from server secrets."}</li>
                    <li>{ko ? "계획 확인은 외부 요청과 영수증 쓰기를 수행하지 않습니다." : "Plan review sends no external request and writes no receipt."}</li>
                    <li>{ko ? "실제 실행은 프로젝트 편집 권한과 명시적 확인이 필요합니다." : "Live execution requires project edit access and explicit confirmation."}</li>
                    <li>{ko ? "결과 불확실 요청은 자동 재시도하지 않습니다." : "Uncertain outcomes are never retried automatically."}</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-line bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">
                    {ko ? "요청 식별자" : "Mutation ID"}
                  </p>
                  <code className="mt-2 block break-all text-xs text-fg-2">{mutationId}</code>
                  <button type="button" onClick={resetDraft} className={`${BUTTON} mt-4 w-full`} disabled={busy !== null}>
                    <RotateCcw size={15} aria-hidden /> {ko ? "예시와 요청 ID 초기화" : "Reset example and ID"}
                  </button>
                </div>

                <div className="flex min-h-12 items-start gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-fg">
                  <input
                    id="integration-runtime-confirm"
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.currentTarget.checked)}
                    aria-label={ko ? "실제 외부 실행 확인" : "Confirm live execution"}
                    aria-describedby="integration-runtime-confirm-description"
                    className="mt-0.5 size-4 accent-current"
                  />
                  <div>
                    <p className="font-bold">{ko ? "실제 외부 실행 확인" : "Confirm live execution"}</p>
                    <p id="integration-runtime-confirm-description" className="mt-1 text-xs leading-5 text-fg-2">
                      {ko ? "현재 JSON이 선택한 외부 시스템을 변경하거나 메시지를 전송할 수 있음을 확인했습니다." : "I understand that this JSON can modify the selected external system or send a message."}
                    </p>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => void run(true)} disabled={!connector || busy !== null} className={BUTTON}>
                <ClipboardCheck size={16} aria-hidden />
                {busy === "plan" ? (ko ? "계획 확인 중…" : "Checking plan…") : (ko ? "계획 확인" : "Review plan")}
              </button>
              <button
                type="button"
                onClick={() => void run(false)}
                disabled={!connector?.configured || !confirmed || busy !== null}
                className={`${BUTTON} border-accent bg-accent text-on-accent hover:bg-accent/90`}
              >
                <Play size={16} aria-hidden />
                {busy === "execute" ? (ko ? "외부 실행 중…" : "Executing…") : (ko ? "외부 시스템 실행" : "Execute external action")}
              </button>
              <button type="button" onClick={() => void loadReceipts()} disabled={!projectId.trim() || busy !== null} className={BUTTON}>
                <Activity size={16} aria-hidden />
                {busy === "receipts" ? (ko ? "영수증 조회 중…" : "Loading receipts…") : (ko ? "영수증 조회" : "Load receipts")}
              </button>
            </div>

            {error ? (
              <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
                {error}
              </p>
            ) : null}

            {result ? (
              <section className="mt-5 rounded-2xl border border-line bg-canvas p-4" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-fg">
                    {executionResultLabel(result.state, result.replayed)}
                  </h3>
                  <span className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-3">
                    {result.providerId} · {result.action}
                  </span>
                </div>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-panel p-4 text-xs leading-6 text-fg-2">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </section>
            ) : null}

            <section className="mt-7 border-t border-line pt-6" aria-labelledby="integration-receipts-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="integration-receipts-title" className="text-lg font-bold text-fg">
                    {ko ? "최근 실행 영수증" : "Recent execution receipts"}
                  </h3>
                  <p className="mt-1 text-xs text-fg-3">
                    {ko ? "현재 사용자와 프로젝트에 속한 실행만 표시합니다." : "Only executions owned by the current actor and project are shown."}
                  </p>
                </div>
                <span className="text-xs font-semibold text-fg-3">{receipts.length}/30</span>
              </div>
              {receiptError ? <p role="alert" className="mt-3 text-sm text-danger">{receiptError}</p> : null}
              {receipts.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-sm text-fg-3">
                  {ko ? "프로젝트 ID를 입력하고 영수증을 조회하거나 실제 실행을 완료하면 기록이 나타납니다." : "Enter a project ID and load receipts, or complete a live execution."}
                </p>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {receipts.map((receipt) => (
                    <article key={`${receipt.projectId}:${receipt.mutationId}`} className="rounded-2xl border border-line bg-panel/50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-fg">{receipt.provider}</p>
                          <p className="mt-1 text-xs text-fg-3">{receipt.operation}</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${receiptTone(receipt.state)}`}>
                          {RECEIPT_LABELS[receipt.state]}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs text-fg-2 sm:grid-cols-2">
                        <div><dt className="text-fg-3">{ko ? "갱신" : "Updated"}</dt><dd className="mt-0.5">{dateLabel(receipt.updatedAt)}</dd></div>
                        <div><dt className="text-fg-3">{ko ? "외부 ID" : "External ID"}</dt><dd className="mt-0.5 break-all">{receipt.externalId ?? "—"}</dd></div>
                      </dl>
                      {receipt.errorCode ? <p className="mt-3 break-all rounded-lg bg-canvas p-2 font-mono text-xs text-danger">{receipt.errorCode}</p> : null}
                      <code className="mt-3 block break-all text-[0.68rem] text-fg-3">{receipt.mutationId}</code>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
