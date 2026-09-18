import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import {
  confirmProductionTossPayment,
  createProductionDocumensoEnvelope,
  createProductionGmailDraft,
  createProductionMailtoDraft,
  disconnectGoogleProduction,
  getGoogleProductionConnectUrl,
  getProductionCalendarEvents,
  getProductionIntegrationCapabilities,
  getProductionProjectBackup,
  getProductionProvenance,
  getProductionSigningPackage,
  productionCalendarIcsUrl,
  productionTaxInvoiceCsvUrl,
  sendProductionIntegrationNotification,
  syncProductionGoogleCalendar,
  uploadProductionGoogleDriveArtifact,
  type ProductionCalendarIntegrationEvent,
  type ProductionGoogleDriveArtifact,
  type ProductionIntegrationCapabilities,
} from "./production-api";
import {
  productionPushSupported,
  subscribeProductionPush,
  unsubscribeProductionPush,
} from "./production-push-client";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/infrastructure/api";

const FIELD_CLASS =
  "min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function Card({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h3 className="font-black text-fg">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-fg-2">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type NotificationChannel = "web-push" | "generic-webhook" | "discord" | "ntfy";

const DRIVE_ARTIFACT_LABELS: Readonly<Record<ProductionGoogleDriveArtifact, string>> = {
  "project-backup": "프로젝트 전체 백업 JSON",
  "calendar-ics": "제작 일정 ICS",
  "provenance-json": "출처 증명 JSON",
  "tax-invoice-csv": "청구 준비 CSV",
  "tax-invoice-sheet": "청구 준비 Google Sheet",
};

