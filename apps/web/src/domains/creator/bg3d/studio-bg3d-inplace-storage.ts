import { Scene3dInplaceError } from "../scene3d/integration/scene3d-inplace-contract";
import { loadStudioBg3dModelLibraryModule } from "./studio-bg3d-model-library-loader";
import {
  admitAndCacheStudioBg3dModel,
  bindModelAttachment,
} from "./studio-bg3d-model-runtime-admission";
import {
  assertStudioBg3dModelAttachmentAdmission,
  calculateStudioBg3dPlacedModelBytes,
} from "./studio-bg3d-model-placement-admission";
import { deriveStudioBg3dSessionGlbValidationPolicy } from "./studio-bg3d-session-glb-policy";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS } from "./studio-bg3d-scene-document";
import type {
  Scene3dInplacePrepared,
  Scene3dInplaceSelection,
} from "../scene3d/integration/scene3d-inplace-controller";
import type { SpecialistArtifact } from "../scene3d/specialists/specialist-contract";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { Bg3dModelAtomicImportDispositionV12 } from "./bg3d-model-library";
import type { StudioBg3dInplaceToolsContext } from "./studio-bg3d-inplace-tools-context";

/** Existing SQLite/OPFS CAS + exact-disposition compensation. No new persistence authority. */
export async function prepareStudioBg3dInplaceDerivative(
  getContext: () => StudioBg3dInplaceToolsContext,
  selected: Scene3dInplaceSelection,
  artifact: SpecialistArtifact,
  commandId: string,
  assertCurrent: () => void,
  signal?: AbortSignal,
): Promise<Scene3dInplacePrepared> {
  assertCurrent();
  const ctx = getContext();
  const session = ctx.session!;
  const originalModel = ctx.live.current.customModels.find(
    ({ id }) => id === selected.entityId,
  )!;
  const originalEntry = ctx.cache.get(originalModel.modelId)!;
  const library = await loadStudioBg3dModelLibraryModule();
  assertCurrent();
  const policy = deriveStudioBg3dSessionGlbValidationPolicy(
    ctx.live.current.document,
    ctx.quality,
  );
  let disposition: Bg3dModelAtomicImportDispositionV12 | undefined;
  let ownedEntry: StudioBg3dModelRootCacheEntry | undefined;
  let committed = false;
  let rolledBack = false;
  const rollback = async () => {
    if (committed || rolledBack) return;
    rolledBack = true;
    // Only the private staging cache is ours. Shared source resources stay alive for Undo/Redo.
    let disposalFailed = false;
    try {
      ownedEntry?.dispose();
    } catch {
      disposalFailed = true;
    }
    // A staged row may have been adopted after a modal/session change. Prefer a retained
    // artifact over deleting bytes referenced by a newer scene or another cache owner.
    if (disposition?.created.length) {
      const current = getContext();
      const adopted = !current.isSessionCurrent(session) || disposition.created.some(({ id }) =>
        current.cache.has(id) || current.attachments.has(id) || current.live.current.customModels.some((model) => model.modelId === id));
      if (adopted) throw new Scene3dInplaceError("persistence", "원본은 유지했습니다. 새 장면이 참조할 수 있는 파생본은 삭제하지 않고 보관함에 남겼습니다.");
    }
    const compensated =
      !disposition ||
      (await library.compensateImportedBg3dModelsIfCreationMatchesV12(
        disposition,
      ));
    if (!compensated)
      throw new Scene3dInplaceError(
        "persistence",
        "원본과 장면은 유지했습니다. 다른 저장 작업이 있어 임시 파생본을 보관함에 남겼습니다.",
      );
    if (disposalFailed)
      throw new Scene3dInplaceError(
        "persistence",
        "원본과 장면은 유지했지만 임시 렌더 자원 해제를 확인하지 못했습니다.",
      );
  };
  try {
    disposition =
      await library.importVerifiedBg3dModelsAtomicallyWithDispositionV12(
        [
          {
            file: new File([artifact.bytes], artifact.name, {
              type: "model/gltf-binary",
            }),
            rights: originalEntry.record.rights,
            expectedSha256: artifact.sha256,
          },
        ],
        {
          executionBackend: "worker",
          profile: policy.profile,
          budgets: policy.budgets,
          signal,
        },
      );
    assertCurrent();
    const record = disposition.records[0];
    if (
      !record ||
      record.contentHash !== artifact.sha256 ||
      record.byteSize !== artifact.bytes.length
    )
      throw new Scene3dInplaceError(
        "invalid-result",
        "저장된 파생본을 검증하지 못했습니다.",
      );
    const attachment =
      ctx.attachments.get(record.id) ??
      library.createStudioBg3dModelAttachment(record);
    const beforeModels = ctx.live.current.customModels;
    const unaffectedModels = beforeModels.filter(
      ({ id }) => id !== selected.entityId,
    );
    const stagedCache = new Map(ctx.cache);
    const entry = await admitAndCacheStudioBg3dModel({
      record,
      document: ctx.live.current.document,
      quality: ctx.quality,
      cumulativeUsedBytes: calculateStudioBg3dPlacedModelBytes(
        unaffectedModels,
        ctx.attachments,
      ),
      renderer: ctx.renderer,
      cache: stagedCache,
      pending: new Map(),
      isActive: () => {
        try {
          assertCurrent();
          return true;
        } catch {
          return false;
        }
      },
      signal,
      onCacheEntryCreated: (_id, value) => {
        ownedEntry = value;
      },
    });
    assertCurrent();
    if (
      entry.metrics.animations ||
      entry.metrics.skins ||
      entry.metrics.morphTargets
    )
      throw new Scene3dInplaceError(
        "unsupported",
        "변형된 리깅 결과는 정적 모델에 적용할 수 없습니다.",
      );
    const beforeScale = originalEntry.root.scale.toArray();
    const afterScale = entry.root.scale.toArray();
    const scale = originalModel.scale.map(
      (value, index) => (value * beforeScale[index]!) / afterScale[index]!,
    ) as [number, number, number];
    if (
      scale.some(
        (value) => !Number.isFinite(value) || value < 0.001 || value > 1000,
      )
    )
      throw new Scene3dInplaceError(
        "unsupported",
        "원래 크기를 보존할 수 없어 모델 교체를 중단했습니다.",
      );
    return {
      rollback,
      async commit() {
        if (committed || rolledBack)
          throw new Scene3dInplaceError("stale", "종료된 적용 작업입니다.");
        const mutation =
          await studioBg3dModalOperationCoordinator.runSceneMutation(
            session,
            async (lease) => {
              lease.throwIfRevoked();
              assertCurrent();
              const persisted = await library.getStoredBg3dModelV12(record.id, {
                signal: lease.signal,
              });
              lease.throwIfRevoked();
              assertCurrent();
              if (
                !persisted ||
                persisted.contentHash !== record.contentHash ||
                persisted.byteSize !== record.byteSize
              )
                throw new Scene3dInplaceError(
                  "persistence",
                  "파생본 저장을 다시 확인하지 못해 장면을 변경하지 않았습니다.",
                );
              return persisted;
            },
            (persisted) => {
              assertCurrent();
              const liveContext = getContext();
              const live = liveContext.live.current;
              if (
                liveContext.cache.has(record.id) &&
                liveContext.cache.get(record.id) !== entry
              )
                throw new Scene3dInplaceError(
                  "stale",
                  "모델 캐시가 갱신되어 이전 결과를 적용하지 않았습니다.",
                );
              const nextAttachments = new Map(liveContext.attachments);
              const nextStorageIds = new Map(liveContext.storageIds);
              if (
                !bindModelAttachment(
                  {
                    attachmentByStorageModelId: nextAttachments,
                    storageModelIdByAttachmentId: nextStorageIds,
                  },
                  persisted,
                  attachment,
                )
              )
                throw new Scene3dInplaceError(
                  "invalid-result",
                  "자산 참조를 연결하지 못했습니다.",
                );
              const models = live.customModels.map((model) =>
                model.id === selected.entityId
                  ? { ...model, modelId: record.id, scale }
                  : model,
              );
              assertStudioBg3dModelAttachmentAdmission({
                models,
                attachments: nextAttachments,
                candidateAttachments: [],
                maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
                maximumCumulativeBytes:
                  live.document.budgets.complexity.maxModelBytes,
              });
              const projection = tryAdaptStudioBg3dRuntimeToDocument({
                primitives: live.primitives,
                customModels: models,
                attachmentByStorageModelId: nextAttachments,
                baseDocument: live.document,
              });
              if (
                !projection.ok ||
                projection.value.diagnostics.length ||
                projection.value.omittedDiagnosticCount ||
                projection.value.counts.droppedPrimitives ||
                projection.value.counts.droppedCustomModels
              ) {
                throw new Scene3dInplaceError(
                  "invalid-result",
                  "저장 가능한 장면으로 변환할 수 없어 결과를 적용하지 않았습니다.",
                );
              }
              const before = createStudioBg3dHistorySnapshot(live);
              // Preflight is complete. The existing synchronous history/state transaction is the sole writer.
              liveContext.commitHistory(
                live.primitives,
                models,
                live.document,
                before,
                {
                  commandId,
                  label: "Apply 3D asset derivative",
                  source: "inspector",
                },
              );
              liveContext.attachments.set(record.id, attachment);
              liveContext.storageIds.set(attachment.id, record.id);
              liveContext.cache.set(record.id, entry);
              liveContext.replace({ customModels: models });
              committed = true;
              // UI notification is not the commit authority and cannot roll back a completed transaction.
              try {
                liveContext.notify();
              } catch {
                /* React will read the committed live snapshot on its next render. */
              }
            },
          );
        if (mutation.status !== "committed")
          throw new Scene3dInplaceError(
            "stale",
            "닫히거나 교체된 장면에 결과를 적용하지 않았습니다.",
          );
      },
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}
