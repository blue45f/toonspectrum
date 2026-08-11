import { sanitizeStudioPublishFileStem } from "./studio-publish-package";

import type { StudioEditorMutationTicket } from "./studio-editor-scope";
import type { StudioFilterMaskSurfaceArchiveDependencies } from "./studio-filter-mask-surface-archive";
import type { StudioProjectDocumentSessionProvenance } from "./studio-project-document-session";
import type { StudioProjectFile } from "./studio-project-file";
import type { StudioProjectSnapshot } from "./studio-project-snapshot";
import type { StudioPublicationAnalyticsDocument } from "./studio-publication-analytics";
import type { StudioReleaseSchedule } from "./studio-release-schedule";
import type { StudioReleaseScheduleRuntime } from "./studio-release-schedule-loader";
import type { MutableRefObject } from "react";

const MOBILE_PROJECT_ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 80_000_000,
  maxAttachmentBytes: 32_000_000,
  maxTotalAttachmentBytes: 64_000_000,
  maxProjectBytes: 8_000_000,
});

type StudioProjectArchiveStatus = {
  readonly tone: "good" | "warn" | "bad";
  readonly text: string;
};

function measureStudioProjectArchiveAttachment(
  attachment: { readonly data: Blob | Uint8Array | ArrayBuffer },
): number {
  const { data } = attachment;
  let byteSize: number;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) byteSize = data.byteLength;
  else if (typeof Blob !== "undefined" && data instanceof Blob) byteSize = data.size;
  else throw new Error("portable archive attachment의 byte 크기를 확인할 수 없습니다.");
  if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
    throw new Error("portable archive attachment의 byte 크기가 올바르지 않습니다.");
  }
  return byteSize;
}

function summarizeStudioProjectArchiveAttachments(
  attachments: readonly { readonly data: Blob | Uint8Array | ArrayBuffer }[],
): { readonly bytes: number; readonly count: number } {
  let bytes = 0;
  for (const attachment of attachments) {
    bytes += measureStudioProjectArchiveAttachment(attachment);
    if (!Number.isSafeInteger(bytes)) {
      throw new Error("portable archive attachment byte 합계를 안전하게 계산할 수 없습니다.");
    }
  }
  return Object.freeze({ bytes, count: attachments.length });
}

export interface StudioProjectArchiveOrchestrationInput {
  readonly workId: string | null;
  readonly remixId: string | null;
  readonly currentPageId: string;
  readonly title: string;
  readonly isMobile: boolean;
  readonly projectArchiveBusy: boolean;
  readonly sharedDocumentRevision: number | null;
  readonly projectDocumentSessionScopeKey: string;
  readonly revisionProjectGenerationRef: MutableRefObject<number>;
  readonly projectDocumentSessionRef:
    MutableRefObject<StudioProjectDocumentSessionProvenance | null>;
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly currentStudioProjectSnapshot: () => StudioProjectSnapshot;
  /**
   * Work-scoped raster reader/replay boundary. It is optional only for projects without a surface
   * ref; an archive containing one fails closed until the owning shared document supplies it.
   */
  readonly filterMaskSurfaceArchiveDependencies?:
    StudioFilterMaskSurfaceArchiveDependencies;
  readonly loadStudioReleaseScheduleRuntime:
    () => Promise<StudioReleaseScheduleRuntime>;
  readonly normalizeStudioPublicationAnalyticsDeferred:
    (value: unknown) => Promise<StudioPublicationAnalyticsDocument>;
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly applyStudioProjectSnapshot: (project: StudioProjectFile) => Promise<boolean>;
  readonly applyStudioProjectSnapshotWithPreparedDocuments: (
    project: StudioProjectFile,
    normalizeReleaseSchedule: (value: unknown) => StudioReleaseSchedule,
    publicationAnalytics: StudioPublicationAnalyticsDocument
  ) => boolean;
  readonly setProjectArchiveBusy: (busy: boolean) => void;
  readonly setProjectArchiveStatus: (
    status: StudioProjectArchiveStatus | null
  ) => void;
  readonly setError: (message: string | null) => void;
}