export function ProductionIntegrationsPanel({
  aggregate,
}: {
  readonly aggregate: ProductionProjectAggregate;
}) {
  const [capabilities, setCapabilities] = useState<ProductionIntegrationCapabilities | null>(null);
  const [events, setEvents] = useState<readonly ProductionCalendarIntegrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [messageBody, setMessageBody] = useState(`${aggregate.title} 제작 프로젝트의 최신 일정과 검토 항목을 확인해 주세요.`);
  const [notificationChannel, setNotificationChannel] = useState<NotificationChannel>("web-push");
  const [driveArtifact, setDriveArtifact] = useState<ProductionGoogleDriveArtifact>("project-backup");
  const [driveFolderId, setDriveFolderId] = useState("");
  const [driveFileLink, setDriveFileLink] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [distribute, setDistribute] = useState(false);
  const firstInvoice = aggregate.invoices[0] ?? null;
  const [invoiceId, setInvoiceId] = useState(firstInvoice?.id ?? "");
  const [paymentKey, setPaymentKey] = useState("");
  const [orderId, setOrderId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(String(firstInvoice?.amountMinor ?? ""));
  const availableNotificationChannels = useMemo(() => {
    if (!capabilities) return [] as NotificationChannel[];
    return ([
      ["web-push", capabilities.notifications.webPush],
      ["generic-webhook", capabilities.notifications.genericWebhook],
      ["discord", capabilities.notifications.discord],
      ["ntfy", capabilities.notifications.ntfy],
    ] as const)
      .filter(([, available]) => available)
      .map(([channel]) => channel);
  }, [capabilities]);

  const refresh = async () => {
    const [nextCapabilities, calendar] = await Promise.all([
      getProductionIntegrationCapabilities(aggregate.projectId),
      getProductionCalendarEvents(aggregate.projectId),
    ]);
    setCapabilities(nextCapabilities);
    setEvents(calendar.events);
    if (!availableNotificationChannels.includes(notificationChannel)) {
      const first = ([
        ["web-push", nextCapabilities.notifications.webPush],
        ["generic-webhook", nextCapabilities.notifications.genericWebhook],
        ["discord", nextCapabilities.notifications.discord],
        ["ntfy", nextCapabilities.notifications.ntfy],
      ] as const).find(([, enabled]) => enabled)?.[0];
      if (first) setNotificationChannel(first);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getProductionIntegrationCapabilities(aggregate.projectId),
      getProductionCalendarEvents(aggregate.projectId),
    ]).then(([nextCapabilities, calendar]) => {
      if (cancelled) return;
      setCapabilities(nextCapabilities);
      setEvents(calendar.events);
    }).catch(async (cause) => {
      if (!cancelled) {
        setError(await getApiErrorMessage(cause, "외부 연동 상태를 불러오지 못했습니다."));
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [aggregate.projectId]);

  const run = async (key: string, success: string, action: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    setError(null);
    try {
      await action();
      setNotice(success);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "외부 연동 작업을 완료하지 못했습니다."));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-line bg-card p-5 text-sm text-fg-2">무료 외부 연동 상태를 확인하는 중…</div>;
  }

  const projectPath = `/production/projects/${encodeURIComponent(aggregate.projectId)}/settings`;
  const emailInput = {
    to: [email.trim()],
    subject: `[${aggregate.title}] 제작 프로젝트 확인 요청`,
    body: messageBody,
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/25 bg-accent-soft/10 p-4">
        <p className="text-sm font-black text-fg">비용 없는 경로를 기본값으로 사용합니다.</p>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          ICS·mailto·Web Push·직접 웹훅·해시 증명은 별도 사용료가 없습니다. 전자서명은 자체 호스팅을 우선하고, 결제는 테스트 키만 기본 허용합니다.
        </p>
        {capabilities ? (
          <p className="mt-2 text-[0.6875rem] leading-5 text-fg-3">
            정책 {capabilities.costPolicy} · 오늘 남은 횟수: Calendar {capabilities.budget.remaining.googleCalendarSyncs ?? 0}, Gmail {capabilities.budget.remaining.gmailDrafts ?? 0}, Drive {capabilities.budget.remaining.googleDriveUploads ?? 0}, 알림 {capabilities.budget.remaining.notifications ?? 0}
          </p>
        ) : null}
      </div>
      {notice ? <p role="status" className="rounded-xl border border-good/30 bg-good/10 px-3 py-2 text-xs text-fg">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-fg">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="일정 · Google Calendar" description="모든 마감은 ICS로 즉시 내보내고, 선택적으로 사용자의 Google Calendar에 동기화합니다.">
          <div className="flex flex-wrap gap-2">
            <a href={productionCalendarIcsUrl(aggregate.projectId)} className={buttonClass({ variant: "outline", size: "sm" })}>
              ICS 내려받기
            </a>
            {capabilities?.calendar.googleConnected ? (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("calendar-sync", "Google Calendar에 일정을 동기화했습니다.", async () => {
                    const result = await syncProductionGoogleCalendar(aggregate.projectId);
                    setNotice(`${result.synced}개 일정을 Google Calendar에 동기화했습니다.`);
                  })}
                  className={buttonClass({ size: "sm" })}
                >
                  {busy === "calendar-sync" ? "동기화 중…" : "Google 일정 동기화"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("google-disconnect", "Google 연결을 해제했습니다.", async () => {
                    await disconnectGoogleProduction(aggregate.projectId);
                    await refresh();
                  })}
                  className={buttonClass({ variant: "quiet", size: "sm" })}
                >
                  연결 해제
                </button>
              </>
            ) : capabilities?.calendar.googleApiConfigured ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("google-connect", "Google 승인 화면으로 이동합니다.", async () => {
                  const result = await getGoogleProductionConnectUrl(aggregate.projectId, projectPath);
                  globalThis.location.assign(result.authorizationUrl);
                })}
                className={buttonClass({ size: "sm" })}
              >
                Google 연결
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {events.slice(0, 5).map((event) => (
              <div key={event.key} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{event.title}</p>
                  <p className="mt-1 text-xs text-fg-3">{new Date(event.startsAt).toLocaleString("ko-KR")}</p>
                </div>
                <a href={event.googleCalendarUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "quiet", size: "sm" })}>추가</a>
              </div>
            ))}
            {events.length === 0 ? <p className="text-xs text-fg-3">등록할 마감 일정이 없습니다.</p> : null}
          </div>
        </Card>
        <Card title="이메일 초안" description="메일을 자동 발송하지 않고, mailto 또는 사용자가 연결한 Gmail의 초안으로만 만듭니다.">
          <label className="text-xs font-bold text-fg-2">
            받는 사람
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="collaborator@example.com"
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>
          <label className="mt-3 block text-xs font-bold text-fg-2">
            메시지
            <textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              rows={5}
              className={`${FIELD_CLASS} mt-1 py-2`}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!email.trim() || busy !== null}
              onClick={() => run("mailto", "로컬 메일 앱에서 초안을 열었습니다.", async () => {
                const result = await createProductionMailtoDraft(aggregate.projectId, emailInput);
                globalThis.location.href = result.url;
              })}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              mailto 초안
            </button>
            <button
              type="button"
              disabled={!email.trim() || !capabilities?.email.googleConnected || busy !== null}
              onClick={() => run("gmail", "Gmail 초안을 만들었습니다.", async () => {
                await createProductionGmailDraft(aggregate.projectId, emailInput);
              })}
              className={buttonClass({ size: "sm" })}
            >
              {busy === "gmail" ? "초안 생성 중…" : "Gmail 초안 만들기"}
            </button>
          </div>
        </Card>

        <Card title="Google Drive 백업" description="앱이 만든 파일만 볼 수 있는 drive.file 최소 권한으로 프로젝트 자료를 보관합니다.">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <label className="text-xs font-bold text-fg-2">
              백업 종류
              <select
                value={driveArtifact}
                onChange={(event) => setDriveArtifact(event.target.value as ProductionGoogleDriveArtifact)}
                className={`${FIELD_CLASS} mt-1`}
                aria-label="Google Drive 백업 종류"
              >
                {Object.entries(DRIVE_ARTIFACT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg-2">
              선택 폴더 ID · 선택 사항
              <input
                value={driveFolderId}
                onChange={(event) => setDriveFolderId(event.target.value)}
                placeholder="비우면 내 드라이브 최상위"
                className={`${FIELD_CLASS} mt-1`}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!capabilities?.drive.googleConnected || busy !== null}
              onClick={() => run("drive-upload", "Google Drive에 제작 자료를 보관했습니다.", async () => {
                const result = await uploadProductionGoogleDriveArtifact(aggregate.projectId, {
                  artifact: driveArtifact,
                  ...(driveFolderId.trim() ? { folderId: driveFolderId.trim() } : {}),
                });
                setDriveFileLink(result.webViewLink);
                setNotice(`${result.name} 파일을 ${result.created ? "생성" : "갱신"}했습니다.`);
              })}
              className={buttonClass({ size: "sm" })}
            >
              {busy === "drive-upload" ? "Drive에 저장 중…" : "Google Drive에 저장"}
            </button>
            {!capabilities?.drive.googleConnected && capabilities?.drive.googleApiConfigured ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("google-connect-drive", "Google 승인 화면으로 이동합니다.", async () => {
                  const result = await getGoogleProductionConnectUrl(aggregate.projectId, projectPath);
                  globalThis.location.assign(result.authorizationUrl);
                })}
                className={buttonClass({ variant: "outline", size: "sm" })}
              >
                Google 연결
              </button>
            ) : null}
            {driveFileLink ? (
              <a
                href={driveFileLink}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ variant: "quiet", size: "sm" })}
              >
                저장된 파일 열기
              </a>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-fg-3">
            일반 JSON·ICS·CSV는 같은 앱 생성 파일을 갱신합니다. Google Sheet 변환은 원본 보존을 위해 새 문서로 만듭니다.
          </p>
        </Card>

        <Card title="알림" description="브라우저 Web Push는 별도 메시징 사업자 없이 VAPID로 동작하며, Discord·ntfy·HMAC 웹훅도 선택할 수 있습니다.">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!capabilities?.notifications.webPush || !productionPushSupported() || busy !== null}
              onClick={() => run("push-subscribe", "이 브라우저의 제작 알림을 켰습니다.", async () => {
                const publicKey = capabilities?.notifications.vapidPublicKey;
                if (!publicKey) throw new Error("Web Push 공개 키가 없습니다.");
                await subscribeProductionPush(aggregate.projectId, publicKey);
              })}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              이 브라우저 알림 켜기
            </button>
            <button
              type="button"
              disabled={!productionPushSupported() || busy !== null}
              onClick={() => run("push-unsubscribe", "이 브라우저의 제작 알림을 껐습니다.", async () => {
                await unsubscribeProductionPush(aggregate.projectId);
              })}
              className={buttonClass({ variant: "quiet", size: "sm" })}
            >
              이 프로젝트 알림 끄기
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[12rem_1fr]">
            <select
              value={notificationChannel}
              onChange={(event) => setNotificationChannel(event.target.value as NotificationChannel)}
              className={FIELD_CLASS}
              aria-label="알림 채널"
            >
              {availableNotificationChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
            </select>
            <button
              type="button"
              disabled={availableNotificationChannels.length === 0 || busy !== null}
              onClick={() => run("notification", "테스트 알림을 보냈습니다.", async () => {
                await sendProductionIntegrationNotification(aggregate.projectId, {
                  channel: notificationChannel,
                  title: `${aggregate.title} 제작 알림`,
                  body: "외부 연동 테스트 알림입니다.",
                  url: projectPath,
                });
              })}
              className={buttonClass({ size: "sm" })}
            >
              {busy === "notification" ? "전송 중…" : "테스트 알림 보내기"}
            </button>
          </div>
        </Card>
        <Card title="전자서명 · Documenso" description="오픈소스 Documenso 인스턴스 또는 API를 사용합니다. 연결되지 않은 경우 PDF를 내려받아 수동 서명하는 흐름을 유지합니다.">
          <label className="block text-xs font-bold text-fg-2">
            계약 PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
              className={`${FIELD_CLASS} mt-1 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-fg`}
            />
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold text-fg-2">
              서명자 이름
              <input value={signerName} onChange={(event) => setSignerName(event.target.value)} className={`${FIELD_CLASS} mt-1`} />
            </label>
            <label className="text-xs font-bold text-fg-2">
              서명자 이메일
              <input type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} className={`${FIELD_CLASS} mt-1`} />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-fg-2">
            <input type="checkbox" checked={distribute} onChange={(event) => setDistribute(event.target.checked)} />
            생성 직후 서명 요청 배포
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!capabilities?.signatures.documensoConfigured || !pdfFile || !signerName.trim() || !signerEmail.trim() || busy !== null}
              onClick={() => run("documenso", distribute ? "서명 요청을 만들고 배포했습니다." : "서명 문서 초안을 만들었습니다.", async () => {
                if (!pdfFile) return;
                await createProductionDocumensoEnvelope(aggregate.projectId, {
                  file: pdfFile,
                  title: `${aggregate.title} 제작 계약`,
                  distribute,
                  recipients: [{ email: signerEmail.trim(), name: signerName.trim(), role: "SIGNER" }],
                });
              })}
              className={buttonClass({ size: "sm" })}
            >
              {busy === "documenso" ? "서명 문서 생성 중…" : distribute ? "생성 후 배포" : "서명 초안 만들기"}
            </button>
            <button
              type="button"
              disabled={!capabilities?.signatures.manualSigningPackage || busy !== null}
              onClick={() => run("signing-package", "수동 서명 패키지를 내려받았습니다.", async () => {
                const signingPackage = await getProductionSigningPackage(aggregate.projectId);
                downloadJson(`production-${aggregate.projectId}-signing-package.json`, signingPackage);
              })}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              수동 서명 패키지
            </button>
            <span className="text-xs text-fg-3">
              {capabilities?.signatures.documensoConfigured
                ? capabilities.signatures.selfHosted ? "자체 호스팅 연결됨" : "Documenso API 연결됨"
                : "미연결 · 수동 서명 사용"}
            </span>
          </div>
        </Card>

        <Card title="출처 증명 · 세금계산서 준비" description="프로젝트 정본·기여·권리 정보를 SHA-256 manifest로 내보냅니다. 세금계산서 CSV는 발행 완료가 아니라 수동 신고·연동 준비 자료입니다.">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("project-backup", "프로젝트 전체 백업을 내려받았습니다.", async () => {
                const backup = await getProductionProjectBackup(aggregate.projectId);
                downloadJson(`production-${aggregate.projectId}-backup.json`, backup);
              })}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              프로젝트 전체 백업
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("provenance", "출처 증명 manifest를 내려받았습니다.", async () => {
                const manifest = await getProductionProvenance(aggregate.projectId);
                downloadJson(`production-${aggregate.projectId}-provenance.json`, manifest);
              })}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              해시·C2PA 초안 내려받기
            </button>
            <a href={productionTaxInvoiceCsvUrl(aggregate.projectId)} className={buttonClass({ variant: "outline", size: "sm" })}>
              청구 CSV 내려받기
            </a>
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-fg-2">
            <li className="rounded-xl border border-line bg-panel px-3 py-2">• 현재 manifest는 위변조 확인용 해시 증명입니다. 신뢰 인증서가 붙은 공개 C2PA 서명은 아닙니다.</li>
            <li className="rounded-xl border border-line bg-panel px-3 py-2">• CSV 생성만으로 국세청 전자세금계산서가 발행되거나 전송되지 않습니다.</li>
          </ul>
        </Card>

        <Card title="결제 검증 · Toss Payments" description="기본은 테스트 키만 허용합니다. 운영 실결제는 서버에서 별도 명시 승인한 경우에만 열립니다.">
          {aggregate.invoices.length > 0 ? (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-fg-2">
                청구서
                <select
                  value={invoiceId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setInvoiceId(nextId);
                    const invoice = aggregate.invoices.find((entry) => entry.id === nextId);
                    if (invoice) setPaymentAmount(String(invoice.amountMinor));
                  }}
                  className={`${FIELD_CLASS} mt-1`}
                >
                  {aggregate.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.id} · {invoice.amountMinor.toLocaleString("ko-KR")} {invoice.currency}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={paymentKey} onChange={(event) => setPaymentKey(event.target.value)} placeholder="paymentKey" className={FIELD_CLASS} aria-label="Toss paymentKey" />
                <input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="orderId" className={FIELD_CLASS} aria-label="Toss orderId" />
                <input type="number" min={1} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="amount" className={FIELD_CLASS} aria-label="Toss amount" />
              </div>
              <button
                type="button"
                disabled={!paymentKey.trim() || !orderId.trim() || Number(paymentAmount) <= 0 || !["test", "live-explicitly-enabled"].includes(capabilities?.payments.mode ?? "disabled") || busy !== null}
                onClick={() => run("toss", capabilities?.payments.mode === "test" ? "테스트 결제를 검증하고 지급 기록에 반영했습니다." : "결제를 검증하고 지급 기록에 반영했습니다.", async () => {
                  await confirmProductionTossPayment(aggregate.projectId, {
                    paymentKey: paymentKey.trim(),
                    orderId: orderId.trim(),
                    amount: Number(paymentAmount),
                    invoiceId,
                  });
                })}
                className={buttonClass({ size: "sm" })}
              >
                {busy === "toss" ? "결제 검증 중…" : capabilities?.payments.mode === "test" ? "테스트 결제 검증" : "결제 검증"}
              </button>
              <p className="text-xs text-fg-3">현재 모드: {capabilities?.payments.mode ?? "disabled"}</p>
            </div>
          ) : <p className="text-xs text-fg-3">검증할 청구서가 없습니다.</p>}
        </Card>
      </div>
    </div>
  );
}
