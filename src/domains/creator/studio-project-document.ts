import {
  createCanonicalStudioDocumentEnvelope,
  createStudioDocumentMigratorRegistry,
  serializeCanonicalStudioDocumentEnvelope,
  type CanonicalStudioDocumentEnvelope,
  type StudioDocumentDiagnostic,
  type StudioDocumentJsonValue,
  type StudioDocumentMigrationReceipt,
} from "./studio-document-envelope";
import {
  parseStudioProjectFile,
  serializeStudioProjectFile,
  type StudioProjectFile,
} from "./studio-project-file";

export const STUDIO_PROJECT_DOCUMENT_FORMAT_ID =
  "toonspectrum.studio-project" as const;
export const STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE = "project" as const;
export const STUDIO_PROJECT_DOCUMENT_CURRENT_VERSION = 2 as const;

export interface StudioProjectDocumentMetadata {
  readonly documentId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type StudioProjectDocumentLoadResult =
  | {
      readonly source: "legacy-project";
      readonly project: StudioProjectFile;
      readonly envelope: null;
      readonly receipt: null;
    }
  | {
      readonly source: "canonical-envelope";
      readonly project: StudioProjectFile;
      readonly envelope: CanonicalStudioDocumentEnvelope<
        typeof STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE
      >;
      readonly receipt: StudioDocumentMigrationReceipt;
    };

export class StudioProjectDocumentError extends Error {
  readonly diagnostic: StudioDocumentDiagnostic;
  readonly preservedEnvelope?: CanonicalStudioDocumentEnvelope;

  constructor(
    diagnostic: StudioDocumentDiagnostic,
    preservedEnvelope?: CanonicalStudioDocumentEnvelope
  ) {
    super(diagnostic.message);
    this.name = "StudioProjectDocumentError";
    this.diagnostic = diagnostic;
    this.preservedEnvelope = preservedEnvelope;
  }
}

function detachedProjectJson(value: unknown): StudioProjectFile {
  return JSON.parse(serializeStudioProjectFile(value)) as StudioProjectFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStudioDocumentEnvelopeCandidate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Object.hasOwn(value, "format") ||
    Object.hasOwn(value, "document") ||
    Object.hasOwn(value, "payload") ||
    Object.hasOwn(value, "extensions")
  );
}

function decodeProjectDocumentInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("프로젝트 JSON을 해석하지 못했습니다.");
  }
}

const studioProjectDocumentRegistry = createStudioDocumentMigratorRegistry([
  {
    formatId: STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
    payloadType: STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE,
    minimumVersion: 1,
    currentVersion: STUDIO_PROJECT_DOCUMENT_CURRENT_VERSION,
    migrators: [
      {
        id: "studio-project.v1-to-v2",
        fromVersion: 1,
        toVersion: 2,
        migrate: (envelope) => ({
          ...envelope,
          format: {
            ...envelope.format,
            version: 2,
          },
          payload: {
            ...envelope.payload,
            data: detachedProjectJson(envelope.payload.data),
          },
        }),
      },
    ],
  },
]);

export function createStudioProjectDocumentEnvelope(
  value: unknown,
  metadata: StudioProjectDocumentMetadata,
  extensions: Readonly<Record<string, unknown>> = {}
): CanonicalStudioDocumentEnvelope<
  typeof STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE
> {
  return createCanonicalStudioDocumentEnvelope({
    format: {
      id: STUDIO_PROJECT_DOCUMENT_FORMAT_ID,
      version: STUDIO_PROJECT_DOCUMENT_CURRENT_VERSION,
    },
    document: {
      id: metadata.documentId,
      revision: metadata.revision,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    },
    payload: {
      type: STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE,
      data: detachedProjectJson(value) as unknown as StudioDocumentJsonValue,
    },
    extensions,
  });
}

export function serializeStudioProjectDocument(
  value: unknown,
  metadata: StudioProjectDocumentMetadata,
  extensions: Readonly<Record<string, unknown>> = {}
): string {
  return serializeCanonicalStudioDocumentEnvelope(
    createStudioProjectDocumentEnvelope(value, metadata, extensions)
  );
}

/**
 * Loads both the historical raw project JSON and the canonical Studio document envelope.
 *
 * An envelope-like object never falls back to the permissive legacy parser. This prevents a
 * damaged or future envelope from being partially interpreted as a raw project and losing
 * metadata or extensions.
 */
export async function parseStudioProjectDocument(
  value: unknown
): Promise<StudioProjectDocumentLoadResult> {
  const decoded = decodeProjectDocumentInput(value);
  if (!isStudioDocumentEnvelopeCandidate(decoded)) {
    return {
      source: "legacy-project",
      project: parseStudioProjectFile(decoded),
      envelope: null,
      receipt: null,
    };
  }

  const migrated = await studioProjectDocumentRegistry.migrate(decoded);
  if (!migrated.ok) {
    throw new StudioProjectDocumentError(
      migrated.diagnostics[0],
      migrated.preservedEnvelope
    );
  }

  return {
    source: "canonical-envelope",
    project: parseStudioProjectFile(migrated.envelope.payload.data),
    envelope:
      migrated.envelope as CanonicalStudioDocumentEnvelope<
        typeof STUDIO_PROJECT_DOCUMENT_PAYLOAD_TYPE
      >,
    receipt: migrated.receipt,
  };
}
