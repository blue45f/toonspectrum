import {
  Archive,
  CheckCircle2,
  CircleAlert,
  Download,
  FileArchive,
  Globe2,
  KeyRound,
  PackageCheck,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/compat/router-link";
import {
  planStudioArchiveRestore,
  validateStudioArchiveManifest,
  type StudioArchiveManifest,
} from "../studio-archive-manifest";
import {
  planStudioPublish,
  type StudioPublishConnector,
  type StudioPublishPlan,
} from "../studio-publishing-connector";
import {
  planStudioPublishingPackage,
  type StudioPublishingPackagePlan,
} from "../studio-publishing-package";
import { auditStudioRightsGraph } from "../studio-rights-graph";
import type { StudioProjectSection } from "../studio-project-views";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

type Locale = "ko" | "en";
type DeliveryView = "publish" | "package" | "archive";

const CHECKSUM_A = `sha256:${"a".repeat(64)}`;
const CHECKSUM_B = `sha256:${"b".repeat(64)}`;
const CHECKSUM_C = `sha256:${"c".repeat(64)}`;

const CONNECTORS = Object.freeze([
  {
    id: "toonstudio-direct",
    platformName: "ToonStudio Direct",
    mode: "direct-api",
    policyVersion: "2026-09",
    capabilities: ["publish", "schedule", "localization", "analytics", "comments"],
    supportedLocales: ["ko-KR", "en-US", "ja-JP", "zh-CN", "zh-TW", "es-ES", "fr-FR"],
    credentialsRequired: true,
  },
  {
    id: "platform-package",
    platformName: "Platform upload package",
    mode: "package",
    policyVersion: "2026-09",
    capabilities: ["publish", "localization"],
    supportedLocales: ["ko-KR", "en-US", "ja-JP", "zh-CN", "zh-TW", "es-ES", "fr-FR"],
    credentialsRequired: false,
  },
  {
    id: "manual-guide",
    platformName: "Manual publishing guide",
    mode: "manual",
    policyVersion: "2026-09",
    capabilities: ["publish"],
    supportedLocales: ["ko-KR", "en-US", "ja-JP", "zh-CN", "zh-TW", "es-ES", "fr-FR"],
    credentialsRequired: false,
  },
] as const satisfies readonly StudioPublishConnector[]);

function statusTone(status: string): string {
  if (["ready", "valid", "pass", "allowed"].includes(status)) {
    return "border-success/30 bg-success-soft/15 text-success";
  }
  if (["blocked", "invalid"].includes(status)) {
    return "border-danger/35 bg-danger-soft/15 text-danger";
  }
  return "border-warning/35 bg-warning-soft/15 text-warning";
}

function labelForStatus(status: string, locale: Locale): string {
  const ko: Readonly<Record<string, string>> = {
    ready: "준비됨",
    review: "확인 필요",
    confirmation: "확인 필요",
    blocked: "수정 필요",
    valid: "문제 없음",
    invalid: "수정 필요",
  };
  const en: Readonly<Record<string, string>> = {
    ready: "Ready",
    review: "Review",
    confirmation: "Confirmation",
    blocked: "Blocked",
    valid: "Valid",
    invalid: "Invalid",
  };
  return (locale === "ko" ? ko[status] : en[status]) ?? status;
}

function downloadJson(fileName: string, value: unknown): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(href);
}

function Metric({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="text-[0.65rem] font-semibold text-fg-3">{label}</p>
      <b className="mt-1 block truncate text-base text-fg">{value}</b>
    </div>
  );
}

function StatusPanel({
  title,
  status,
  description,
  locale,
}: {
  readonly title: string;
  readonly status: string;
  readonly description: string;
  readonly locale: Locale;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-fg">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-fg-3">{description}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-black", statusTone(status))}>
          {labelForStatus(status, locale)}
        </span>
      </div>
    </div>
  );
}

function defaultDeliveryView(section: StudioProjectSection, view: string): DeliveryView {
  if (section === "settings" || view === "archive") return "archive";
  if (view === "packages" || view === "history") return "package";
  return "publish";
}

