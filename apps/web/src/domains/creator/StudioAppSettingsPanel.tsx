/**
 * Application settings control center.
 *
 * The stable per-category editor remains isolated in StudioAppSettingsEditor. This shell adds
 * search, device/workflow profiles, scoped recovery, portable backup and capability diagnostics
 * without duplicating the SQLite/OPFS-backed settings authority.
 */
import {
  ChevronRight,
  Download,
  FileUp,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_APP_SETTINGS_TABS,
  studioAppSettingsTabLabel,
  type StudioAppSettings,
  type StudioAppSettingsTab,
} from "./studio-app-settings";
import {
  formatStudioAppSettingsCenterText,
  studioAppSettingsCenterProfileCopyKey,
  studioAppSettingsCenterSearchCopyKey,
} from "./studio-app-settings-center-i18n";
import {
  STUDIO_APP_SETTINGS_IMPORT_MAX_BYTES,
  STUDIO_APP_SETTINGS_PROFILES,
  applyStudioAppSettingsProfile,
  countStudioAppSettingsDifferences,
  countStudioAppSettingsTabDifferences,
  detectStudioSettingsEnvironment,
  importStudioAppSettings,
  resetStudioAppSettingsTab,
  searchStudioAppSettings,
  serializeStudioAppSettings,
  type StudioAppSettingsProfileId,
} from "./studio-app-settings-management";
import { runStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioResetApplicationSettingsRequest } from "./studio-destructive-command-catalog";
import {
  StudioAppSettingsPanel as StudioAppSettingsEditor,
  type StudioAppSettingsPanelProps as StudioAppSettingsEditorProps,
} from "./StudioAppSettingsEditor";
import { activateStudioModalSheet } from "./useStudioModalSheet";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type StudioAppSettingsPanelProps = StudioAppSettingsEditorProps;

