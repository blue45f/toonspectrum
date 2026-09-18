import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Cloud,
  FileCheck2,
  KeyRound,
  Plug,
  ShieldCheck,
  Store,
  Type,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import {
  createDefaultStudioAssetGovernance,
  createDefaultStudioAssetGovernancePreferences,
  evaluateStudioAssetGovernance,
  readStudioAssetGovernancePreferences,
  writeStudioAssetGovernancePreferences,
  type StudioAssetGovernancePreferences,
  type StudioAssetGovernanceStatus,
} from "../studio-asset-governance";
import {
  STUDIO_ASSET_DESTINATIONS,
  type StudioAssetDestination,
} from "../studio-asset-passport";
import {
  STUDIO_PLUGIN_PERMISSIONS,
  type StudioPluginPermission,
} from "../studio-plugin-registry";
import Link from "@/compat/router-link";
import { cn } from "@/shared/lib/utils";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

type Locale = string;
const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("StudioAssetGovernancePanel", ko, en);;

const DESTINATION_LABELS: Readonly<
  Record<StudioAssetDestination, Readonly<Record<Locale, string>>>
> = {
  internal: { ko: "프로젝트 안에서만", en: "Inside project only" },
  webtoon: { ko: "웹툰 공개", en: "Webtoon publishing" },
  print: { ko: "인쇄", en: "Print" },
  video: { ko: "영상", en: "Video" },
  merchandise: { ko: "굿즈", en: "Merchandise" },
  app: { ko: "앱·게임", en: "App or game" },
  ebook: { ko: "전자책", en: "Ebook" },
  "client-delivery": { ko: "클라이언트 전달", en: "Client delivery" },
};

const PERMISSION_LABELS: Readonly<
  Record<StudioPluginPermission, Readonly<Record<Locale, string>>>
> = {
  "document-read": { ko: "문서 읽기", en: "Read documents" },
  "document-write": { ko: "문서 수정", en: "Edit documents" },
  "asset-read": { ko: "에셋 읽기", en: "Read assets" },
  "asset-write": { ko: "에셋 추가·수정", en: "Add or edit assets" },
  network: { ko: "외부 서비스 연결", en: "Connect to external services" },
  filesystem: { ko: "기기 파일 사용", en: "Use device files" },
  ai: { ko: "AI 기능 사용", en: "Use AI capabilities" },
  publish: { ko: "외부 게시", en: "Publish externally" },
};

function tone(status: string): string {
  if (["ready", "allowed", "active"].includes(status)) {
    return "border-success/30 bg-success-soft/15 text-success";
  }
  if (["blocked", "prohibited"].includes(status)) {
    return "border-danger/35 bg-danger-soft/15 text-danger";
  }
  return "border-warning/35 bg-warning-soft/15 text-warning";
}

function statusLabel(status: string, _locale): string {
  const ko: Readonly<Record<string, string>> = {
    ready: "사용 가능",
    allowed: "사용 가능",
    active: "확인됨",
    warning: "조건 확인",
    review: "검토 필요",
    confirmation: "확인 필요",
    blocked: "사용 불가",
  };
  const en: Readonly<Record<string, string>> = {
    ready: "Ready",
    allowed: "Allowed",
    active: "Verified",
    warning: "Review conditions",
    review: "Review",
    confirmation: "Confirmation needed",
    blocked: "Blocked",
  };
  return (bi(ko[status], en[status])) ?? status;
}

function StatusCard({
  icon: Icon,
  label,
  status,
  description,
  locale,
}: {
  readonly icon: typeof ShieldCheck;
  readonly label: string;
  readonly status: string;
  readonly description: string;
  readonly locale: Locale;
}) {
  useBilingualI18nRevision();
  return (
    <article className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-card text-accent">
          <Icon size={17} aria-hidden="true" />
        </span>
        <span className={cn("rounded-full border px-2.5 py-1 text-[0.65rem] font-black", tone(status))}>
          {statusLabel(status, locale)}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-black text-fg">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-fg-3">{description}</p>
    </article>
  );
}

