import {
  createStudioProjectDocument,
  ensureInitialStudioProjectDocument,
  studioProjectDocumentHref,
  type StudioDocumentKind,
  type StudioDocumentWorkspace,
  type StudioProjectDocumentEntry,
  type StudioProjectDocumentStorage,
} from "./studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  permanentlyDeleteStudioProject,
  trashStudioProject,
  type StudioProjectKind,
  type StudioProjectLibraryEntry,
  type StudioProjectLibraryEventTarget,
  type StudioProjectLibraryStorage,
} from "./studio-project-library-store";

export interface StudioProjectCreationStorage
  extends StudioProjectLibraryStorage,
    StudioProjectDocumentStorage {}

export type StudioProjectCreationTarget = StudioProjectLibraryEventTarget;

export interface StudioInitialDocumentInput {
  readonly title?: string;
  readonly kind?: StudioDocumentKind;
  readonly defaultWorkspace?: StudioDocumentWorkspace;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly pageCount?: number;
}

export interface CreateStudioProjectWithDocumentInput {
  readonly title: string;
  readonly kind: StudioProjectKind;
  readonly templateId?: string | null;
  readonly description?: string;
  readonly primaryLocale?: string;
  readonly createdAt?: string;
  readonly document?: StudioInitialDocumentInput;
}

export interface StudioProjectCreationResult {
  readonly project: StudioProjectLibraryEntry;
  readonly document: StudioProjectDocumentEntry;
  readonly href: string;
}

function rollbackProject(
  storage: StudioProjectCreationStorage,
  projectId: string,
  target?: StudioProjectCreationTarget,
): void {
  try {
    trashStudioProject(storage, projectId, { target });
    permanentlyDeleteStudioProject(storage, projectId, { target });
  } catch {
    // A recoverable project entry is safer than hiding a partial creation failure.
  }
}

/**
 * Creates one project and one usable initial document as a single user action.
 * The project entry is rolled back when document initialization fails.
 */
export function createStudioProjectWithInitialDocument(
  storage: StudioProjectCreationStorage,
  input: CreateStudioProjectWithDocumentInput,
  target?: StudioProjectCreationTarget,
): StudioProjectCreationResult {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const project = createStudioProject(storage, {
    title: input.title,
    kind: input.kind,
    templateId: input.templateId,
    description: input.description,
    primaryLocale: input.primaryLocale,
    createdAt,
  }, { target });

  try {
    const document = input.document?.kind
      ? createStudioProjectDocument(storage, project.id, {
        title: input.document.title ?? `${project.title} 작업 문서`,
        kind: input.document.kind,
        defaultWorkspace: input.document.defaultWorkspace,
        width: input.document.width,
        height: input.document.height,
        pageCount: input.document.pageCount,
        createdAt,
      }, { target })
      : ensureInitialStudioProjectDocument(storage, {
        projectId: project.id,
        projectTitle: project.title,
        projectKind: project.kind,
        createdAt,
        target,
      });

    const openedProject = markStudioProjectOpened(
      storage,
      project.id,
      document.id,
      { at: createdAt, target },
    );
    return Object.freeze({
      project: openedProject,
      document,
      href: studioProjectDocumentHref(document),
    });
  } catch (error) {
    rollbackProject(storage, project.id, target);
    throw error;
  }
}