type Notice = { readonly tone: "success" | "error"; readonly message: string } | null;

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="rounded-2xl border border-line bg-card/35 p-3.5">
      <h3 className="text-xs font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{description}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function createSettingsDownload(raw: string): void {
  if (
    typeof document === "undefined"
    || typeof Blob === "undefined"
    || typeof URL.createObjectURL !== "function"
  ) return;

  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `toonspectrum-settings-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.rel = "noopener";
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function shouldOpenEditorImmediately(initialTab: StudioAppSettingsTab | undefined): boolean {
  // Dedicated launchers (toolbar customization and pressure/accessibility) retain their direct path.
  // The ordinary General entry becomes the searchable settings home.
  return initialTab !== undefined && initialTab !== "general";
}

export function StudioAppSettingsPanel({
  open,
  settings,
  initialTab,
  persistenceState = "saved",
  onClose,
  onChange,
  onResetAll,
  onRetryPersistence,
}: StudioAppSettingsPanelProps): ReactElement | null {
  const t = useT();
  const titleId = useId();
  const importInputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editorTab, setEditorTab] = useState<StudioAppSettingsTab | null>(
    shouldOpenEditorImmediately(initialTab) ? initialTab ?? null : null,
  );
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const changedCount = useMemo(() => countStudioAppSettingsDifferences(settings), [settings]);
  const environment = useMemo(() => detectStudioSettingsEnvironment(), []);
  const searchResults = useMemo(() => searchStudioAppSettings(query), [query]);
  const tx = (key: string, values: Readonly<Record<string, string | number>> = {}): string =>
    formatStudioAppSettingsCenterText(t(key), values);

  const dismissModal = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    setEditorTab(shouldOpenEditorImmediately(initialTab) ? initialTab ?? null : null);
    setQuery("");
    setNotice(null);
  }, [open, initialTab]);

  useLayoutEffect(() => {
    if (!open || editorTab !== null) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    return activateStudioModalSheet({
      dialog,
      document: dialog.ownerDocument,
      onDismiss: dismissModal,
      root: dialog.ownerDocument.body,
    });
  }, [open, editorTab]);

  if (!open) return null;

  if (editorTab !== null) {
    return (
      <StudioAppSettingsEditor
        open
        settings={settings}
        initialTab={editorTab}
        persistenceState={persistenceState}
        onClose={onClose}
        onChange={onChange}
        onResetAll={onResetAll}
        onRetryPersistence={onRetryPersistence}
      />
    );
  }

  if (typeof document === "undefined") return null;

  const applyProfile = (profileId: StudioAppSettingsProfileId): void => {
    onChange(applyStudioAppSettingsProfile(settings, profileId));
    setNotice({
      tone: "success",
      message: tx("studio.settings.center.profileApplied", {
        profile: t(studioAppSettingsCenterProfileCopyKey(profileId, "label")),
      }),
    });
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > STUDIO_APP_SETTINGS_IMPORT_MAX_BYTES) {
      setNotice({
        tone: "error",
        message: t("studio.settings.center.import.error.too-large"),
      });
      return;
    }
    try {
      const result = importStudioAppSettings(await file.text());
      if (!result.ok) {
        setNotice({
          tone: "error",
          message: t(`studio.settings.center.import.error.${result.reason}`),
        });
        return;
      }
      onChange(result.settings);
      setNotice({
        tone: "success",
        message: result.source === "legacy"
          ? t("studio.settings.center.import.legacy")
          : t("studio.settings.center.import.success"),
      });
    } catch {
      setNotice({
        tone: "error",
        message: t("studio.settings.center.import.readFailed"),
      });
    }
  };

  const diagnosticRows = [
    [
      t("studio.settings.center.diagnostics.touchPoints"),
      tx("studio.settings.center.diagnostics.touchPointValue", { count: environment.touchPoints }),
    ],
    [
      t("studio.settings.center.diagnostics.pointerEvents"),
      t(environment.pointerEvents
        ? "studio.settings.center.state.supported"
        : "studio.settings.center.state.limited"),
    ],
    [
      t("studio.settings.center.diagnostics.coarsePointer"),
      t(environment.coarsePointer === null
        ? "studio.settings.center.state.unknown"
        : environment.coarsePointer
          ? "studio.settings.center.state.detected"
          : "studio.settings.center.state.notDetected"),
    ],
    [
      t("studio.settings.center.diagnostics.reducedMotion"),
      t(environment.reducedMotionRequested === null
        ? "studio.settings.center.state.unknown"
        : environment.reducedMotionRequested
          ? "studio.settings.center.state.requested"
          : "studio.settings.center.state.notRequested"),
    ],
    [
      t("studio.settings.center.diagnostics.fileSystem"),
      t(environment.fileSystemAccess
        ? "studio.settings.center.state.supported"
        : "studio.settings.center.state.download"),
    ],
    [
      t("studio.settings.center.diagnostics.persistentStorage"),
      t(environment.persistentStorageApi
        ? "studio.settings.center.state.supported"
        : "studio.settings.center.state.basicStorage"),
    ],
  ] satisfies readonly (readonly [string, string])[];

  const body = (
    <div
      className="fixed inset-0 z-[95] grid place-items-end bg-[oklch(0.08_0.01_70/0.55)] p-0 sm:place-items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="flex max-h-[min(94dvh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl"
      >
        <header className="border-b border-line bg-panel/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Settings2 className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={titleId} className="text-sm font-bold text-fg">
                    {t("studio.settings.center.title")}
                  </h2>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold",
                      changedCount > 0
                        ? "border-accent/25 bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-3",
                    )}
                  >
                    {changedCount > 0
                      ? tx("studio.settings.center.changed", { count: changedCount })
                      : t("studio.settings.center.defaultBadge")}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.68rem] text-fg-3">
                  {t("studio.settings.center.subtitle")}
                </p>
              </div>
            </div>
            <button
              type="button"
              className={cn(
                buttonClass({ size: "sm", variant: "quiet" }),
                "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
              )}
              onClick={onClose}
              aria-label={t("studio.settings.panelCloseAria")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <label className="relative mt-3 block">
            <span className="sr-only">{t("studio.settings.center.searchAria")}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-3"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 100))}
              placeholder={t("studio.settings.center.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-10 pointer-coarse:h-11 pointer-coarse:min-h-11"
            />
          </label>

          {query.trim() ? (
            <div
              className="mt-2 rounded-xl border border-line bg-card/80 p-2"
              role="region"
              aria-label={t("studio.settings.center.searchResultsAria")}
            >
              {searchResults.length > 0 ? (
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((result) => {
                    const resultLabel = t(studioAppSettingsCenterSearchCopyKey(result.id, "label"));
                    const resultDescription = t(
                      studioAppSettingsCenterSearchCopyKey(result.id, "description"),
                    );
                    return (
                      <button
                        key={result.id}
                        type="button"
                        className="flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
                        onClick={() => setEditorTab(result.tab)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-fg">
                            {resultLabel}
                          </span>
                          <span className="block truncate text-[0.64rem] text-fg-3">
                            {studioAppSettingsTabLabel(result.tab, t)} · {resultDescription}
                          </span>
                        </span>
                        <ChevronRight className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="px-2 py-3 text-center text-[0.7rem] text-fg-3">
                  {t("studio.settings.center.searchEmpty")}
                </p>
              )}
            </div>
          ) : null}

          {notice ? (
            <p
              className={cn(
                "mt-2 rounded-lg border px-3 py-2 text-[0.68rem]",
                notice.tone === "error"
                  ? "border-bad/30 bg-bad/5 text-bad"
                  : "border-good/30 bg-good/5 text-good",
              )}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.message}
            </p>
          ) : null}
        </header>

        <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className="rounded-2xl border border-accent/20 bg-accent-soft/45 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent shadow-sm">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-fg">
                  {t("studio.settings.center.quickTitle")}
                </h3>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-fg-2">
                  {t("studio.settings.center.quickDescription")}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {STUDIO_APP_SETTINGS_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="group min-h-32 rounded-2xl border border-line bg-card/55 p-3 text-left transition hover:border-accent/40 hover:bg-accent-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => applyProfile(profile.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-fg">
                      {t(studioAppSettingsCenterProfileCopyKey(profile.id, "label"))}
                    </span>
                    <ChevronRight
                      className="size-3.5 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-1.5 block text-[0.64rem] font-medium text-accent">
                    {t(studioAppSettingsCenterProfileCopyKey(profile.id, "recommendedFor"))}
                  </span>
                  <span className="mt-2 block text-[0.66rem] leading-relaxed text-fg-3">
                    {t(studioAppSettingsCenterProfileCopyKey(profile.id, "description"))}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <Card
            title={t("studio.settings.center.detailsTitle")}
            description={t("studio.settings.center.detailsDescription")}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {STUDIO_APP_SETTINGS_TABS.map((tab) => {
                const changes = countStudioAppSettingsTabDifferences(settings, tab);
                const tabLabel = studioAppSettingsTabLabel(tab, t);
                return (
                  <article key={tab} className="rounded-xl border border-line bg-panel p-2.5">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
                      onClick={() => setEditorTab(tab)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-fg">{tabLabel}</span>
                        <span className="mt-0.5 block text-[0.64rem] text-fg-3">
                          {changes > 0
                            ? tx("studio.settings.center.tabChanged", { count: changes })
                            : t("studio.settings.center.tabDefault")}
                        </span>
                      </span>
                      <ChevronRight className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        buttonClass({ size: "sm", variant: "quiet" }),
                        "mt-1 min-h-11 w-full justify-center text-[0.66rem] sm:min-h-8 pointer-coarse:min-h-11",
                      )}
                      disabled={changes === 0}
                      onClick={() => {
                        onChange(resetStudioAppSettingsTab(settings, tab));
                        setNotice({
                          tone: "success",
                          message: tx("studio.settings.center.tabResetDone", { tab: tabLabel }),
                        });
                      }}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      {t("studio.settings.center.tabReset")}
                    </button>
                  </article>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card
              title={t("studio.settings.center.diagnosticsTitle")}
              description={t("studio.settings.center.diagnosticsDescription")}
            >
              <dl className="grid grid-cols-2 gap-2 text-[0.68rem]">
                {diagnosticRows.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-panel p-2.5">
                    <dt className="text-fg-3">{label}</dt>
                    <dd className="mt-1 font-semibold text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card
              title={t("studio.settings.center.transferTitle")}
              description={t("studio.settings.center.transferDescription")}
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    buttonClass({ size: "sm", variant: "outline" }),
                    "min-h-11 pointer-coarse:min-h-11",
                  )}
                  onClick={() => createSettingsDownload(serializeStudioAppSettings(settings))}
                >
                  <Download className="size-3.5" aria-hidden />
                  {t("studio.settings.center.export")}
                </button>
                <button
                  type="button"
                  className={cn(
                    buttonClass({ size: "sm", variant: "outline" }),
                    "min-h-11 pointer-coarse:min-h-11",
                  )}
                  onClick={() => importInputRef.current?.click()}
                >
                  <FileUp className="size-3.5" aria-hidden />
                  {t("studio.settings.center.import")}
                </button>
                <input
                  ref={importInputRef}
                  id={importInputId}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => void handleImport(event)}
                />
              </div>
              <div className="mt-4 rounded-xl border border-bad/30 bg-bad/5 p-3">
                <p className="text-xs font-semibold text-fg">
                  {t("studio.settings.center.resetTitle")}
                </p>
                <p className="mt-1 text-[0.66rem] text-fg-3">
                  {t("studio.settings.center.resetDescription")}
                </p>
                <button
                  type="button"
                  className={cn(
                    buttonClass({ size: "sm", variant: "quiet" }),
                    "mt-2 min-h-11 text-bad pointer-coarse:min-h-11",
                  )}
                  onClick={() => {
                    void runStudioDestructiveAction({
                      request: studioResetApplicationSettingsRequest(),
                      execute: onResetAll,
                    });
                  }}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t("studio.settings.center.resetAll")}
                </button>
              </div>
            </Card>
          </div>
        </main>

        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {persistenceState === "session-only" ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] leading-snug text-warning"
              >
                <span>{t("studio.settings.other.persistenceSessionWarning")}</span>
                {onRetryPersistence ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg px-2 font-semibold underline decoration-warning/50 underline-offset-2 hover:bg-warning/10 sm:min-h-9 pointer-coarse:min-h-11"
                    onClick={onRetryPersistence}
                  >
                    {t("studio.settings.other.persistenceRetry")}
                  </button>
                ) : null}
              </div>
            ) : persistenceState === "loading" ? (
              <p
                className="text-[0.68rem] text-fg-3"
                data-studio-app-settings-persistence="loading"
              >
                {t("studio.settings.center.persistenceLoading")}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-[0.68rem] text-fg-3">
                <ShieldCheck className="size-3.5 text-good" aria-hidden />
                {t("studio.settings.other.persistenceSaved")}
              </p>
            )}
          </div>
          <button
            type="button"
            className={cn(
              buttonClass({ size: "sm", variant: "outline" }),
              "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
            )}
            onClick={onClose}
          >
            {t("studio.settings.state.save")}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