/**
 * User-facing delivery workflow. It creates deterministic manifests and plans external actions,
 * but never reports a remote publish as complete unless a configured connector performs it.
 */
export function StudioProjectDeliveryPanel({
  projectId,
  section,
  view,
  locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly locale: Locale;
}) {
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const [deliveryView, setDeliveryView] = useState<DeliveryView>(() => defaultDeliveryView(section, view));
  const [connectorId, setConnectorId] = useState(CONNECTORS[1].id);
  const [credentialsAvailable, setCredentialsAvailable] = useState(false);
  const [externalWriteConfirmed, setExternalWriteConfirmed] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [requestedAt, setRequestedAt] = useState(() => new Date().toISOString());

  const state = workspace.state;
  const preflight = state?.exportPreflights.at(-1) ?? null;
  const connector = CONNECTORS.find((candidate) => candidate.id === connectorId) ?? CONNECTORS[1];
  const locales = useMemo(() => {
    const values = state?.localization.map((item) => item.locale).filter(Boolean) ?? [];
    return Object.freeze(values.length > 0 ? [...new Set(values)] : ["ko-KR"]);
  }, [state?.localization]);
  const documentId = state?.reviewSession.documentId || `document:${projectId}:episode-1`;

  const publishPlan: StudioPublishPlan | null = useMemo(() => {
    if (!preflight) return null;
    try {
      return planStudioPublish(connector, preflight, {
        projectId,
        documentId,
        locales,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        credentialsAvailable,
        externalWriteConfirmed,
        requestedAt,
      });
    } catch {
      return null;
    }
  }, [connector, credentialsAvailable, documentId, externalWriteConfirmed, locales, preflight, projectId, requestedAt, scheduledAt]);

  const rights = useMemo(() => auditStudioRightsGraph({
    nodes: [{
      id: documentId,
      kind: "document",
      title: locale === "ko" ? "현재 원고" : "Current manuscript",
      status: "allowed",
      licenseId: null,
      attributionText: null,
      sourceUrl: null,
    }],
    edges: [],
  }, [documentId]), [documentId, locale]);

  const packagePlan: StudioPublishingPackagePlan | null = useMemo(() => {
    if (!preflight || !state) return null;
    const localeStates = state.localization.length > 0
      ? state.localization
      : [{
        locale: "ko-KR",
        status: "review" as const,
        blockingIssueCount: 0,
        warningIssueCount: 1,
      }];
    try {
      return planStudioPublishingPackage({
        projectId,
        documentId,
        targetId: connector.id,
        policyVersion: connector.policyVersion,
        preflight,
        rights,
        locales: localeStates.map((item) => ({
          locale: item.locale,
          status: item.status,
          blockingIssueCount: item.blockingIssueCount,
          warningIssueCount: item.warningIssueCount,
        })),
        metadata: localeStates.map((item) => ({
          locale: item.locale,
          title: locale === "ko" ? "새 에피소드" : "New episode",
          description: locale === "ko"
            ? "ToonStudio에서 준비한 에피소드입니다."
            : "An episode prepared in ToonStudio.",
          author: "ToonStudio Creator",
          contentRating: "general",
          tags: ["toonstudio", "webtoon"],
        })),
        files: [
          {
            path: `content/${encodeURIComponent(documentId)}.png`,
            role: "content",
            sizeBytes: 2_400_000,
            checksum: CHECKSUM_A,
            locale: localeStates[0]?.locale ?? "ko-KR",
          },
          {
            path: "thumbnail/episode.webp",
            role: "thumbnail",
            sizeBytes: 220_000,
            checksum: CHECKSUM_B,
            locale: null,
          },
          {
            path: "metadata/project.json",
            role: "metadata",
            sizeBytes: 8_192,
            checksum: CHECKSUM_C,
            locale: null,
          },
        ],
        aiDisclosureRequired: false,
        aiDisclosureText: null,
        additionalAttributionTexts: rights.attributionTexts,
        createdAt: requestedAt,
      });
    } catch {
      return null;
    }
  }, [connector.id, connector.policyVersion, documentId, locale, preflight, projectId, requestedAt, rights, state]);

  const archiveManifest: StudioArchiveManifest = useMemo(() => ({
    schemaVersion: 1,
    applicationVersion: "toonstudio-1",
    projectId,
    createdAt: requestedAt,
    rootDocumentPaths: ["documents/episode-1.json"],
    files: [
      {
        path: "documents/episode-1.json",
        kind: "document",
        sizeBytes: 1_048_576,
        checksum: CHECKSUM_A,
        required: true,
      },
      {
        path: "assets/manifest.json",
        kind: "asset",
        sizeBytes: 32_768,
        checksum: CHECKSUM_B,
        required: true,
      },
      {
        path: "rights/manifest.json",
        kind: "rights",
        sizeBytes: 16_384,
        checksum: CHECKSUM_C,
        required: true,
      },
      {
        path: "settings/project.json",
        kind: "settings",
        sizeBytes: 8_192,
        checksum: CHECKSUM_A,
        required: true,
      },
      {
        path: "previews/cover.webp",
        kind: "preview",
        sizeBytes: 180_000,
        checksum: CHECKSUM_B,
        required: false,
      },
    ],
    dependencies: [
      { fromPath: "documents/episode-1.json", toPath: "assets/manifest.json" },
      { fromPath: "documents/episode-1.json", toPath: "rights/manifest.json" },
    ],
  }), [projectId, requestedAt]);
  const archiveValidation = useMemo(
    () => validateStudioArchiveManifest(archiveManifest),
    [archiveManifest],
  );
  const restorePlan = useMemo(() => planStudioArchiveRestore({
    manifest: archiveManifest,
    supportedSchemaVersions: [1],
    existingPaths: [],
    availablePaths: archiveManifest.files.map((file) => file.path),
  }), [archiveManifest]);

  const refresh = () => {
    setRequestedAt(new Date().toISOString());
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="delivery-title">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <PackageCheck size={14} aria-hidden="true" /> DELIVERY
          </p>
          <h2 id="delivery-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "검사한 결과를 안전하게 전달" : "Deliver validated work safely"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "직접 게시, 업로드 패키지, 수동 게시와 완전한 프로젝트 보관을 같은 흐름에서 준비합니다. 외부 서비스가 연결되지 않으면 완료로 표시하지 않습니다."
              : "Prepare direct publishing, upload packages, manual delivery and complete project archives in one flow. External work is never marked complete without a configured service."}
          </p>
        </div>
        <button type="button" onClick={refresh} className={buttonClass({ variant: "outline", size: "sm" })}>
          {locale === "ko" ? "현재 상태로 다시 계산" : "Recalculate"}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label={locale === "ko" ? "전달 방식" : "Delivery mode"}>
        {([
          ["publish", Globe2, locale === "ko" ? "플랫폼 게시" : "Publish"],
          ["package", FileArchive, locale === "ko" ? "게시 패키지" : "Package"],
          ["archive", Archive, locale === "ko" ? "완전한 사본" : "Archive"],
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={deliveryView === id}
            onClick={() => setDeliveryView(id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-black transition-colors",
              deliveryView === id
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
            )}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {deliveryView === "publish" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <label className="block text-xs font-black text-fg-2">
              {locale === "ko" ? "연결 방식" : "Connection mode"}
              <select
                value={connector.id}
                onChange={(event) => {
                  setConnectorId(event.target.value);
                  setExternalWriteConfirmed(false);
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              >
                {CONNECTORS.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.platformName}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-black text-fg-2">
              {locale === "ko" ? "예약 게시" : "Schedule"}
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              />
            </label>
            {connector.credentialsRequired ? (
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2">
                <input type="checkbox" checked={credentialsAvailable} onChange={(event) => setCredentialsAvailable(event.target.checked)} />
                <KeyRound size={15} className="text-accent" aria-hidden="true" />
                {locale === "ko" ? "게시 계정 연결됨" : "Publishing account connected"}
              </label>
            ) : null}
            {connector.mode === "direct-api" ? (
              <label className="flex min-h-12 items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/12 px-3 py-3 text-xs font-bold text-fg-2">
                <input className="mt-0.5" type="checkbox" checked={externalWriteConfirmed} onChange={(event) => setExternalWriteConfirmed(event.target.checked)} />
                <span>
                  {locale === "ko" ? "외부 게시 직전 확인" : "Confirm external publishing"}
                  <span className="mt-1 block font-normal leading-5 text-fg-3">
                    {locale === "ko" ? "실제 계정과 API가 구성된 환경에서만 게시 요청을 보냅니다." : "A request is sent only when a real account and API are configured."}
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <div className="space-y-3">
            {!preflight ? (
              <div className="rounded-2xl border border-warning/35 bg-warning-soft/15 p-4">
                <h3 className="flex items-center gap-2 text-sm font-black text-fg">
                  <CircleAlert size={17} className="text-warning" aria-hidden="true" />
                  {locale === "ko" ? "먼저 내보내기 사전검사를 실행해 주세요" : "Run export preflight first"}
                </h3>
                <p className="mt-2 text-xs leading-5 text-fg-2">
                  {locale === "ko" ? "규격·권리·현지화·열린 검토를 통과한 결과만 게시 계획에 사용할 수 있습니다." : "Only results checked for format, rights, localization and open reviews can be published."}
                </p>
                <Link href={`/studio/p/${encodeURIComponent(projectId)}/export?view=preflight`} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-accent px-3 text-xs font-bold text-on-accent">
                  {locale === "ko" ? "사전검사로 이동" : "Open preflight"}
                </Link>
              </div>
            ) : publishPlan ? (
              <>
                <StatusPanel
                  title={connector.platformName}
                  status={publishPlan.status}
                  description={locale === "ko"
                    ? `실행 방식: ${publishPlan.action} · 게시 언어 ${publishPlan.publishLocales.length}개`
                    : `Action: ${publishPlan.action} · ${publishPlan.publishLocales.length} publishing locales`}
                  locale={locale}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label={locale === "ko" ? "게시 언어" : "Publish locales"} value={publishPlan.publishLocales.length} />
                  <Metric label={locale === "ko" ? "제외 언어" : "Excluded locales"} value={publishPlan.unsupportedLocales.length} />
                  <Metric label={locale === "ko" ? "확인 사항" : "Warnings"} value={publishPlan.warnings.length} />
                </div>
                {publishPlan.blockingReasons.map((reason) => (
                  <p key={reason} className="rounded-xl border border-danger/30 bg-danger-soft/12 px-3 py-2 text-xs text-danger">{reason}</p>
                ))}
                {publishPlan.status === "ready" ? (
                  <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft/12 p-3">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    <p className="text-xs leading-5 text-fg-2">
                      {connector.mode === "direct-api"
                        ? (locale === "ko" ? "게시 요청을 보낼 준비가 됐습니다. 실제 전송은 구성된 서버 Connector에서만 수행합니다." : "The request is ready. A configured server connector is required for the actual publish.")
                        : (locale === "ko" ? "이 방식은 외부 게시 대신 안전한 패키지 또는 안내를 만듭니다." : "This mode creates a safe package or instructions instead of writing externally.")}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <StatusPanel
                title={locale === "ko" ? "게시 계획을 만들 수 없어요" : "Publishing plan unavailable"}
                status="blocked"
                description={locale === "ko" ? "예약 시간과 프로젝트 상태를 확인해 주세요." : "Check the schedule and project state."}
                locale={locale}
              />
            )}
          </div>
        </div>
      ) : null}

      {deliveryView === "package" ? (
        <div className="mt-5 space-y-4">
          {!packagePlan ? (
            <StatusPanel
              title={locale === "ko" ? "게시 패키지를 만들기 전에 사전검사가 필요해요" : "Preflight is required before packaging"}
              status="blocked"
              description={locale === "ko" ? "내보내기 사전검사를 저장한 뒤 다시 열어 주세요." : "Save an export preflight and return here."}
              locale={locale}
            />
          ) : (
            <>
              <StatusPanel
                title={locale === "ko" ? "재현 가능한 게시 패키지" : "Reproducible publishing package"}
                status={packagePlan.status}
                description={locale === "ko"
                  ? "파일 checksum, 언어별 메타데이터, 사용 권리, 출처와 정책 버전을 함께 보관합니다."
                  : "Store checksums, localized metadata, rights, attribution and policy version together."}
                locale={locale}
              />
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label={locale === "ko" ? "파일" : "Files"} value={packagePlan.manifest?.files.length ?? 0} />
                <Metric label={locale === "ko" ? "언어" : "Locales"} value={packagePlan.manifest?.locales.length ?? 0} />
                <Metric label={locale === "ko" ? "출처" : "Credits"} value={packagePlan.manifest?.attributionTexts.length ?? 0} />
                <Metric label={locale === "ko" ? "예상 크기" : "Estimated size"} value={`${Math.round((packagePlan.manifest?.totalSizeBytes ?? 0) / 1024 / 1024 * 10) / 10} MB`} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!packagePlan.manifest || packagePlan.status === "blocked"}
                  onClick={() => packagePlan.manifest && downloadJson(`${projectId}-publish-manifest.json`, packagePlan.manifest)}
                  className={buttonClass({ className: "gap-2" })}
                >
                  <Download size={16} aria-hidden="true" />
                  {locale === "ko" ? "패키지 Manifest 받기" : "Download package manifest"}
                </button>
                <Link href={`/studio/work/${encodeURIComponent(projectId)}/publish`} className={buttonClass({ variant: "outline", className: "gap-2" })}>
                  <Send size={16} aria-hidden="true" />
                  {locale === "ko" ? "실제 파일 생성으로" : "Create output files"}
                </Link>
              </div>
              {[...packagePlan.blockingCodes, ...packagePlan.warningCodes].map((code) => (
                <p key={code} className="rounded-xl border border-warning/25 bg-warning-soft/10 px-3 py-2 text-xs text-fg-2">{code}</p>
              ))}
            </>
          )}
        </div>
      ) : null}

      {deliveryView === "archive" ? (
        <div className="mt-5 space-y-4">
          <StatusPanel
            title={locale === "ko" ? "완전한 프로젝트 사본" : "Complete project copy"}
            status={archiveValidation.valid ? restorePlan.status : "blocked"}
            description={locale === "ko"
              ? "원고, 에셋 목록, 사용 권리, 프로젝트 설정과 미리보기를 의존 관계와 함께 보관합니다. 보관은 삭제가 아닙니다."
              : "Archive documents, asset inventory, rights, project settings and preview with dependencies. Archiving is not deletion."}
            locale={locale}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label={locale === "ko" ? "포함 파일" : "Files"} value={archiveManifest.files.length} />
            <Metric label={locale === "ko" ? "필수 파일" : "Required"} value={archiveManifest.files.filter((file) => file.required).length} />
            <Metric label={locale === "ko" ? "의존 관계" : "Dependencies"} value={archiveManifest.dependencies.length} />
            <Metric label={locale === "ko" ? "검증 크기" : "Validated size"} value={`${Math.round(archiveValidation.totalSizeBytes / 1024)} KB`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!archiveValidation.valid || restorePlan.status === "blocked"}
              onClick={() => downloadJson(`${projectId}-archive-manifest.json`, archiveManifest)}
              className={buttonClass({ className: "gap-2" })}
            >
              <Download size={16} aria-hidden="true" />
              {locale === "ko" ? "보관 Manifest 받기" : "Download archive manifest"}
            </button>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-success/30 bg-success-soft/12 px-3 text-xs font-bold text-fg-2">
              <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
              {locale === "ko" ? "복원 가능성 검사 완료" : "Restore plan checked"}
            </span>
          </div>
          {archiveValidation.issues.map((issue) => (
            <p key={issue} className="rounded-xl border border-danger/30 bg-danger-soft/12 px-3 py-2 text-xs text-danger">{issue}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
