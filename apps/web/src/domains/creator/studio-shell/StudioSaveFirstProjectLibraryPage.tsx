import {
  CheckCircle2,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  HardDrive,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  PERSONAL_CLOUD_PROVIDER_IDS,
  getPersonalCloudAccessToken,
  type PersonalCloudProviderId,
} from "../save-first/personal-cloud-client";
import {
  PersonalCloudUploadError,
  uploadPersonalCloudProjectPackage,
  type PersonalCloudUploadProgress,
} from "../save-first/personal-cloud-upload";
import { STUDIO_EXPORT_PRESETS } from "../save-first/studio-export-presets";
import { buildStudioProjectPackage, saveStudioProjectPackage } from "../save-first/studio-project-package";
import {
  studioSaveSafetySummary,
  type StudioSaveProfile,
} from "../save-first/studio-save-profile";
import { readStudioSubmissions } from "../save-first/studio-submission-store";
import {
  ensureInitialStudioProjectDocument,
  readStudioProjectDocuments,
} from "../studio-project-document-store";
import type { StudioProjectLibraryEntry, StudioProjectStatus } from "../studio-project-library-store";
import { PersonalCloudConnectionPanel } from "./PersonalCloudConnectionPanel";
import { PersonalCloudUploadActions } from "./PersonalCloudUploadActions";
import { StudioQuickStart } from "./StudioQuickStart";
import { usePersonalCloudConnections } from "./usePersonalCloudConnections";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";
import { useStudioSaveProfiles } from "./useStudioSaveProfiles";

type Locale = "ko" | "en";
type LibraryView = "active" | "storage" | "exports" | "publications" | "archived" | "trash";
type InitialLibraryView = "active" | "archived" | "trash";

const VIEW_LABELS: Readonly<Record<LibraryView, Readonly<Record<Locale, string>>>> = {
  active: { ko: "내 작업", en: "My work" },
  storage: { ko: "저장소", en: "Storage" },
  exports: { ko: "내보내기·제출", en: "Export and submit" },
  publications: { ko: "게시 관리", en: "Publishing" },
  archived: { ko: "보관됨", en: "Archived" },
  trash: { ko: "휴지통", en: "Trash" },
};

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function resolveView(value: string | null, initialView?: InitialLibraryView): LibraryView {
  if (value && Object.hasOwn(VIEW_LABELS, value)) return value as LibraryView;
  return initialView ?? "active";
}

function viewHref(view: LibraryView): string {
  return view === "active" ? "/studio" : `/studio?view=${view}`;
}

function dateLabel(value: string | null, locale: Locale): string {
  if (!value || !Number.isFinite(Date.parse(value))) return locale === "ko" ? "아직 없음" : "Not yet";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function distributionLabel(profile: StudioSaveProfile, locale: Locale): string {
  const labels = {
    none: { ko: "미배포", en: "Not distributed" },
    exported: { ko: "내보냄", en: "Exported" },
    submitted: { ko: "외부 제출", en: "Submitted externally" },
    published: { ko: "게시됨", en: "Published" },
  } as const;
  return labels[profile.distributionState][locale];
}

function SaveBadge({ profile, locale }: { readonly profile: StudioSaveProfile; readonly locale: Locale }) {
  const summary = studioSaveSafetySummary(profile);
  const Icon = summary.needsBackup ? CloudOff : CheckCircle2;
  return (
    <span className={cn(
      "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.68rem] font-bold",
      summary.needsBackup
        ? "border-warning/35 bg-warning-soft/20 text-warning"
        : "border-success/35 bg-success-soft/20 text-success",
    )}>
      <Icon size={13} aria-hidden="true" />
      {locale === "ko" ? summary.headline : summary.needsBackup ? "Backup needs attention" : "Backup ready"}
    </span>
  );
}

interface ActiveCloudUpload extends PersonalCloudUploadProgress {
  readonly projectId: string;
  readonly provider: PersonalCloudProviderId;
}

function personalCloudProviderLabel(provider: PersonalCloudProviderId): string {
  if (provider === "google-drive") return "Google Drive";
  if (provider === "dropbox") return "Dropbox";
  return "OneDrive";
}

function uploadFailureMessage(error: unknown, locale: Locale): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }
  return locale === "ko"
    ? "개인 저장소 업로드를 완료하지 못했습니다."
    : "The personal storage upload could not be completed.";
}

