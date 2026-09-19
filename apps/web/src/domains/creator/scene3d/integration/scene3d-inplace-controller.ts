import {
  SCENE3D_INPLACE_OPERATIONS,
  Scene3dInplaceError,
} from "./scene3d-inplace-contract";
import type {
  Scene3dInplaceReceipt,
  Scene3dInplaceToolsBridge,
  Scene3dSelectedAssetInput,
} from "./scene3d-inplace-contract";
import type { SpecialistArtifact } from "../specialists/specialist-contract";

export interface Scene3dInplaceSelection {
  readonly entityId: string;
  readonly label: string;
  readonly sourceSha256: string;
  readonly sourceByteLength: number;
  readonly revisionKey: string;
  /** Runtime identities are private session fences, never saved in scene documents. */
  readonly runtimeOwner: object;
  readonly sourceOwner: object;
}
export interface Scene3dInplacePrepared {
  /** May await the existing mutation lane; its canonical commit must recheck and be synchronous. */
  commit(): void | Promise<void>;
  /** Compensation must only touch the exact newly created record, never a reused source. */
  rollback(): Promise<void>;
}
export interface Scene3dInplaceDependencies {
  readSelection(): Scene3dInplaceSelection;
  readSource(
    selection: Scene3dInplaceSelection,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer>;
  prepare(
    selection: Scene3dInplaceSelection,
    artifact: SpecialistArtifact,
    commandId: string,
    assertCurrent: () => void,
    signal?: AbortSignal,
  ): Promise<Scene3dInplacePrepared>;
  digest?(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
}
export async function digestScene3dBytes(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return (
    "sha256:" +
    Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("")
  );
}
const MAX_BYTES = 128 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/;
function equalSelection(
  a: Scene3dInplaceSelection,
  b: Scene3dInplaceSelection,
): boolean {
  return (
    a.entityId === b.entityId &&
    a.sourceSha256 === b.sourceSha256 &&
    a.sourceByteLength === b.sourceByteLength &&
    a.revisionKey === b.revisionKey &&
    a.runtimeOwner === b.runtimeOwner &&
    a.sourceOwner === b.sourceOwner
  );
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new Scene3dInplaceError(
      "cancelled",
      "가공 결과 적용을 취소했습니다. 원본은 유지됩니다.",
    );
}

/** One active source binding; exactly one commit even for duplicate completion/apply events. */
export function createScene3dInplaceController(
  dependencies: Scene3dInplaceDependencies,
): Scene3dInplaceToolsBridge {
  const digest = dependencies.digest ?? digestScene3dBytes;
  let generation = 0;
  let binding: {
    input: Scene3dSelectedAssetInput;
    selection: Scene3dInplaceSelection;
    generation: number;
  } | null = null;
  let applying = false;
  let completed: {
    bindingId: string;
    hash: string;
    receipt: Scene3dInplaceReceipt;
  } | null = null;
  let pending: {
    bindingId: string;
    hash: string;
    promise: Promise<Scene3dInplaceReceipt>;
  } | null = null;
  return {
    describeSelection() {
      try {
        const selected = dependencies.readSelection();
        return {
          available: !applying,
          label: selected.label,
          reason: applying ? "결과를 적용하는 중입니다." : null,
        };
      } catch (error) {
        return {
          available: false,
          label: "",
          reason:
            error instanceof Scene3dInplaceError
              ? error.message
              : "지금은 선택한 모델을 가공할 수 없습니다.",
        };
      }
    },
    async captureSelection(signal) {
      if (applying)
        throw new Scene3dInplaceError(
          "busy",
          "적용 작업이 끝난 뒤 원본을 선택해 주세요.",
        );
      const epoch = ++generation;
      binding = null;
      completed = null;
      aborted(signal);
      const selected = dependencies.readSelection();
      if (
        !HASH.test(selected.sourceSha256) ||
        !Number.isSafeInteger(selected.sourceByteLength) ||
        selected.sourceByteLength < 20 ||
        selected.sourceByteLength > MAX_BYTES
      ) {
        throw new Scene3dInplaceError(
          "unsupported",
          "선택 원본은 검증된 128MiB 이하 GLB여야 합니다.",
        );
      }
      const source = await dependencies.readSource(selected, signal);
      aborted(signal);
      if (
        source.byteLength !== selected.sourceByteLength ||
        (await digest(new Uint8Array(source))) !== selected.sourceSha256
      ) {
        throw new Scene3dInplaceError(
          "invalid-result",
          "원본 바이트와 저장된 해시가 다릅니다. 변경하지 않았습니다.",
        );
      }
      aborted(signal);
      if (
        epoch !== generation ||
        !equalSelection(selected, dependencies.readSelection())
      )
        throw new Scene3dInplaceError(
          "stale",
          "선택 또는 장면이 바뀌었습니다. 원본을 다시 선택해 주세요.",
        );
      const input = Object.freeze({
        bindingId: `scene3d-inplace-${epoch}`,
        entityId: selected.entityId,
        label: selected.label,
        sourceSha256: selected.sourceSha256,
        source,
      });
      binding = { input, selection: selected, generation: epoch };
      return input;
    },
    apply(input, result, artifact, signal) {
      if (
        completed?.bindingId === input.bindingId &&
        completed.hash === artifact.sha256 &&
        binding?.input === input
      )
        return Promise.resolve(completed.receipt);
      if (
        pending?.bindingId === input.bindingId &&
        pending.hash === artifact.sha256 &&
        binding?.input === input
      )
        return pending.promise;
      if (applying)
        return Promise.reject(
          new Scene3dInplaceError(
            "busy",
            "다른 가공 결과를 적용하고 있습니다.",
          ),
        );
      const selectedBinding = binding;
      const assertCurrent = () => {
        aborted(signal);
        if (
          !selectedBinding ||
          binding !== selectedBinding ||
          selectedBinding.input !== input ||
          selectedBinding.generation !== generation ||
          !equalSelection(
            selectedBinding.selection,
            dependencies.readSelection(),
          )
        )
          throw new Scene3dInplaceError(
            "stale",
            "장면·선택·모델이 변경되어 이전 결과를 적용하지 않았습니다. 선택 모델을 다시 불러오세요.",
          );
      };
      try {
        assertCurrent();
        if (
          !SCENE3D_INPLACE_OPERATIONS.some(
            (kind) => kind === result.operation,
          ) ||
          result.sourceSha256 !== input.sourceSha256 ||
          !result.artifacts.includes(artifact) ||
          artifact.mime !== "model/gltf-binary" ||
          !HASH.test(artifact.sha256) ||
          !(artifact.bytes instanceof Uint8Array) ||
          artifact.bytes.length < 20 ||
          artifact.bytes.length > MAX_BYTES ||
          !/^[a-z0-9][a-z0-9.-]{0,80}\.glb$/.test(artifact.name)
        )
          throw new Scene3dInplaceError(
            "unsupported",
            "이 결과는 현재 정적 모델 교체 경로에서 지원하지 않습니다.",
          );
        if (artifact.sha256 === input.sourceSha256)
          throw new Scene3dInplaceError(
            "invalid-result",
            "원본과 동일한 결과입니다. 새 변경을 만들지 않았습니다.",
          );
      } catch (error) {
        return Promise.reject(error);
      }
      // Snapshot before yielding: neither preview code nor stale Worker output can change persisted bytes.
      const owned = Object.freeze({
        ...artifact,
        bytes: new Uint8Array(artifact.bytes),
      });
      const commandId = `scene3d.apply-derivative.${input.bindingId}.${artifact.sha256.slice(-12)}`;
      applying = true;
      const run = async (): Promise<Scene3dInplaceReceipt> => {
        let prepared: Scene3dInplacePrepared | undefined;
        let committed = false;
        try {
          if ((await digest(owned.bytes)) !== owned.sha256)
            throw new Scene3dInplaceError(
              "invalid-result",
              "가공 결과 해시 검증에 실패했습니다. 원본은 유지됩니다.",
            );
          assertCurrent();
          prepared = await dependencies.prepare(
            selectedBinding!.selection,
            owned,
            commandId,
            assertCurrent,
            signal,
          );
          assertCurrent();
          await prepared.commit();
          committed = true;
          const receipt = Object.freeze({
            status: "applied" as const,
            entityId: input.entityId,
            sourceSha256: input.sourceSha256,
            derivativeSha256: owned.sha256,
            commandId,
          });
          completed = {
            bindingId: input.bindingId,
            hash: owned.sha256,
            receipt,
          };
          return receipt;
        } catch (error) {
          if (prepared && !committed) {
            try {
              await prepared.rollback();
            } catch {
              throw new Scene3dInplaceError(
                "persistence",
                "장면은 변경하지 않았지만 임시 파생본 정리를 확인하지 못했습니다. 보관함을 확인해 주세요.",
              );
            }
          }
          throw error;
        } finally {
          applying = false;
          pending = null;
        }
      };
      const promise = run();
      pending = { bindingId: input.bindingId, hash: owned.sha256, promise };
      return promise;
    },
  };
}
