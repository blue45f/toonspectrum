import {
  ArchiveRestore,
  Clock3,
  FileArchive,
  FileClock,
  FileSearch2,
  FolderOpen,
  HardDrive,
  History,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from "react";

import {
  addStudioRecentLocalFile,
  formatStudioFileBytes,
  inspectStudioFileCandidate,
  parseStudioRecentLocalFiles,
  studioFileControlAction,
  type StudioFileCompatibilityReport,
  type StudioFileCompatibilityTier,
  type StudioFileControlActionId,
  type StudioRecentLocalFile,
} from "./studio-file-control-center-model";
import {
  scanStudioRecoveryStorage,
  type StudioRecoveryScan,
} from "./studio-recovery-guide";

import { cn } from "@/shared/lib/utils";

const RECENT_LOCAL_FILES_STORAGE_KEY =
  "toonspectrum-studio-file-control-center:recent-files:v1";

interface BrowserStorageHealth {
  readonly status: "error" | "loading" | "ready" | "unsupported";
  readonly persisted: boolean | null;
  readonly usage: number | null;
  readonly quota: number | null;
}

const LOADING_STORAGE_HEALTH: BrowserStorageHealth = Object.freeze({
  status: "loading",
  persisted: null,
  usage: null,
  quota: null,
});

const QUICK_ACTION_IDS = Object.freeze([
  "new-work",
  "named-version",
  "archive-copy",
  "archive-recovery",
] satisfies readonly StudioFileControlActionId[]);

const QUICK_ACTION_ICONS = Object.freeze({
  "new-work": FolderOpen,
  "named-version": History,
  "archive-copy": FileArchive,
  "archive-recovery": ArchiveRestore,
} satisfies Record<(typeof QUICK_ACTION_IDS)[number], typeof FolderOpen>);

const REPORT_TIER_CLASS: Readonly<Record<StudioFileCompatibilityTier, string>> =
  Object.freeze({
    native: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    structured: "border-accent/30 bg-accent/10 text-accent",
    bridge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    blocked: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
    unsupported: "border-line bg-raised text-fg-2",
  });

function normalizeProjectCenterText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function buttonSearchText(button: HTMLButtonElement): string {
  return normalizeProjectCenterText([
    button.textContent ?? "",
    button.getAttribute("aria-label") ?? "",
    button.getAttribute("title") ?? "",
  ].join(" "));
}

function actionButtonInProjectCenter(
  root: HTMLElement,
  actionId: StudioFileControlActionId,
): HTMLButtonElement | null {
  const panel = root.closest<HTMLElement>(
    '[data-studio-project-actions-menu="true"]',
  );
  if (!panel) return null;
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .filter((button) => !root.contains(button))
    .filter((button) => button.dataset.projectCenterControl !== "true");
  const action = studioFileControlAction(actionId);
  for (const matcher of action.buttonMatchers) {
    const normalizedTerms = matcher.map(normalizeProjectCenterText);
    const matched = buttons.find((button) => {
      const haystack = buttonSearchText(button);
      return normalizedTerms.every((term) => haystack.includes(term));
    });
    if (matched) return matched;
  }
  return null;
}

function readRecentLocalFiles(): readonly StudioRecentLocalFile[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStudioRecentLocalFiles(
      window.localStorage.getItem(RECENT_LOCAL_FILES_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

function writeRecentLocalFiles(files: readonly StudioRecentLocalFile[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_LOCAL_FILES_STORAGE_KEY, JSON.stringify(files));
  } catch {
    // Private browsing and quota pressure can reject metadata persistence. The
    // current session still keeps the list in React state.
  }
}

function clearRecentLocalFiles(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECENT_LOCAL_FILES_STORAGE_KEY);
  } catch {
    // The list is also cleared in memory, so a blocked storage API is harmless.
  }
}

function readRecoveryScan(): StudioRecoveryScan {
  if (typeof window === "undefined") return scanStudioRecoveryStorage(null);
  try {
    return scanStudioRecoveryStorage(window.localStorage);
  } catch {
    return scanStudioRecoveryStorage(null);
  }
}

async function readBrowserStorageHealth(): Promise<BrowserStorageHealth> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return {
      status: "unsupported",
      persisted: null,
      usage: null,
      quota: null,
    };
  }
  try {
    const manager = navigator.storage;
    const [persisted, estimate] = await Promise.all([
      typeof manager.persisted === "function"
        ? manager.persisted().catch(() => null)
        : Promise.resolve(null),
      typeof manager.estimate === "function"
        ? manager.estimate().catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      status: "ready",
      persisted,
      usage: typeof estimate?.usage === "number" ? estimate.usage : null,
      quota: typeof estimate?.quota === "number" ? estimate.quota : null,
    };
  } catch {
    return {
      status: "error",
      persisted: null,
      usage: null,
      quota: null,
    };
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "시각 확인 불가";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function storageUsageLabel(health: BrowserStorageHealth): string {
  if (health.status === "loading") return "저장소 확인 중";
  if (health.status === "unsupported") return "브라우저 저장소 상태 API 미지원";
  if (health.status === "error") return "브라우저 저장소 상태를 읽지 못함";
  if (health.usage === null || health.quota === null || health.quota <= 0) {
    return "사용량 정보 없음";
  }
  const percent = Math.min(100, Math.max(0, (health.usage / health.quota) * 100));
  return `${formatStudioFileBytes(health.usage)} / ${formatStudioFileBytes(health.quota)} · ${percent.toFixed(1)}%`;
}

function storageProtectionLabel(health: BrowserStorageHealth): string {
  if (health.status === "loading") return "확인 중";
  if (health.status === "unsupported") return "지원 안 함";
  if (health.status === "error") return "확인 실패";
  if (health.persisted === true) return "영구 보관 허용됨";
  if (health.persisted === false) return "브라우저 정리 대상일 수 있음";
  return "권한 상태 확인 불가";
}

function actionStatusText(actionId: StudioFileControlActionId): string {
  switch (actionId) {
    case "new-work":
      return "새 작업 준비 화면을 열었습니다.";
    case "named-version":
      return "버전 체크포인트를 열었습니다.";
    case "archive-copy":
      return "완전 사본 내보내기를 시작했습니다.";
    case "archive-recovery":
      return "프로젝트 아카이브 선택기를 열었습니다.";
    case "project-json-import":
      return "프로젝트 JSON 선택기를 열었습니다.";
    case "psd-import":
      return "PSD 선택기를 열었습니다.";
    case "interchange-import":
      return "ORA · CBZ · WILL 선택기를 열었습니다.";
  }
}

function FileReport({
  report,
  onOpenImporter,
}: {
  report: StudioFileCompatibilityReport;
  onOpenImporter: (actionId: StudioFileControlActionId) => void;
}): ReactElement {
  const riskItems = report.risks.slice(0, 3);
  const recommendations = report.recommendations.slice(0, 2);
  const actionId = report.actionId;
  return (
    <div className="mt-3 rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.76rem] font-bold text-fg" title={report.name}>
            {report.name}
          </p>
          <p className="mt-0.5 text-[0.62rem] text-fg-3">
            {report.capabilityLabel} · {report.sizeLabel}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[0.58rem] font-bold",
            REPORT_TIER_CLASS[report.tier],
          )}
        >
          {report.tierLabel}
        </span>
      </div>
      <p className="mt-2 text-[0.66rem] leading-relaxed text-fg-2">
        {report.summary}
      </p>
      {report.maxFileBytes !== null ? (
        <p className="mt-1 text-[0.61rem] text-fg-3">
          감사된 단일 파일 한도 {formatStudioFileBytes(report.maxFileBytes)}
        </p>
      ) : null}
      {riskItems.length > 0 ? (
        <div className="mt-2 rounded-lg bg-raised/70 p-2.5">
          <p className="text-[0.6rem] font-bold text-fg-2">예상 손실</p>
          <ul className="mt-1 space-y-1 text-[0.61rem] leading-relaxed text-fg-3">
            {riskItems.map((risk) => <li key={risk}>• {risk}</li>)}
          </ul>
        </div>
      ) : null}
      {recommendations.length > 0 ? (
        <div className="mt-2 rounded-lg border border-line/70 p-2.5">
          <p className="text-[0.6rem] font-bold text-fg-2">권장 브리지</p>
          <ul className="mt-1 space-y-1 text-[0.61rem] leading-relaxed text-fg-3">
            {recommendations.map((recommendation) => (
              <li key={recommendation}>• {recommendation}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {actionId ? (
        <button
          type="button"
          data-project-center-control="true"
          data-project-keep-open
          onClick={() => onOpenImporter(actionId)}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-[0.68rem] font-bold text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Upload size={14} aria-hidden />
          {studioFileControlAction(actionId).label} 열기
        </button>
      ) : (
        <p className="mt-3 rounded-lg border border-line bg-raised px-3 py-2 text-[0.62rem] leading-relaxed text-fg-3">
          이 파일은 여기서 직접 열지 않습니다. 위 변환 권장안을 적용한 사본을 준비하세요.
        </p>
      )}
    </div>
  );
}

export function StudioFileControlCenter(): ReactElement {
  const titleId = useId();
  const inputId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [storageHealth, setStorageHealth] = useState<BrowserStorageHealth>(
    LOADING_STORAGE_HEALTH,
  );
  const [storageBusy, setStorageBusy] = useState(false);
  const [recoveryScan, setRecoveryScan] = useState<StudioRecoveryScan>(() =>
    readRecoveryScan(),
  );
  const [report, setReport] = useState<StudioFileCompatibilityReport | null>(null);
  const [recentFiles, setRecentFiles] = useState<readonly StudioRecentLocalFile[]>(() =>
    readRecentLocalFiles(),
  );

  const refreshHealth = useCallback(async () => {
    setStorageHealth(LOADING_STORAGE_HEALTH);
    const next = await readBrowserStorageHealth();
    setStorageHealth(next);
    setRecoveryScan(readRecoveryScan());
  }, []);

  useEffect(() => {
    let active = true;
    setRecoveryScan(readRecoveryScan());
    void readBrowserStorageHealth().then((next) => {
      if (active) setStorageHealth(next);
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const quickActions = useMemo(
    () => QUICK_ACTION_IDS.map(studioFileControlAction),
    [],
  );
  const autosavesWithContent = recoveryScan.autosaves.filter(
    (entry) => entry.hasContent,
  );
  const latestAutosave = autosavesWithContent[0] ?? recoveryScan.autosaves[0] ?? null;

  const invokeAction = useCallback((actionId: StudioFileControlActionId) => {
    const root = rootRef.current;
    const action = studioFileControlAction(actionId);
    if (!root) {
      setAnnouncement(`${action.label} 실행 위치를 찾지 못했습니다.`);
      return;
    }
    const target = actionButtonInProjectCenter(root, actionId);
    if (!target) {
      setAnnouncement(`${action.label}의 기존 프로젝트 명령을 찾지 못했습니다.`);
      return;
    }
    if (target.disabled || target.getAttribute("aria-disabled") === "true") {
      const reason = target.getAttribute("title");
      setAnnouncement(reason || `${action.label}은 현재 문서 상태에서 사용할 수 없습니다.`);
      return;
    }
    target.click();
    setAnnouncement(actionStatusText(actionId));
  }, []);

  const inspectFile = useCallback((file: File) => {
    const nextReport = inspectStudioFileCandidate(file);
    setReport(nextReport);
    setRecentFiles((current) => {
      const next = addStudioRecentLocalFile(current, nextReport);
      writeRecentLocalFiles(next);
      return next;
    });
    setAnnouncement(
      `${file.name} 형식 사전검사를 마쳤습니다. ${nextReport.tierLabel}.`,
    );
  }, []);

  const onFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) inspectFile(file);
    event.currentTarget.value = "";
  }, [inspectFile]);

  const onFileDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  }, [inspectFile]);

  const requestPersistence = useCallback(async () => {
    if (
      typeof navigator === "undefined"
      || !navigator.storage
      || typeof navigator.storage.persist !== "function"
    ) {
      setAnnouncement("이 브라우저는 영구 저장소 요청을 지원하지 않습니다.");
      return;
    }
    setStorageBusy(true);
    try {
      const granted = await navigator.storage.persist();
      setAnnouncement(
        granted
          ? "브라우저가 복구 저장소의 영구 보관을 허용했습니다."
          : "브라우저가 영구 보관을 허용하지 않았습니다. 아카이브 사본을 별도로 저장하세요.",
      );
      setStorageHealth(await readBrowserStorageHealth());
    } catch {
      setAnnouncement("브라우저 저장소 보호 요청을 완료하지 못했습니다.");
    } finally {
      setStorageBusy(false);
    }
  }, []);

  const removeRecentFiles = useCallback(() => {
    clearRecentLocalFiles();
    setRecentFiles([]);
    setAnnouncement("이 브라우저에 저장한 최근 파일명 기록을 지웠습니다.");
  }, []);

  return (
    <section
      ref={rootRef}
      data-studio-file-control-center="true"
      aria-labelledby={titleId}
      className="col-span-full mt-2 rounded-2xl border border-line bg-canvas/55 p-3 shadow-inner sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-accent">
            File lifecycle
          </p>
          <h2 id={titleId} className="mt-1 text-sm font-black tracking-tight text-fg">
            파일 제어 센터
          </h2>
          <p className="mt-1 max-w-2xl text-[0.66rem] leading-relaxed text-fg-3">
            저장 사본·명명 버전·복구·가져오기 손실을 한곳에서 확인합니다. 실행은 기존 프로젝트 명령에 위임해 저장 경로가 갈라지지 않습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/studio/projects"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[0.64rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <FolderOpen size={13} aria-hidden /> 프로젝트 라이브러리
          </a>
          <button
            type="button"
            data-project-center-control="true"
            data-project-keep-open
            onClick={() => void refreshHealth()}
            aria-label="파일 제어 센터 상태 새로고침"
            className="grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RefreshCcw size={14} aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = QUICK_ACTION_ICONS[action.id as (typeof QUICK_ACTION_IDS)[number]];
          return (
            <button
              key={action.id}
              type="button"
              data-project-center-control="true"
              data-project-keep-open
              onClick={() => invokeAction(action.id)}
              aria-label={`파일 센터 · ${action.label}`}
              className="group min-h-[5.2rem] rounded-xl border border-line bg-card p-3 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex items-center gap-2 text-[0.7rem] font-black text-fg">
                <Icon size={15} aria-hidden className="text-accent" />
                {action.label}
              </span>
              <span className="mt-1.5 block text-[0.61rem] leading-relaxed text-fg-3">
                {action.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} aria-hidden className="text-accent" />
              <h3 className="text-[0.72rem] font-black text-fg">복구 준비 상태</h3>
            </div>
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.58rem] font-bold",
                online
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {online ? "온라인" : "오프라인"}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-lg bg-raised/70 p-2.5">
              <dt className="flex items-center gap-1.5 text-[0.6rem] font-bold text-fg-3">
                <FileClock size={12} aria-hidden /> 복구 가능한 임시저장
              </dt>
              <dd className="mt-1 text-[0.72rem] font-black text-fg">
                {recoveryScan.storageUnavailable
                  ? "저장소 확인 불가"
                  : `${autosavesWithContent.length}개`}
              </dd>
              <dd className="mt-0.5 text-[0.58rem] text-fg-3">
                최근 {formatDateTime(latestAutosave?.savedAt ?? null)}
              </dd>
            </div>
            <div className="rounded-lg bg-raised/70 p-2.5">
              <dt className="flex items-center gap-1.5 text-[0.6rem] font-bold text-fg-3">
                <HardDrive size={12} aria-hidden /> 브라우저 보관 보호
              </dt>
              <dd className="mt-1 text-[0.68rem] font-black text-fg">
                {storageProtectionLabel(storageHealth)}
              </dd>
              <dd className="mt-0.5 text-[0.58rem] text-fg-3">
                {storageUsageLabel(storageHealth)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[0.6rem] leading-relaxed text-fg-3">
            브라우저 보관 상태는 서버 초안 저장 성공을 뜻하지 않습니다. 장기 보관과 기기 이동에는 .toonproject.zip 사본을 함께 남기세요.
          </p>
          {storageHealth.status === "ready" && storageHealth.persisted === false ? (
            <button
              type="button"
              data-project-center-control="true"
              data-project-keep-open
              onClick={() => void requestPersistence()}
              disabled={storageBusy}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-raised px-3 text-[0.66rem] font-bold text-fg-2 hover:bg-card disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {storageBusy
                ? <Loader2 size={14} aria-hidden className="animate-spin" />
                : <ShieldCheck size={14} aria-hidden />}
              브라우저 저장 보호 요청
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-2">
            <FileSearch2 size={15} aria-hidden className="text-accent" />
            <h3 className="text-[0.72rem] font-black text-fg">가져오기 호환성 사전검사</h3>
          </div>
          <p id={`${inputId}-help`} className="mt-1 text-[0.61rem] leading-relaxed text-fg-3">
            파일 내용은 업로드하거나 읽지 않고, 파일명·MIME·용량을 감사된 형식 레지스트리와 비교합니다.
          </p>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={onFileDrop}
            className="mt-3 rounded-xl border border-dashed border-line bg-canvas/70 p-3 text-center transition-colors hover:border-accent/50"
          >
            <input
              id={inputId}
              type="file"
              onChange={onFileChange}
              aria-describedby={`${inputId}-help`}
              className="sr-only"
            />
            <label
              htmlFor={inputId}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-card px-3 text-[0.67rem] font-bold text-fg-2 hover:bg-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
            >
              <Upload size={14} aria-hidden /> 파일 선택 또는 놓기
            </label>
            <p className="mt-2 text-[0.58rem] text-fg-3">
              .toonproject.zip · JSON · PSD · ORA · CBZ · WILL 및 변환 필요 형식
            </p>
          </div>
          {report ? <FileReport report={report} onOpenImporter={invokeAction} /> : null}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 size={14} aria-hidden className="text-accent" />
              <h3 className="text-[0.7rem] font-black text-fg">최근 로컬 파일</h3>
            </div>
            <p className="mt-1 text-[0.59rem] text-fg-3">
              파일 내용이 아닌 이름·용량·형식만 이 브라우저에 최대 5개 저장합니다.
            </p>
          </div>
          {recentFiles.length > 0 ? (
            <button
              type="button"
              data-project-center-control="true"
              data-project-keep-open
              onClick={removeRecentFiles}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[0.62rem] font-bold text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Trash2 size={12} aria-hidden /> 기록 지우기
            </button>
          ) : null}
        </div>
        {recentFiles.length > 0 ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recentFiles.map((file) => (
              <li
                key={`${file.name}:${file.inspectedAt}`}
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-raised/70 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.64rem] font-bold text-fg" title={file.name}>
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-[0.56rem] text-fg-3">
                    {formatStudioFileBytes(file.sizeBytes)} · {formatDateTime(file.inspectedAt)}
                  </p>
                </div>
                {file.actionId ? (
                  <button
                    type="button"
                    data-project-center-control="true"
                    data-project-keep-open
                    onClick={() => {
                      if (file.actionId) invokeAction(file.actionId);
                    }}
                    aria-label={`${file.name} 가져오기 선택기 열기`}
                    className="shrink-0 rounded-md border border-line bg-card px-2 py-1.5 text-[0.57rem] font-bold text-fg-2 hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    다시 선택
                  </button>
                ) : (
                  <span className="shrink-0 text-[0.55rem] font-bold text-fg-3">변환 필요</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-raised/70 px-3 py-2.5 text-[0.62rem] text-fg-3">
            <TriangleAlert size={13} aria-hidden /> 아직 검사한 로컬 파일이 없습니다.
          </div>
        )}
      </div>

      {announcement ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-line/70 bg-card px-3 py-2 text-[0.61rem] text-fg-3"
        >
          {announcement}
        </p>
      ) : null}
    </section>
  );
}
