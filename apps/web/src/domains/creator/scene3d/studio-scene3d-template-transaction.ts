import {
  assertStudioScene3dDocument,
  type StudioScene3dDocumentV1,
} from "./studio-scene3d-document";
import type { StudioScene3dAssetAdmissionResult } from "./studio-scene3d-asset-admission";

export interface StudioScene3dTemplateV1 {
  readonly id: string;
  readonly label: string;
  readonly document: StudioScene3dDocumentV1;
}

export interface StudioScene3dTemplateApplySuccess {
  readonly ok: true;
  readonly templateId: string;
  readonly previousRevision: number;
  readonly nextRevision: number;
  readonly document: StudioScene3dDocumentV1;
}

export interface StudioScene3dTemplateApplyFailure {
  readonly ok: false;
  readonly templateId: string;
  readonly code: "invalid-template" | "asset-not-production" | "asset-admission-missing";
  readonly reasons: readonly string[];
  readonly document: StudioScene3dDocumentV1;
}

export type StudioScene3dTemplateApplyResult =
  | StudioScene3dTemplateApplySuccess
  | StudioScene3dTemplateApplyFailure;

export interface StudioScene3dTemplateApplyOptions {
  readonly now?: string;
  readonly assetAdmissionById: ReadonlyMap<string, StudioScene3dAssetAdmissionResult>;
}

function frozenCloneForCommit(
  current: StudioScene3dDocumentV1,
  template: StudioScene3dDocumentV1,
  now: string,
): StudioScene3dDocumentV1 {
  return Object.freeze({
    ...template,
    documentId: current.documentId,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt: now,
    assets: Object.freeze([...template.assets]),
    entities: Object.freeze([...template.entities]),
    cameras: Object.freeze([...template.cameras]),
    lights: Object.freeze([...template.lights]),
    shots: Object.freeze([...template.shots]),
  });
}

/**
 * Builds an entire next scene before committing it. Runtime loaders may use this plan to preload
 * minimum visible LODs and textures, but they must never mutate `current` while preparation runs.
 */
export function applyStudioScene3dTemplateAtomically(
  current: StudioScene3dDocumentV1,
  template: StudioScene3dTemplateV1,
  options: StudioScene3dTemplateApplyOptions,
): StudioScene3dTemplateApplyResult {
  try {
    assertStudioScene3dDocument(template.document);
  } catch (error) {
    return Object.freeze({
      ok: false,
      templateId: template.id,
      code: "invalid-template",
      reasons: Object.freeze([error instanceof Error ? error.message : "템플릿 문서가 올바르지 않습니다."]),
      document: current,
    });
  }

  const missingAdmissions: string[] = [];
  const rejectedAssets: string[] = [];
  for (const asset of template.document.assets) {
    const admission = options.assetAdmissionById.get(asset.id);
    if (admission === undefined) {
      missingAdmissions.push(asset.id);
      continue;
    }
    if (admission.status !== "production") {
      const reason = admission.blockers[0] ?? admission.warnings[0] ?? "production 승인되지 않았습니다.";
      rejectedAssets.push(`${asset.id}: ${reason}`);
    }
  }

  if (missingAdmissions.length > 0) {
    return Object.freeze({
      ok: false,
      templateId: template.id,
      code: "asset-admission-missing",
      reasons: Object.freeze(missingAdmissions.map((assetId) => `${assetId}: 시각/기술 품질 증거가 없습니다.`)),
      document: current,
    });
  }
  if (rejectedAssets.length > 0) {
    return Object.freeze({
      ok: false,
      templateId: template.id,
      code: "asset-not-production",
      reasons: Object.freeze(rejectedAssets),
      document: current,
    });
  }

  const document = frozenCloneForCommit(
    current,
    template.document,
    options.now ?? new Date().toISOString(),
  );
  assertStudioScene3dDocument(document);
  return Object.freeze({
    ok: true,
    templateId: template.id,
    previousRevision: current.revision,
    nextRevision: document.revision,
    document,
  });
}
