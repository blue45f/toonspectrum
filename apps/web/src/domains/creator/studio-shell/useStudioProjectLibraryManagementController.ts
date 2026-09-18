import {
  translateBilingualValueForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useSession } from "@/compat/auth-session-store";
import { useI18n } from "@/shared/lib/i18n";

import { removeStudioSaveProfilesBulk } from "../save-first/studio-save-profile-bulk";
import type { StudioSaveProfile } from "../save-first/studio-save-profile";
import {
  chooseStudioProjectPackageSaveTarget,
  studioProjectPackageFileName,
  writeStudioProjectPackageToTarget,
} from "../save-first/studio-project-package";
import { buildStudioProjectPackageWithWorkspace } from "../save-first/studio-project-package-with-workspace";
import { readStudioSubmissions } from "../save-first/studio-submission-store";
import {
  ensureInitialStudioProjectDocument,
  readStudioProjectDocuments,
  studioProjectDocumentStorageKey,
} from "../studio-project-document-store";
import { removeStudioExactResumeContext } from "../studio-exact-resume-context";
import { resolveStudioProjectResumeTarget } from "../studio-project-resume-target";
import {
  activateStudioProjectsBulk,
  archiveStudioProjectsBulk,
  permanentlyDeleteStudioProjectsBulk,
  restoreStudioProjectsBulk,
  trashStudioProjectsBulk,
  type StudioProjectBulkMutationResult,
} from "../studio-project-library-bulk";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import {
  resolveStudioProjectLibraryManagementView,
  sortStudioProjectLibraryProjects,
  studioProjectIsTemporaryWork,
  studioProjectLibraryLocale,
  studioProjectLibrarySearchText,
  type StudioProjectLibrarySortMode,
} from "./studio-project-library-management-model";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";
import { useStudioSaveProfiles } from "./useStudioSaveProfiles";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("useStudioProjectLibraryManagementController", ko, en);

export interface StudioProjectLibraryNoticeState {
  readonly message: string;
  readonly actionLabel?: string;
  readonly action?: () => void;
}

export interface StudioProjectLibraryDeleteRequest {
  readonly ids: readonly string[];
  readonly source: "selected" | "all" | "single";
}

