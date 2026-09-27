import {
  admitAndCacheStudioBg3dModel,
  attachmentMatchesRecord,
  bindModelAttachment,
  type StudioBg3dModelRootCacheEntry,
} from "../bg3d/studio-bg3d-model-runtime-admission";
import { resolveBg3dModelHashV12 } from "../bg3d/studio-bg3d-model-library-loader";
import { StudioBg3dStaleModalOperationError } from "../bg3d/studio-bg3d-modal-operation-coordinator";
import {
  parseStudioBg3dSceneDocument,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";

type Admission = Parameters<typeof admitAndCacheStudioBg3dModel>[0];

export interface StudioScene3dCutAssetPreparation {
  readonly document: StudioBg3dSceneDocument;
  readonly signal: AbortSignal;
  readonly quality: Admission["quality"];
  readonly renderer: Admission["renderer"];
  readonly cache: Map<string, StudioBg3dModelRootCacheEntry>;
  /** 편집 호스트가 캡처한 modal session identity와 컷 작업 epoch를 함께 확인한다. */
  readonly isCurrent: () => boolean;
  readonly expectedInputRevision: string | number;
  readonly readInputRevision: () => string | number;
  readonly resolveModel?: typeof resolveBg3dModelHashV12;
  readonly admitModel?: typeof admitAndCacheStudioBg3dModel;
}

export interface StudioScene3dPreparedCutAssets {
  readonly attachmentByStorageModelId: Map<string, StudioBg3dModelAttachment>;
  readonly storageModelIdByAttachmentId: Map<string, string>;
  /** hydrate와 문서 검증 뒤, canonical/history를 변경하는 동기 구간에서 한 번 호출한다. */
  commitCache(): void;
  /** commit 전 폐기하면 이 준비 작업에서 생성한 GPU entry만 해제한다. */
  dispose(): void;
}

/** 기존 모델 입장 검증을 재사용하되 준비 중 live binding/document/history를 변경하지 않는다. */
export async function prepareStudioScene3dCutAssets(
  args: StudioScene3dCutAssetPreparation,
): Promise<StudioScene3dPreparedCutAssets> {
  const { signal, isCurrent, readInputRevision, expectedInputRevision } = args;
  const current = () => !signal.aborted && isCurrent() && readInputRevision() === expectedInputRevision;
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (!current()) throw new StudioBg3dStaleModalOperationError();
  };
  assertCurrent();
  const document = parseStudioBg3dSceneDocument(JSON.stringify(args.document));
  if (!document) throw new Error("컷 모델의 장면 원본 또는 저장 예산을 확인할 수 없습니다.");
  const initialCache = new Map(args.cache);
  const stagedCache = new Map<string, StudioBg3dModelRootCacheEntry>();
  // 기존 GPU root는 빌려 쓰되 입장 policy stamp는 준비 단계에서 live entry에 기록하지 않는다.
  for (const [id, entry] of initialCache) stagedCache.set(id, {
    ...entry,
    admittedProfiles: new Set(entry.admittedProfiles),
    ...(entry.admissionPolicyKeys ? { admissionPolicyKeys: new Set(entry.admissionPolicyKeys) } : {}),
  });
  const pending = new Map<string, Promise<StudioBg3dModelRootCacheEntry>>();
  const owned = new Map<string, StudioBg3dModelRootCacheEntry>();
  const preparedIds = new Set<string>();
  const attachmentByStorageModelId = new Map<string, StudioBg3dModelAttachment>();
  const storageModelIdByAttachmentId = new Map<string, string>();
  let state: "prepared" | "committed" | "disposed" = "prepared";
  const dispose = () => {
    if (state !== "prepared") return;
    state = "disposed";
    for (const entry of owned.values()) entry.dispose();
    owned.clear();
    stagedCache.clear();
  };
  try {
    let cumulativeUsedBytes = 0;
    for (const attachment of document.attachments) {
      assertCurrent();
      const resolution = await (args.resolveModel ?? resolveBg3dModelHashV12)(attachment.hash, { signal });
      assertCurrent();
      const record = resolution.record;
      if (!record) throw new Error(`컷 모델 '${attachment.id}'의 원본을 찾지 못했습니다. 원본 파일을 복원한 뒤 다시 시도하세요.`);
      if (!attachmentMatchesRecord(attachment, record)) throw new Error(`컷 모델 '${attachment.id}'의 해시·크기·권한 참조가 저장된 원본과 다릅니다.`);
      await (args.admitModel ?? admitAndCacheStudioBg3dModel)({
        record, document, quality: args.quality, cumulativeUsedBytes,
        renderer: args.renderer, cache: stagedCache, pending, isActive: current, signal,
        onCacheEntryCreated: (id, entry) => { owned.set(id, entry); },
      });
      assertCurrent();
      if (!stagedCache.has(record.id)) throw new Error("컷 모델 준비 결과가 렌더 캐시에 없습니다.");
      if (!bindModelAttachment({ attachmentByStorageModelId, storageModelIdByAttachmentId }, record, attachment)) {
        throw new Error("컷 모델과 원본 첨부의 연결이 충돌했습니다.");
      }
      preparedIds.add(record.id);
      cumulativeUsedBytes += attachment.byteSize;
    }
    assertCurrent();
    return {
      attachmentByStorageModelId,
      storageModelIdByAttachmentId,
      commitCache() {
        if (state !== "prepared") throw new Error("이미 확정하거나 폐기한 컷 모델 준비 결과입니다.");
        try {
          assertCurrent();
          // 다른 작업이 설치/삭제한 cache를 덮어쓰거나 그 작업의 GPU root를 해제하지 않는다.
          for (const id of preparedIds) {
            if (args.cache.get(id) !== initialCache.get(id)) throw new StudioBg3dStaleModalOperationError();
          }
          for (const id of preparedIds) {
            const entry = stagedCache.get(id);
            if (!entry) throw new Error("준비한 컷 모델 캐시가 사라졌습니다.");
            args.cache.set(id, entry);
          }
          state = "committed";
          owned.clear();
        } catch (error) {
          dispose();
          throw error;
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