export function StudioSaveFirstProjectLibraryPage({
  initialView,
}: {
  readonly initialView?: InitialLibraryView;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const view = resolveView(searchParams.get("view"), initialView);
  const status: StudioProjectStatus | undefined = view === "archived"
    ? "archived"
    : view === "trash"
      ? "trashed"
      : undefined;
  const library = useStudioProjectLibrary(locale, status);
  const profiles = useStudioSaveProfiles();
  const cloud = usePersonalCloudConnections();
  const reloadCloudConnections = cloud.reload;
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [cloudUpload, setCloudUpload] = useState<ActiveCloudUpload | null>(null);

  useEffect(() => {
    const result = searchParams.get("cloud");
    if (result !== "connected" && result !== "error") return;
    const rawProvider = searchParams.get("provider");
    const provider = PERSONAL_CLOUD_PROVIDER_IDS.find((value) => value === rawProvider);
    const label = provider ? personalCloudProviderLabel(provider) : "개인 저장소";
    if (result === "connected") {
      setMessage(locale === "ko"
        ? `${label} 개인 계정을 연결했습니다. 이제 프로젝트를 직접 저장할 수 있습니다.`
        : `${label} is connected. Projects can now be saved directly.`);
      void reloadCloudConnections();
    } else {
      const reason = searchParams.get("cloudError");
      setMessage(locale === "ko"
        ? `${label} 연결을 완료하지 못했습니다.${reason ? ` (${reason})` : ""}`
        : `${label} connection could not be completed.${reason ? ` (${reason})` : ""}`);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("cloud");
    next.delete("provider");
    next.delete("cloudError");
    if (result === "error") next.delete("sync");
    setSearchParams(next, { replace: true });
  }, [locale, reloadCloudConnections, searchParams, setSearchParams]);

  const allProjects = library.state?.projects ?? [];
  const activeProjects = allProjects.filter((project) => project.status === "active");
  const listedProjects = status ? library.projects : activeProjects;
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? listedProjects.filter((project) => (
        project.title.toLocaleLowerCase().includes(normalized)
      ))
      : listedProjects;
  }, [listedProjects, query]);
  const submissions = typeof window === "undefined"
    ? []
    : readStudioSubmissions(window.localStorage).submissions;

  const createPackage = (
    project: StudioProjectLibraryEntry,
    profile: StudioSaveProfile,
  ) => buildStudioProjectPackage({
    project,
    documents: readStudioProjectDocuments(window.localStorage, project.id).documents,
    profile,
    submissions: submissions.filter((submission) => submission.projectId === project.id),
  });
  const savePackage = async (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined" || busyProjectId) return;
    setBusyProjectId(project.id);
    try {
      const profile = profiles.ensure(project.id) ?? profiles.profileFor(project.id);
      const result = createPackage(project, profile);
      const method = await saveStudioProjectPackage(result, window);
      profiles.addProvider(project.id, "local-file");
      const saved = profiles.recordSave(project.id) ?? profile;
      profiles.markSynced(project.id, "local-file:backup", {
        remotePath: result.fileName,
        byteLength: result.blob.size,
        revision: saved.revision,
      });
      setMessage(method === "file-picker"
        ? locale === "ko"
          ? `“${project.title}”을 선택한 파일·동기화 폴더에 저장했습니다.`
          : `Saved “${project.title}” to the selected file or synced folder.`
        : locale === "ko"
          ? `“${project.title}” 프로젝트 파일을 다운로드했습니다.`
          : `Downloaded the “${project.title}” project file.`);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setMessage(locale === "ko"
          ? "프로젝트 파일을 저장하지 못했습니다."
          : "The project file could not be saved.");
      }
    } finally {
      setBusyProjectId(null);
    }
  };
  const connectOrUpload = async (
    project: StudioProjectLibraryEntry,
    provider: PersonalCloudProviderId,
  ) => {
    const connection = cloud.statusFor(provider);
    if (!connection?.configured) {
      setMessage(locale === "ko"
        ? `${personalCloudProviderLabel(provider)} OAuth 서버 설정이 필요합니다.`
        : `${personalCloudProviderLabel(provider)} OAuth server configuration is required.`);
      return;
    }
    if (!connection.connected) {
      await cloud.connect(
        provider,
        `/studio?view=storage&project=${encodeURIComponent(project.id)}&sync=${provider}`,
      );
      return;
    }
    if (typeof window === "undefined" || busyProjectId) return;

    setBusyProjectId(project.id);
    setCloudUpload({
      projectId: project.id,
      provider,
      phase: "preparing",
      uploadedBytes: 0,
      totalBytes: 0,
    });
    const bindingId = `${provider}:backup`;
    try {
      const baseProfile = profiles.ensure(project.id) ?? profiles.profileFor(project.id);
      const prepared = profiles.addProvider(project.id, provider) ?? baseProfile;
      const syncing = profiles.updateBindingStatus(project.id, bindingId, {
        syncState: "syncing",
        connectionRequired: false,
        error: null,
      }) ?? prepared;
      const binding = syncing.bindings.find((entry) => entry.id === bindingId) ?? null;
      const packageResult = createPackage(project, syncing);
      const credential = await getPersonalCloudAccessToken(provider);
      const uploaded = await uploadPersonalCloudProjectPackage(provider, {
        projectId: project.id,
        result: packageResult,
        binding,
        credential,
        onProgress: (progress) => {
          setCloudUpload({ projectId: project.id, provider, ...progress });
        },
      });
      const saved = profiles.recordSave(project.id) ?? syncing;
      profiles.markSynced(project.id, bindingId, {
        remotePath: uploaded.remotePath,
        remoteId: uploaded.remoteId,
        remoteVersion: uploaded.remoteVersion,
        contentHash: uploaded.contentHash,
        remoteModifiedAt: uploaded.modifiedAt,
        webUrl: uploaded.webUrl,
        byteLength: uploaded.byteLength,
        revision: saved.revision,
      });
      setMessage(locale === "ko"
        ? `“${project.title}”을 ${personalCloudProviderLabel(provider)}에 저장했습니다.`
        : `Saved “${project.title}” to ${personalCloudProviderLabel(provider)}.`);
    } catch (cause) {
      const detail = uploadFailureMessage(cause, locale);
      const uploadError = cause instanceof PersonalCloudUploadError ? cause : null;
      const unauthorized = uploadError?.code === "unauthorized";
      profiles.updateBindingStatus(project.id, bindingId, {
        syncState: uploadError?.code === "conflict"
          ? "conflict"
          : unauthorized
            ? "pending"
            : "error",
        connectionRequired: unauthorized,
        error: detail,
      });
      if (unauthorized) void cloud.reload();
      setMessage(detail);
    } finally {
      setCloudUpload(null);
      setBusyProjectId(null);
    }
  };

  const connectOrUploadRef = useRef(connectOrUpload);
  connectOrUploadRef.current = connectOrUpload;
  const handledSyncRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (searchParams.has("cloud") || cloud.loading) return;
    const rawProvider = searchParams.get("sync");
    const provider = PERSONAL_CLOUD_PROVIDER_IDS.find((value) => value === rawProvider);
    const projectId = searchParams.get("project");
    if (!provider || !projectId) return;
    const project = activeProjects.find((entry) => entry.id === projectId);
    if (!project) return;
    const requestKey = `${projectId}:${provider}`;
    if (handledSyncRequestRef.current === requestKey) return;
    handledSyncRequestRef.current = requestKey;
    const next = new URLSearchParams(searchParams);
    next.delete("sync");
    setSearchParams(next, { replace: true });
    void connectOrUploadRef.current(project, provider);
  }, [activeProjects, cloud.loading, searchParams, setSearchParams]);

  const duplicateProject = (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined") return;
    const duplicate = library.duplicate(project.id);
    if (!duplicate) return;
    ensureInitialStudioProjectDocument(window.localStorage, {
      projectId: duplicate.id,
      projectTitle: duplicate.title,
      projectKind: duplicate.kind,
      templateId: duplicate.templateId,
      target: window,
    });
    profiles.ensure(duplicate.id, {
      provider: "browser",
      autoSave: true,
      createVersions: true,
    });
    setMessage(locale === "ko"
      ? `“${project.title}”의 새 비공개 복사본을 만들었습니다.`
      : `Created a new private copy of “${project.title}”.`);
  };

  const navigation: readonly LibraryView[] = [
    "active",
    "storage",
    "exports",
    "publications",
    "archived",
    "trash",
  ];

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-7 sm:py-11">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">TOONSTUDIO SAVE-FIRST</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">{VIEW_LABELS[view][locale]}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2 sm:text-base">
              {locale === "ko"
                ? "작품을 먼저 안전하게 저장하고 원하는 곳에 보관하세요. 내보내기와 공개는 필요할 때만 선택합니다."
                : "Save work safely first and keep it where you choose. Exporting and publishing remain optional."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>{locale === "ko" ? "작품 가져오기" : "Import work"}</Link>
            <Link href="/studio/new" className={buttonClass({ className: "gap-2" })}><Plus size={16} aria-hidden="true" />{locale === "ko" ? "새 비공개 작업" : "New private project"}</Link>
          </div>
        </header>

        <nav className="mt-7 overflow-x-auto" aria-label={locale === "ko" ? "스튜디오 작업 관리" : "Studio work management"}>
          <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
            {navigation.map((candidate) => (
              <Link
                key={candidate}
                href={viewHref(candidate)}
                aria-current={candidate === view ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold",
                  candidate === view ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {VIEW_LABELS[candidate][locale]}
              </Link>
            ))}
          </div>
        </nav>

        {message ? (
          <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/20 px-3 py-2 text-sm font-semibold text-fg">
            <span>{message}</span><button type="button" onClick={() => setMessage(null)} className="text-xs underline">{locale === "ko" ? "닫기" : "Dismiss"}</button>
          </div>
        ) : null}
        {library.error || profiles.error ? <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm font-semibold text-danger">{library.error ?? profiles.error}</p> : null}

        {view === "active" ? <StudioQuickStart locale={locale} /> : null}

        {(view === "active" || view === "archived" || view === "trash") ? (
          <section className="mt-7">
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={16} aria-hidden="true" />
              <span className="sr-only">{locale === "ko" ? "프로젝트 검색" : "Search projects"}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ko" ? "내 작업 검색" : "Search my work"} className="min-h-11 w-full rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-fg outline-none focus:border-accent" />
            </label>
            {filteredProjects.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-line bg-card/60 px-5 py-14 text-center">
                <FolderOpen size={24} className="mx-auto text-fg-3" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-black text-fg">{locale === "ko" ? "표시할 작업이 없습니다" : "No work to show"}</h2>
              </div>
            ) : view === "active" ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredProjects.map((project) => {
                  const profile = profiles.profileFor(project.id);
                  return (
                    <article key={project.id} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[0.68rem] font-black text-accent"><ShieldCheck size={13} aria-hidden="true" />{locale === "ko" ? "나만 보기" : "Owner only"}</span>
                        <SaveBadge profile={profile} locale={locale} />
                      </div>
                      <h2 className="mt-3 truncate text-lg font-black text-fg">{project.title}</h2>
                      <p className="mt-1 text-xs text-fg-3">{locale === "ko" ? "마지막 작업" : "Last opened"} {dateLabel(project.lastOpenedAt, locale)}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-panel/60 p-3 text-[0.68rem]">
                        <div><p className="font-semibold text-fg-3">{locale === "ko" ? "마지막 저장" : "Last save"}</p><p className="mt-1 font-black text-fg">{dateLabel(profile.lastManualSaveAt, locale)}</p></div>
                        <div><p className="font-semibold text-fg-3">{locale === "ko" ? "배포" : "Distribution"}</p><p className="mt-1 font-black text-fg">{distributionLabel(profile, locale)}</p></div>
                      </div>
                      <details className="mt-3 rounded-xl border border-line bg-panel/55">
                        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-black text-fg [&::-webkit-details-marker]:hidden">
                          {locale === "ko" ? "저장 위치 관리" : "Manage storage"}
                        </summary>
                        <div className="border-t border-line p-3">
                          <div className="space-y-2">
                            {profile.bindings.map((binding) => (
                              <div key={binding.id} className="rounded-lg bg-card px-2.5 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[0.7rem] font-bold text-fg-2">
                                      {binding.label}
                                    </p>
                                    <p className="mt-1 text-[0.64rem] text-fg-3">
                                      {binding.lastSyncedAt
                                        ? `${locale === "ko" ? "마지막 저장" : "Last saved"} ${dateLabel(binding.lastSyncedAt, locale)}`
                                        : binding.connectionRequired
                                          ? locale === "ko" ? "계정 연결 필요" : "Account connection required"
                                          : locale === "ko" ? "작업 사본" : "Working copy"}
                                    </p>
                                  </div>
                                  <span className={cn(
                                    "shrink-0 rounded-full px-2 py-1 text-[0.6rem] font-bold",
                                    binding.syncState === "synced"
                                      ? "bg-success-soft/20 text-success"
                                      : binding.syncState === "error" || binding.syncState === "conflict"
                                        ? "bg-danger-soft/20 text-danger"
                                        : "bg-warning-soft/20 text-warning",
                                  )}>
                                    {binding.syncState === "synced"
                                      ? locale === "ko" ? "저장됨" : "Saved"
                                      : binding.syncState === "syncing"
                                        ? locale === "ko" ? "저장 중" : "Saving"
                                        : binding.syncState === "conflict"
                                          ? locale === "ko" ? "충돌" : "Conflict"
                                          : binding.syncState === "error"
                                            ? locale === "ko" ? "오류" : "Error"
                                            : locale === "ko" ? "대기" : "Pending"}
                                  </span>
                                </div>
                                {binding.error ? (
                                  <p className="mt-2 text-[0.64rem] leading-4 text-danger">
                                    {binding.error}
                                  </p>
                                ) : null}
                                {binding.webUrl ? (
                                  <a
                                    href={binding.webUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-[0.65rem] font-bold text-accent"
                                  >
                                    {locale === "ko" ? "원격 파일 열기" : "Open remote file"}
                                    <ExternalLink size={11} aria-hidden="true" />
                                  </a>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 border-t border-line pt-3">
                            <PersonalCloudUploadActions
                              locale={locale}
                              connections={cloud.connections}
                              busyProvider={cloudUpload?.projectId === project.id
                                ? cloudUpload.provider
                                : cloud.busyProvider}
                              progress={cloudUpload?.projectId === project.id ? cloudUpload : null}
                              disabled={Boolean(busyProjectId && busyProjectId !== project.id)}
                              onAction={(provider) => {
                                void connectOrUpload(project, provider);
                              }}
                            />
                          </div>
                          <p className="mt-3 text-[0.64rem] leading-4 text-fg-3">
                            {locale === "ko"
                              ? "WebDAV·S3 직접 연결은 자격 증명 보관 방식을 선택한 뒤 별도 설정에서 제공합니다. 연결되지 않은 저장소를 백업 완료로 표시하지 않습니다."
                              : "WebDAV and S3 direct connections remain in advanced settings. Unconnected storage is never shown as a completed backup."}
                          </p>
                        </div>
                      </details>
                      <div className="mt-4 flex gap-2 border-t border-line pt-3">
                        <Link href={`/studio/p/${encodeURIComponent(project.id)}/overview`} onClick={() => { library.touch(project.id, project.lastOpenedDocumentId); }} className={buttonClass({ size: "sm", className: "flex-1 gap-1.5" })}><FolderOpen size={15} aria-hidden="true" />{locale === "ko" ? "이어서 작업" : "Continue"}</Link>
                        <button type="button" onClick={() => { void savePackage(project); }} disabled={busyProjectId === project.id} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}><Download size={15} aria-hidden="true" />{locale === "ko" ? "저장" : "Save"}</button>
                        <button type="button" onClick={() => duplicateProject(project)} aria-label={locale === "ko" ? "프로젝트 복제" : "Duplicate project"} className={buttonClass({ variant: "quiet", size: "icon" })}><Copy size={15} aria-hidden="true" /></button>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => { library.archive(project.id); }} className="text-[0.68rem] font-semibold text-fg-3 hover:text-fg">{locale === "ko" ? "보관" : "Archive"}</button>
                        <button type="button" onClick={() => { library.trash(project.id); }} className="text-[0.68rem] font-semibold text-danger">{locale === "ko" ? "휴지통" : "Trash"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {filteredProjects.map((project) => (
                  <article key={project.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="font-black text-fg">{project.title}</h2><p className="mt-1 text-xs text-fg-3">{dateLabel(project.updatedAt, locale)}</p></div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { if (view === "archived") library.activate(project.id); else library.restore(project.id); }} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}><RotateCcw size={14} aria-hidden="true" />{locale === "ko" ? "복원" : "Restore"}</button>
                      {view === "trash" ? <button type="button" onClick={() => { if (library.removePermanently(project.id)) profiles.remove(project.id); }} className={buttonClass({ variant: "quiet", size: "sm", className: "text-danger" })}><Trash2 size={14} aria-hidden="true" />{locale === "ko" ? "완전 삭제" : "Delete"}</button> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {view === "storage" ? (
          <div className="mt-7 space-y-5">
            <PersonalCloudConnectionPanel locale={locale} controller={cloud} />
            <section className="rounded-2xl border border-line bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <HardDrive size={18} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-lg font-black text-fg">
                    {locale === "ko" ? "프로젝트 저장 위치" : "Project storage locations"}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {locale === "ko"
                      ? "로컬 파일 백업과 연결한 개인 드라이브 업로드를 프로젝트별로 관리합니다."
                      : "Manage local file backups and connected personal-drive uploads per project."}
                  </p>
                </div>
              </div>

              {activeProjects.length === 0 ? (
                <p className="mt-5 rounded-xl bg-panel/60 px-4 py-6 text-center text-sm text-fg-3">
                  {locale === "ko" ? "저장할 비공개 작업이 없습니다." : "There are no private projects to save."}
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {activeProjects.map((project) => {
                    const profile = profiles.profileFor(project.id);
                    const summary = studioSaveSafetySummary(profile);
                    return (
                      <article key={project.id} className="rounded-xl border border-line bg-panel/45 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-black text-fg">{project.title}</h3>
                            <p className={cn(
                              "mt-1 text-xs font-semibold",
                              summary.needsBackup ? "text-warning" : "text-success",
                            )}>
                              {summary.headline}
                            </p>
                            <p className="mt-1 text-[0.66rem] text-fg-3">
                              {locale === "ko" ? "마지막 수동 저장" : "Last manual save"} {dateLabel(profile.lastManualSaveAt, locale)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { void savePackage(project); }}
                            disabled={busyProjectId === project.id}
                            className={buttonClass({ variant: "outline", size: "sm", className: "gap-2" })}
                          >
                            <FileArchive size={15} aria-hidden="true" />
                            {locale === "ko" ? ".toonstudio 파일 저장" : "Save .toonstudio file"}
                          </button>
                        </div>
                        <div className="mt-4 border-t border-line pt-3">
                          <PersonalCloudUploadActions
                            locale={locale}
                            connections={cloud.connections}
                            busyProvider={cloudUpload?.projectId === project.id
                              ? cloudUpload.provider
                              : cloud.busyProvider}
                            progress={cloudUpload?.projectId === project.id ? cloudUpload : null}
                            disabled={Boolean(busyProjectId && busyProjectId !== project.id)}
                            onAction={(provider) => {
                              void connectOrUpload(project, provider);
                            }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {view === "exports" ? (
          <section className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-line bg-card p-5"><h2 className="text-lg font-black text-fg">{locale === "ko" ? "플랫폼별 내보내기" : "Platform exports"}</h2><div className="mt-4 space-y-3">{STUDIO_EXPORT_PRESETS.map((preset) => <article key={preset.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel/55 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-fg">{preset.labelKo}</h3><p className="mt-1 text-xs text-fg-3">{preset.exactWidth ? `${preset.exactWidth}px` : `max ${preset.maxWidth ?? "—"}px`} · {preset.formats.join("/").toUpperCase()}</p></div>{activeProjects[0] ? <Link href={`/studio/p/${encodeURIComponent(activeProjects[0].id)}/export?preset=${encodeURIComponent(preset.id)}`} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}><Upload size={14} aria-hidden="true" />{locale === "ko" ? "내보내기 열기" : "Open export"}</Link> : null}</article>)}</div></div>
            <div className="rounded-2xl border border-line bg-card p-5"><h2 className="text-lg font-black text-fg">{locale === "ko" ? "외부 제출 기록" : "External submissions"}</h2>{submissions.length === 0 ? <p className="mt-3 text-sm leading-6 text-fg-3">{locale === "ko" ? "아직 제출 기록이 없습니다." : "No submissions yet."}</p> : <div className="mt-3 space-y-2">{submissions.slice().reverse().map((submission) => <article key={submission.id} className="rounded-xl bg-panel/60 p-3"><p className="text-xs font-black text-fg">{submission.platform}</p><p className="mt-1 text-[0.68rem] text-fg-3">{submission.status} · revision {submission.sourceRevision}</p>{submission.externalUrl ? <a href={submission.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent">{locale === "ko" ? "외부 작품 열기" : "Open external work"}<ExternalLink size={12} aria-hidden="true" /></a> : null}</article>)}</div>}</div>
          </section>
        ) : null}

        {view === "publications" ? (
          <section className="mt-7 rounded-2xl border border-line bg-card p-5">
            <div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-panel text-fg-2"><Send size={19} aria-hidden="true" /></span><div><h2 className="text-lg font-black text-fg">{locale === "ko" ? "게시는 선택 사항입니다" : "Publishing is optional"}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">{locale === "ko" ? "저장된 원본과 게시물은 별개입니다. 게시를 중단해도 비공개 원본은 유지됩니다." : "Saved originals and publications are separate. Unpublishing keeps the private original."}</p></div></div>
            <div className="mt-5 space-y-3">{activeProjects.map((project) => { const profile = profiles.profileFor(project.id); return <article key={project.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-fg">{project.title}</h3><p className="mt-1 text-xs text-fg-3">{distributionLabel(profile, locale)} · {profile.accessMode === "public" ? "공개" : "나만 보기"}</p></div><Link href={`/studio/p/${encodeURIComponent(project.id)}/export?intent=publish`} className={buttonClass({ variant: "outline", size: "sm" })}>{locale === "ko" ? "배포 옵션 열기" : "Open distribution options"}</Link></article>; })}</div>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-line pt-5 text-xs leading-5 text-fg-3">
          {locale === "ko" ? "저장, 백업, 내보내기, 외부 제출, ToonSpectrum 게시는 서로 독립적으로 관리됩니다." : "Saving, backup, export, external submission and ToonSpectrum publishing are managed independently."}
        </footer>
      </Container>
    </main>
  );
}