export function useStudioProjectLibraryManagementController() {
  useBilingualI18nRevision();
  const [searchParams] = useSearchParams();
  const { data: session } = useSession();
  const language = useI18n((state) => state.lang);
  const authUserId = session?.user?.id ?? null;
  const locale = studioProjectLibraryLocale(language);
  const view = resolveStudioProjectLibraryManagementView(searchParams.get("view"));
  const status = view === "archived" ? "archived" : view === "trash" ? "trashed" : "active";
  const library = useStudioProjectLibrary(locale, status);
  const profiles = useStudioSaveProfiles();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StudioProjectLibrarySortMode>("recent");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<StudioProjectLibraryNoticeState | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<StudioProjectLibraryEntry | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<StudioProjectLibraryDeleteRequest | null>(null);

  const listedProjects = library.projects;
  const viewCounts = useMemo(() => {
    const projects = library.state?.projects ?? [];
    return {
      active: projects.filter((project) => project.status === "active").length,
      archived: projects.filter((project) => project.status === "archived").length,
      trash: projects.filter((project) => project.status === "trashed").length,
    } as const;
  }, [library.state]);
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized
      ? listedProjects.filter((project) => studioProjectLibrarySearchText(project, locale).includes(normalized))
      : listedProjects;
    return sortStudioProjectLibraryProjects(filtered, sort);
  }, [listedProjects, locale, query, sort]);

  const temporaryProjects = useMemo(() => view === "active"
    ? visibleProjects.filter((project) => studioProjectIsTemporaryWork(profiles.profileFor(project.id)))
    : [], [profiles, view, visibleProjects]);
  const savedProjects = useMemo(() => view === "active"
    ? visibleProjects.filter((project) => !studioProjectIsTemporaryWork(profiles.profileFor(project.id)))
    : visibleProjects, [profiles, view, visibleProjects]);

  const selectedProjects = useMemo(
    () => listedProjects.filter((project) => selectedIds.has(project.id)),
    [listedProjects, selectedIds],
  );
  const allVisibleSelected = visibleProjects.length > 0
    && visibleProjects.every((project) => selectedIds.has(project.id));

  useEffect(() => {
    setSelectedIds(new Set());
  }, [view, query]);

  useEffect(() => {
    if (!saveTarget && !deleteRequest) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSaveTarget(null);
      setDeleteRequest(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteRequest, saveTarget]);

  const setSelection = useCallback((projectId: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  }, []);

  const toggleVisibleSelection = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleProjects.map((project) => project.id)));
  };

  const showBulkResult = (
    result: StudioProjectBulkMutationResult,
    successMessage: string,
    undo?: () => void,
  ) => {
    setSelectedIds(new Set());
    if (result.affectedIds.length === 0) {
      setNotice({
        message: bi("변경할 수 있는 프로젝트가 없습니다.", "There are no eligible projects to change."),
      });
      return;
    }
    setNotice({
      message: successMessage,
      actionLabel: undo ? (bi("실행 취소", "Undo")) : undefined,
      action: undo,
    });
  };

  const archiveProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    const result = archiveStudioProjectsBulk(window.localStorage, ids, { target: window });
    showBulkResult(
      result,
      formatI18nTemplate(String(bi("{value0}개 프로젝트를 보관함으로 옮겼습니다.", "Archived {value0} project(s).")), { value0: result.affectedIds.length }),
      () => {
        const undone = activateStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window });
        setNotice({
          message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 내 작업으로 되돌렸습니다.", "Returned {value0} project(s) to My work.")), { value0: undone.affectedIds.length }),
        });
      },
    );
  };

  const trashProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    const result = trashStudioProjectsBulk(window.localStorage, ids, { target: window });
    showBulkResult(
      result,
      formatI18nTemplate(String(bi("{value0}개 프로젝트를 휴지통으로 옮겼습니다.", "Moved {value0} project(s) to Trash.")), { value0: result.affectedIds.length }),
      () => {
        const undone = restoreStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window });
        setNotice({
          message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 원래 위치로 복구했습니다.", "Restored {value0} project(s) to their previous location.")), { value0: undone.affectedIds.length }),
        });
      },
    );
  };

  const restoreProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    const result = view === "archived"
      ? activateStudioProjectsBulk(window.localStorage, ids, { target: window })
      : restoreStudioProjectsBulk(window.localStorage, ids, { target: window });
    showBulkResult(
      result,
      formatI18nTemplate(String(bi("{value0}개 프로젝트를 복구했습니다.", "Restored {value0} project(s).")), { value0: result.affectedIds.length }),
      () => {
        const undone = view === "archived"
          ? archiveStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window })
          : trashStudioProjectsBulk(window.localStorage, result.affectedIds, { target: window });
        setNotice({
          message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 이전 위치로 되돌렸습니다.", "Moved {value0} project(s) back.")), { value0: undone.affectedIds.length }),
        });
      },
    );
  };

  const permanentlyDeleteProjects = (ids: readonly string[]) => {
    if (typeof window === "undefined") return;
    const result = permanentlyDeleteStudioProjectsBulk(window.localStorage, ids, { target: window });
    if (result.affectedIds.length > 0) {
      removeStudioSaveProfilesBulk(window.localStorage, result.affectedIds, { target: window });
      for (const projectId of result.affectedIds) {
        const documents = readStudioProjectDocuments(window.localStorage, projectId).documents;
        for (const document of documents) {
          removeStudioExactResumeContext(window.localStorage, projectId, document.id);
        }
        window.localStorage.removeItem(studioProjectDocumentStorageKey(projectId));
      }
    }
    setDeleteRequest(null);
    setSelectedIds(new Set());
    setNotice({
      message: formatI18nTemplate(String(bi("{value0}개 프로젝트를 완전히 삭제했습니다.", "Permanently deleted {value0} project(s).")), { value0: result.affectedIds.length }),
    });
  };

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
    setNotice({
      message: formatI18nTemplate(String(bi("“{value0}”의 임시 복사본을 만들었습니다.", "Created a temporary copy of “{value0}”.")), { value0: project.title }),
    });
  };

  const createPackage = async (project: StudioProjectLibraryEntry, profile: StudioSaveProfile) => {
    const submissions = typeof window === "undefined"
      ? []
      : readStudioSubmissions(window.localStorage).submissions;
    const documents = readStudioProjectDocuments(window.localStorage, project.id).documents;
    return (await buildStudioProjectPackageWithWorkspace({
      storage: window.localStorage,
      project,
      documents,
      profile,
      submissions: submissions.filter((submission) => submission.projectId === project.id),
      authUserId,
    })).packageResult;
  };

  const savePackage = async (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined" || busyProjectId) return;
    setBusyProjectId(project.id);
    try {
      const target = await chooseStudioProjectPackageSaveTarget(
        studioProjectPackageFileName(project.title),
        window,
      );
      const profile = profiles.ensure(project.id) ?? profiles.profileFor(project.id);
      const result = await createPackage(project, profile);
      const method = await writeStudioProjectPackageToTarget(result, target);
      profiles.addProvider(project.id, "local-file");
      const saved = profiles.recordSave(project.id) ?? profile;
      profiles.markSynced(project.id, "local-file:backup", {
        remotePath: result.fileName,
        byteLength: result.blob.size,
        revision: saved.revision,
      });
      setSaveTarget(null);
      setNotice({
        message: method === "file-picker"
          ? formatI18nTemplate(String(bi("“{value0}”을 선택한 파일·동기화 폴더에 저장했습니다.", "Saved “{value0}” to the selected file or synced folder.")), { value0: project.title })
          : formatI18nTemplate(String(bi("“{value0}” 프로젝트 파일을 다운로드했습니다.", "Downloaded the “{value0}” project file.")), { value0: project.title }),
      });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setNotice({
          message: bi("프로젝트 파일을 저장하지 못했습니다. 임시 자동저장본은 그대로 유지됩니다.", "The project file could not be saved. The temporary autosave remains intact."),
        });
      }
    } finally {
      setBusyProjectId(null);
    }
  };

  const projectOverviewHref = (project: StudioProjectLibraryEntry) => (
    `/studio/p/${encodeURIComponent(project.id)}/overview`
  );

  const projectResumeTarget = (project: StudioProjectLibraryEntry) => {
    if (typeof window === "undefined") {
      return {
        href: projectOverviewHref(project),
        documentId: project.lastOpenedDocumentId,
        summary: null,
        exact: false,
      };
    }
    return resolveStudioProjectResumeTarget(window.localStorage, project, locale);
  };
  const continueProjectHref = (project: StudioProjectLibraryEntry): string => (
    projectResumeTarget(project).href
  );
  return {
    locale,
    authUserId,
    view,
    library,
    profiles,
    query,
    setQuery,
    sort,
    setSort,
    selectedIds,
    setSelection,
    setSelectedIds,
    notice,
    setNotice,
    busyProjectId,
    saveTarget,
    setSaveTarget,
    deleteRequest,
    setDeleteRequest,
    listedProjects,
    viewCounts,
    visibleProjects,
    temporaryProjects,
    savedProjects,
    selectedProjects,
    allVisibleSelected,
    toggleVisibleSelection,
    archiveProjects,
    trashProjects,
    restoreProjects,
    permanentlyDeleteProjects,
    duplicateProject,
    savePackage,
    projectOverviewHref,
    projectResumeTarget,
    continueProjectHref,
  };
}

export type StudioProjectLibraryManagementController = ReturnType<
  typeof useStudioProjectLibraryManagementController
>;