function CheckOption({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly description: string;
  readonly onChange: (checked: boolean) => void;
}) {
  useBilingualI18nRevision();
  const inputId = useId();
  const descriptionId = `${inputId}-description`;

  return (
    <label
      htmlFor={inputId}
      aria-label={label}
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-xl border border-line bg-panel px-3 py-3 text-sm",
        disabled && "opacity-55",
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={descriptionId}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>
        <b className="block text-xs text-fg">{label}</b>
        <span id={descriptionId} className="mt-1 block text-[0.68rem] leading-5 text-fg-3">{description}</span>
      </span>
    </label>
  );
}

/**
 * User-facing projection of quality, rights, provider entitlement, fonts, plugins and market
 * readiness. Internal policy models remain one authority while the UI asks only intent questions.
 */
export function StudioAssetGovernancePanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  useBilingualI18nRevision();
  const [evaluatedAt, setEvaluatedAt] = useState(() => new Date().toISOString());
  const [preferences, setPreferences] = useState<StudioAssetGovernancePreferences>(
    createDefaultStudioAssetGovernancePreferences,
  );
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPreferences(readStudioAssetGovernancePreferences(window.localStorage, projectId));
  }, [projectId]);

  const input = useMemo(
    () => createDefaultStudioAssetGovernance(projectId, evaluatedAt, preferences),
    [evaluatedAt, preferences, projectId],
  );
  const report = useMemo(() => evaluateStudioAssetGovernance(input), [input]);

  const commit = (next: StudioAssetGovernancePreferences) => {
    const normalized = typeof window === "undefined"
      ? next
      : writeStudioAssetGovernancePreferences(
        window.localStorage,
        projectId,
        next,
        window,
      );
    setPreferences(normalized);
    setEvaluatedAt(new Date().toISOString());
    setSavedMessage(bi("현재 프로젝트 기준을 저장했습니다.", "Saved project asset rules."));
  };

  const patch = <K extends keyof StudioAssetGovernancePreferences>(
    key: K,
    value: StudioAssetGovernancePreferences[K],
  ) => commit({ ...preferences, [key]: value });

  const togglePermission = (permission: StudioPluginPermission, checked: boolean) => {
    const current = new Set(preferences.confirmedPluginPermissions);
    if (checked) current.add(permission);
    else current.delete(permission);
    patch("confirmedPluginPermissions", STUDIO_PLUGIN_PERMISSIONS.filter((item) => current.has(item)));
  };

  const summaryCopy: Readonly<Record<StudioAssetGovernanceStatus, Readonly<Record<Locale, string>>>> = {
    ready: {
      ko: "현재 목적에 맞는 품질과 사용 조건을 확인했습니다.",
      en: "Quality and usage conditions match the current purpose.",
    },
    review: {
      ko: "몇 가지 조건을 확인하면 사용할 수 있습니다.",
      en: "Review a few conditions before use.",
    },
    blocked: {
      ko: "사용 범위나 권한을 수정해야 합니다.",
      en: "Usage scope or permissions must be changed.",
    },
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="asset-governance-title">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <ShieldCheck size={14} aria-hidden="true" /> ASSET SAFETY
          </p>
          <h2 id="asset-governance-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {bi("어디에 사용할지만 알려 주세요", "Tell us where the asset will be used")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {bi("파일 품질, 팀 좌석, 상업 이용, 글꼴, 출처, AI 참조와 확장 기능 권한을 자동으로 함께 확인합니다. 라이선스 문구 대신 지금 할 수 있는 행동을 보여 줍니다.", "Check file quality, seats, commercial use, fonts, provenance, AI reference and extension permissions together, then show actionable results instead of legal codes.")}
          </p>
        </div>
        <span className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-black", tone(report.status))}>
          {bi((summaryCopy[report.status]).ko, (summaryCopy[report.status]).en)}
        </span>
      </div>

      {savedMessage ? (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-xs font-bold text-success">
          {savedMessage}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block text-xs font-black text-fg-2">
            {bi("사용 목적", "Destination")}
            <select
              value={preferences.destination}
              onChange={(event) => patch("destination", event.target.value as StudioAssetDestination)}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {STUDIO_ASSET_DESTINATIONS.map((destination) => (
                <option key={destination} value={destination}>
                  {bi((DESTINATION_LABELS[destination]).ko, (DESTINATION_LABELS[destination]).en)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-black text-fg-2">
            {bi("함께 쓰는 사람", "Team seats")}
            <input
              type="number"
              min={1}
              max={999}
              value={preferences.teamSeats}
              onChange={(event) => patch("teamSeats", Math.max(1, Number(event.target.value) || 1))}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <CheckOption
            checked={preferences.providerAccountConnected}
            label={bi("구매한 계정 연결됨", "Purchased account connected")}
            description={bi("구매 내역과 사용 좌석을 확인합니다.", "Verify purchase history and licensed seats.")}
            onChange={(checked) => patch("providerAccountConnected", checked)}
          />
          <CheckOption
            checked={preferences.attributionIncluded}
            label={bi("필요한 출처 문구 포함", "Required credits included")}
            description={bi("출력 패키지에 필요한 출처를 자동으로 모읍니다.", "Collect required credits in the export package.")}
            onChange={(checked) => patch("attributionIncluded", checked)}
          />
          <CheckOption
            checked={preferences.sourceReferencesCleared}
            label={bi("참조 원본 사용 권리 확인", "Reference rights cleared")}
            description={bi("AI 보조·생성 에셋의 참조 원본을 확인했습니다.", "Reference material for AI-assisted assets is cleared.")}
            onChange={(checked) => patch("sourceReferencesCleared", checked)}
          />
        </div>

        <div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatusCard
              icon={FileCheck2}
              label={bi("파일 품질·호환성", "File quality & compatibility")}
              status={report.usage.status}
              description={bi(report.usage.summaryKo, report.usage.summaryEn)}
              locale={locale}
            />
            <StatusCard
              icon={Cloud}
              label={bi("구매·설치 확인", "Purchase & installation")}
              status={report.entitlement.status === "active" ? report.provider.status : report.entitlement.status}
              description={bi(report.provider.messageKo, report.provider.messageEn)}
              locale={locale}
            />
            <StatusCard
              icon={KeyRound}
              label={bi("사용 권리·출처", "Rights & provenance")}
              status={report.rights.status}
              description={formatI18nTemplate(String(bi("{value0}개 사용 항목과 {value1}개 출처 문구를 확인했습니다.", "Checked {value0} usage entries and {value1} attribution statements.")), { value0: report.rights.entries.length, value1: report.attributionTexts.length })}
              locale={locale}
            />
            <StatusCard
              icon={Type}
              label={bi("글꼴·글리프", "Fonts & glyphs")}
              status={report.fonts.status}
              description={formatI18nTemplate(String(bi("{value0}개 글꼴의 언어·임베딩·용도를 검사합니다.", "Check language, embedding and destination rights for {value0} fonts.")), { value0: report.fonts.fontIds.length })}
              locale={locale}
            />
            <StatusCard
              icon={Plug}
              label={bi("확장 기능 권한", "Extension permissions")}
              status={report.plugin.status}
              description={formatI18nTemplate(String(bi("{value0}개 권한 확인이 필요합니다.", "{value0} permissions need confirmation.")), { value0: report.plugin.confirmationPermissions.length })}
              locale={locale}
            />
            <StatusCard
              icon={Store}
              label={bi("마켓 등록 준비", "Marketplace readiness")}
              status={report.marketplace.status}
              description={formatI18nTemplate(String(bi("{value0}개 품질·미리보기·출처 항목을 확인했습니다.", "Checked {value0} quality, preview and provenance findings.")), { value0: report.marketplace.findings.length })}
              locale={locale}
            />
          </div>

          {report.plugin.confirmationPermissions.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-line bg-panel/55 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-fg">
                <Plug size={16} className="text-accent" aria-hidden="true" />
                {bi("확장 기능이 요청한 권한", "Permissions requested by extension")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-fg-3">
                {bi("읽기 권한은 자동으로 제한하고, 수정·외부 연결·게시처럼 영향이 큰 기능만 직접 허용합니다.", "Read access is constrained automatically. Only editing, external connection and publishing require approval.")}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {report.plugin.confirmationPermissions.map((permission) => (
                  <CheckOption
                    key={permission}
                    checked={preferences.confirmedPluginPermissions.includes(permission)}
                    label={bi((PERMISSION_LABELS[permission]).ko, (PERMISSION_LABELS[permission]).en)}
                    description={bi("이 프로젝트에서만 허용합니다.", "Allow only in this project.")}
                    onChange={(checked) => togglePermission(permission, checked)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <details className="mt-4 rounded-2xl border border-line bg-panel/45 p-4">
            <summary className="min-h-10 cursor-pointer text-sm font-black text-fg">
              {bi("전문 사용 범위", "Advanced usage scope")}
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <CheckOption
                checked={preferences.commercial}
                label={bi("상업 프로젝트", "Commercial project")}
                description={bi("유료 연재·광고·클라이언트 작업을 포함합니다.", "Includes paid publishing, ads and client work.")}
                onChange={(checked) => patch("commercial", checked)}
              />
              <CheckOption
                checked={preferences.modifiesAsset}
                label={bi("에셋 편집·변형", "Modify the asset")}
                description={bi("색상·형태·레이어를 바꾸어 사용합니다.", "Change colors, shape or layers.")}
                onChange={(checked) => patch("modifiesAsset", checked)}
              />
              <CheckOption
                checked={preferences.deliversSourceFiles}
                label={bi("원본 파일도 전달", "Deliver source files")}
                description={bi("클라이언트나 팀에 편집 가능한 원본을 전달합니다.", "Deliver editable sources to clients or teammates.")}
                onChange={(checked) => patch("deliversSourceFiles", checked)}
              />
              <CheckOption
                checked={preferences.usesAsAiReference}
                label={bi("AI 생성 참고로 사용", "Use as AI generation reference")}
                description={bi("생성 결과의 구도·캐릭터·스타일 참고에 사용합니다.", "Use as composition, character or style reference.")}
                onChange={(checked) => patch("usesAsAiReference", checked)}
              />
              <CheckOption
                checked={preferences.usesForAiTraining}
                label={bi("AI 학습에 사용", "Use for AI training")}
                description={bi("대부분의 구매 에셋은 허용하지 않으므로 별도 확인합니다.", "Most purchased assets do not allow this and require separate review.")}
                onChange={(checked) => patch("usesForAiTraining", checked)}
              />
            </div>
          </details>

          {report.attributionTexts.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-success/25 bg-success-soft/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-fg">
                <BadgeCheck size={16} className="text-success" aria-hidden="true" />
                {bi("출력에 포함할 출처", "Credits included in output")}
              </h3>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">
                {report.attributionTexts.map((text) => <li key={text}>• {text}</li>)}
              </ul>
            </div>
          ) : null}

          {report.blockingCount > 0 || report.reviewCount > 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft/12 p-4">
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-xs leading-5 text-fg-2">
                {formatI18nTemplate(String(bi("수정이 필요한 항목 {value0}개, 조건 확인 {value1}개가 있습니다. 사용 목적이나 연결 상태를 바꾸면 즉시 다시 계산합니다.", "{value0} blocking and {value1} review items remain. Results update immediately when usage or connection choices change.")), { value0: report.blockingCount, value1: report.reviewCount })}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-accent/25 bg-accent-soft/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <p className="text-xs leading-5 text-fg-2">
                {bi("이 확인은 프로젝트의 사용 목적과 권리 조건을 정리하는 도구입니다. 작품·원고·원본 파일의 권리를 서비스로 이전하지 않습니다.", "This review organises project usage and rights conditions. It does not transfer ownership of artwork, manuscripts or source files to the service.")}
              </p>
            </div>
            <Link
              href="/about/principles"
              className="inline-flex min-h-10 shrink-0 items-center gap-2 text-xs font-black text-accent hover:text-accent-2"
            >
              {bi("제품 원칙 보기", "View product principles")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