export interface StudioProjectArchiveOrchestration {
  readonly handleExportProject: () => Promise<void>;
  readonly handleExportProjectArchive: () => Promise<void>;
  readonly handleImportProject: (
    file: File,
    mutationTicket: StudioEditorMutationTicket
  ) => Promise<void>;
  readonly handleImportProjectArchive: (
    file: File,
    mutationTicket: StudioEditorMutationTicket
  ) => Promise<void>;
}

/**
 * Project JSON/archive import and export is an explicit user action. Keeping the complete
 * orchestration in this intent-loaded runtime factory leaves the always-hot canvas coordinator
 * focused on editing while retaining the existing lazy module boundaries for codecs and 3D
 * libraries.
 */
export function createStudioProjectArchiveOrchestration({
  workId,
  remixId,
  currentPageId,
  title,
  isMobile,
  projectArchiveBusy,
  sharedDocumentRevision,
  projectDocumentSessionScopeKey,
  revisionProjectGenerationRef,
  projectDocumentSessionRef,
  ensureSharedDocumentAvailableForExport,
  currentStudioProjectSnapshot,
  filterMaskSurfaceArchiveDependencies,
  loadStudioReleaseScheduleRuntime,
  normalizeStudioPublicationAnalyticsDeferred,
  canApplyStudioMutation,
  applyStudioProjectSnapshot,
  applyStudioProjectSnapshotWithPreparedDocuments,
  setProjectArchiveBusy,
  setProjectArchiveStatus,
  setError,
}: StudioProjectArchiveOrchestrationInput): StudioProjectArchiveOrchestration {
  async function handleExportProject() {
    if (!ensureSharedDocumentAvailableForExport()) return;
    try {
      const [
        { createStudioProjectDocumentEnvelope },
        { serializeCanonicalStudioDocumentEnvelope },
        {
          captureStudioProjectDocumentSession,
          planStudioProjectDocumentSessionExport,
        },
        { inspectStudioVrmTexturePaintJsonExport },
      ] = await Promise.all([
        import("./studio-project-document"),
        import("./studio-document-envelope"),
        import("./studio-project-document-session"),
        import("./studio-vrm-texture-paint-project-library"),
      ]);
      const exportedAt = new Date().toISOString();
      const documentId = workId
        ? `work:${workId}`
        : remixId
          ? `remix:${remixId}`
          : `draft:${currentPageId}`;
      const exportGeneration = revisionProjectGenerationRef.current;
      const sessionExport = planStudioProjectDocumentSessionExport({
        session: projectDocumentSessionRef.current,
        scopeKey: projectDocumentSessionScopeKey,
        currentGeneration: exportGeneration,
        exportedAt,
        fallbackMetadata: {
          documentId,
          revision: sharedDocumentRevision ?? 0,
          createdAt: exportedAt,
          updatedAt: exportedAt,
        },
        readCurrentProject: currentStudioProjectSnapshot,
      });
      const texturePaintNotice =
        await inspectStudioVrmTexturePaintJsonExport(sessionExport.project);
      const exportEnvelope = sessionExport.directEnvelope
        ?? createStudioProjectDocumentEnvelope(
          sessionExport.project,
          sessionExport.metadata,
          sessionExport.extensions
        );
      const serialized = serializeCanonicalStudioDocumentEnvelope(exportEnvelope);
      const blob = new Blob([serialized], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.trim() || "toonspectrum-studio-project"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      projectDocumentSessionRef.current = captureStudioProjectDocumentSession(
        exportEnvelope,
        projectDocumentSessionScopeKey,
        exportGeneration
      );
      if (texturePaintNotice) setProjectArchiveStatus(texturePaintNotice);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `프로젝트 JSON 내보내기: ${cause.message} 대용량 원본 자산은 무결성 archive를 이용해 주세요.`
          : "프로젝트 JSON을 만들지 못했습니다. 대용량 원본 자산은 무결성 archive를 이용해 주세요."
      );
    }
  }

  async function handleExportProjectArchive() {
    if (!ensureSharedDocumentAvailableForExport()) return;
    if (projectArchiveBusy) return;
    setProjectArchiveBusy(true);
    setProjectArchiveStatus(null);
    let archiveExportController: AbortController | null = null;
    try {
      archiveExportController = new AbortController();
      const exportGeneration = revisionProjectGenerationRef.current;
      const sourceProject = currentStudioProjectSnapshot();
      const [
        { buildStudioProjectArchiveWithVerifiedBg3dModels },
        { prepareStudioReferenceBoardArchiveExport },
        { prepareStudioVrmProjectArchiveExport },
        {
          prepareStudioVrmTexturePaintProjectArchiveExport,
          presentStudioVrmTexturePaintProjectArchiveExport,
        },
        {
          hasStudioFilterMaskSurfaceArchiveReferences,
          prepareStudioFilterMaskSurfaceArchiveExport,
        },
        {
          hasStudioLinked3dPassProjectArchiveReferences,
          prepareStudioLinked3dPassProjectArchiveExport,
        },
        { acquireStudioLinked3dPassProductAuthority },
        { parseStudioProjectFile },
        { downloadBlob },
      ] = await Promise.all([
        import("./studio-bg3d-project-library"),
        import("./studio-reference-board-archive"),
        import("./studio-vrm-project-library"),
        import("./studio-vrm-texture-paint-project-library"),
        import("./studio-filter-mask-surface-archive"),
        import("./studio-linked-3d-pass-project-archive"),
        import("./studio-linked-3d-pass-product-authority"),
        import("./studio-project-file"),
        import("./studio-export"),
      ]);
      let project: unknown = sourceProject;
      if (hasStudioFilterMaskSurfaceArchiveReferences(sourceProject)) {
        if (!workId || !filterMaskSurfaceArchiveDependencies) {
          throw new Error(
            "공동 작품의 필터 마스크 원본을 확인할 수 없어 portable archive 내보내기를 중단했습니다."
          );
        }
        const filterMaskArchive = await prepareStudioFilterMaskSurfaceArchiveExport({
          project: sourceProject,
          workId,
          generation: exportGeneration,
          signal: archiveExportController.signal,
          limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined,
          isCurrent: ({ workId: guardedWorkId, generation }) => (
            guardedWorkId === workId
            && generation === exportGeneration
            && revisionProjectGenerationRef.current === exportGeneration
          ),
        }, filterMaskSurfaceArchiveDependencies);
        project = filterMaskArchive.project;
      }
      if (revisionProjectGenerationRef.current !== exportGeneration) {
        throw new Error("프로젝트가 변경되어 오래된 archive 내보내기를 취소했습니다.");
      }
      const referenceArchive = await prepareStudioReferenceBoardArchiveExport(project);
      const vrmArchive = await prepareStudioVrmProjectArchiveExport(project);
      const texturePaintAttachments =
        await prepareStudioVrmTexturePaintProjectArchiveExport({
          project,
          canonicalProject: project,
          limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined,
        });
      const preparedAttachments = [
        ...referenceArchive.attachments,
        ...vrmArchive.attachments,
        ...texturePaintAttachments,
      ];
      const consumedAttachmentBudget = summarizeStudioProjectArchiveAttachments(
        preparedAttachments,
      );
      const linked3dProject = parseStudioProjectFile(project);
      const linked3dPassAttachments = hasStudioLinked3dPassProjectArchiveReferences(linked3dProject)
        ? await prepareStudioLinked3dPassProjectArchiveExport({
            project: linked3dProject,
            authority: await acquireStudioLinked3dPassProductAuthority(),
            limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined,
            consumedAttachmentBytes: consumedAttachmentBudget.bytes,
            consumedAttachmentCount: consumedAttachmentBudget.count,
            signal: archiveExportController.signal,
            isCurrent: () => revisionProjectGenerationRef.current === exportGeneration,
          })
        : [];
      const result = await buildStudioProjectArchiveWithVerifiedBg3dModels({
        project: linked3dProject,
        attachments: [
          ...referenceArchive.attachments,
          ...vrmArchive.attachments,
          ...texturePaintAttachments,
          ...linked3dPassAttachments,
        ],
      }, {
        limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined,
      });
      if (revisionProjectGenerationRef.current !== exportGeneration) {
        throw new Error("프로젝트가 변경되어 오래된 archive 다운로드를 취소했습니다.");
      }
      const warningCount = result.diagnostics.filter(
        (item) => item.severity === "warning"
      ).length;
      const fileName = `${sanitizeStudioPublishFileStem(title, {
        fallback: "toonspectrum-studio-project",
      })}.toonproject.zip`;
      downloadBlob(result.blob, fileName);
      setProjectArchiveStatus(
        presentStudioVrmTexturePaintProjectArchiveExport({
          isSelfContained: result.isSelfContained,
          attachmentCount: result.manifest.attachments.length,
          warningCount,
          missingReferenceCount: referenceArchive.missing.length,
          missingVrmCount: vrmArchive.missing.length,
        })
      );
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "프로젝트 archive를 만들지 못했어요.";
      setProjectArchiveStatus({ tone: "bad", text: message });
      setError(message);
    } finally {
      archiveExportController?.abort();
      setProjectArchiveBusy(false);
    }
  }

  async function handleImportProject(
    file: File,
    mutationTicket: StudioEditorMutationTicket
  ) {
    try {
      if (!canApplyStudioMutation(mutationTicket)) return;
      const text = await file.text();
      const [
        { parseStudioProjectDocument },
        { captureStudioProjectDocumentSession },
        { auditStudioVrmTexturePaintJsonImport },
        { hasStudioLinked3dPassProjectArchiveReferences },
      ] = await Promise.all([
        import("./studio-project-document"),
        import("./studio-project-document-session"),
        import("./studio-vrm-texture-paint-project-library"),
        import("./studio-linked-3d-pass-project-archive"),
      ]);
      if (!canApplyStudioMutation(mutationTicket)) return;
      const loaded = await parseStudioProjectDocument(text);
      if (!canApplyStudioMutation(mutationTicket)) return;
      if (hasStudioLinked3dPassProjectArchiveReferences(loaded.project)) {
        throw new Error(
          "연결형 3D pass가 있는 프로젝트 JSON은 PNG 바이트를 포함하지 않아요. self-contained .toonproject.zip archive로 불러와 주세요.",
        );
      }
      const texturePaintPresentation =
        await auditStudioVrmTexturePaintJsonImport(loaded.project);
      if (!canApplyStudioMutation(mutationTicket)) return;
      if (!(await applyStudioProjectSnapshot(loaded.project))) return;
      projectDocumentSessionRef.current =
        loaded.source === "canonical-envelope"
          ? captureStudioProjectDocumentSession(
              loaded.envelope,
              projectDocumentSessionScopeKey,
              revisionProjectGenerationRef.current
            )
          : null;
      const migrated =
        loaded.source === "canonical-envelope" && loaded.receipt.migrated;
      if (texturePaintPresentation.notice) {
        setProjectArchiveStatus(texturePaintPresentation.notice);
      }
      globalThis.alert(
        `${migrated
          ? "이전 버전 프로젝트를 안전하게 변환해 불러왔습니다."
          : "프로젝트 불러오기가 완료되었습니다."}${texturePaintPresentation.alertSuffix}`
      );
    } catch (error) {
      globalThis.alert(
        error instanceof Error
          ? error.message
          : "프로젝트 파일을 읽는 도중 오류가 발생했습니다."
      );
    }
  }

  async function handleImportProjectArchive(
    file: File,
    mutationTicket: StudioEditorMutationTicket
  ) {
    if (projectArchiveBusy) return;
    setProjectArchiveBusy(true);
    setProjectArchiveStatus(null);
    try {
      const [
        { importStudioProjectArchive },
        { installStudioBg3dProjectArchiveModelsAndApply },
        { restoreStudioReferenceBoardArchiveImport },
        { restoreStudioVrmProjectArchiveImport },
        {
          importStudioVrmTexturePaintProjectLibrary,
          presentStudioVrmTexturePaintProjectArchiveImport,
        },
        {
          hasStudioLinked3dPassProjectArchiveReferences,
          restoreStudioLinked3dPassProjectArchiveImport,
        },
        { acquireStudioLinked3dPassProductAuthority },
        { normalizeStudioReleaseSchedule },
      ] = await Promise.all([
        import("./studio-project-archive"),
        import("./studio-bg3d-project-library"),
        import("./studio-reference-board-archive"),
        import("./studio-vrm-project-library"),
        import("./studio-vrm-texture-paint-project-library"),
        import("./studio-linked-3d-pass-project-archive"),
        import("./studio-linked-3d-pass-product-authority"),
        loadStudioReleaseScheduleRuntime(),
      ]);
      const result = await importStudioProjectArchive(file, {
        rehydrateDataUrls: true,
        limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined,
      });
      if (!canApplyStudioMutation(mutationTicket)) return;
      const restoredReferences = await restoreStudioReferenceBoardArchiveImport(result);
      const restoredResult = {
        ...result,
        project: restoredReferences.project,
        canonicalProject: restoredReferences.canonicalProject,
      };
      const restoredVrmModels = await restoreStudioVrmProjectArchiveImport(restoredResult);
      if (!canApplyStudioMutation(mutationTicket)) return;
      const restoredTexturePaint = await importStudioVrmTexturePaintProjectLibrary({
        project: restoredVrmModels.project,
        canonicalProject: restoredVrmModels.canonicalProject,
        manifest: result.manifest,
        attachments: result.attachments,
      });
      if (!canApplyStudioMutation(mutationTicket)) return;
      const portableResult = {
        ...restoredResult,
        project: restoredVrmModels.project,
        canonicalProject: restoredVrmModels.canonicalProject,
      };
      const publicationAnalyticsDocument =
        await normalizeStudioPublicationAnalyticsDeferred(
          portableResult.project.publicationAnalytics
        );
      if (!canApplyStudioMutation(mutationTicket)) return;
      let projectApplied = false;
      const installAndApply = async (project: StudioProjectFile) => {
        const importedForApply = { ...portableResult, project };
        const installed = await installStudioBg3dProjectArchiveModelsAndApply(
          importedForApply,
          (preparedProject) => {
          if (!canApplyStudioMutation(mutationTicket)) return;
          projectApplied = applyStudioProjectSnapshotWithPreparedDocuments(
            preparedProject,
            normalizeStudioReleaseSchedule,
            publicationAnalyticsDocument
          );
          return projectApplied;
        },
        {
          limits: isMobile ? MOBILE_PROJECT_ARCHIVE_LIMITS : undefined,
          verification: { profile: isMobile ? "mobile" : "desktop" },
        }
        );
        return installed.applyResult ? installed : false;
      };
      const installed = hasStudioLinked3dPassProjectArchiveReferences(portableResult.project)
        ? await restoreStudioLinked3dPassProjectArchiveImport({
            archive: {
              project: portableResult.project,
              attachments: result.attachments,
            },
            authority: await acquireStudioLinked3dPassProductAuthority(),
            apply: installAndApply,
          })
        : await installAndApply(portableResult.project);
      if (!projectApplied || installed === false) return;
      const warningCount = result.diagnostics.filter(
        (item) => item.severity === "warning"
      ).length;
      const texturePaintArchivePresentation =
        presentStudioVrmTexturePaintProjectArchiveImport({
          isSelfContained: result.isSelfContained,
          attachmentCount: result.attachments.size,
          warningCount,
          referenceInstalled: restoredReferences.installed.length,
          referenceReused: restoredReferences.reused.length,
          referenceUnresolved: restoredReferences.unresolved.length,
          vrmInstalled: restoredVrmModels.installed.length,
          vrmReused: restoredVrmModels.reused.length,
          vrmUnresolved: restoredVrmModels.unresolved.length,
          background3dInstalled: installed.records.length,
          texturePaint: restoredTexturePaint,
        });
      setProjectArchiveStatus(texturePaintArchivePresentation.notice);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "프로젝트 archive를 읽지 못했어요.";
      setProjectArchiveStatus({ tone: "bad", text: message });
      setError(message);
    } finally {
      setProjectArchiveBusy(false);
    }
  }

  return {
    handleExportProject,
    handleExportProjectArchive,
    handleImportProject,
    handleImportProjectArchive,
  };
}
