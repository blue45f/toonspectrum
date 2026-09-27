import { useCallback, useEffect, useRef, useState } from "react";

import { applyCharacterDocumentToHost, characterHostDocumentKey } from "../runtime/character-document-host-runtime";

import type { CharacterDocumentV2 } from "../document/character-document-v2";
import type { CharacterAuthoringAuthorityHookResult } from "./use-character-authoring-authority";
import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

type HostReceipt = {
  readonly owner: CharacterAuthoringAuthorityHookResult["authority"];
  readonly vrm: unknown;
  readonly key: string;
  readonly error: string | null;
  readonly pending: boolean;
};

export function useCharacterDocumentHostRuntime({ h, binding, current, authoring }: {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
  readonly current: CharacterDocumentV2;
  readonly authoring: CharacterAuthoringAuthorityHookResult;
}) {
  const { setRuntimeSyncPending } = authoring;
  const applied = useRef<{ readonly owner: HostReceipt["owner"]; readonly vrm: unknown; readonly request: string } | null>(null);
  const [receipt, setReceipt] = useState<HostReceipt | null>(null);
  const [attempt, setAttempt] = useState(0);
  const target = authoring.snapshot.previewDocument ?? authoring.snapshot.document;
  const unsupported = target.surfacePaint.layers.some((layer) => layer.atlasResourceHash) ? ["외부 텍스처 atlas"] : [];
  const key = characterHostDocumentKey(target);
  const isCurrent = receipt?.owner === authoring.authority && receipt.vrm === h.vrm && receipt.key === key;
  const pending = authoring.hydrated && h.status === "ready" && (!isCurrent || receipt.pending);
  const error = isCurrent ? receipt.error : null;
  useEffect(() => {
    if (!authoring.hydrated || h.status !== "ready" || binding.compareActive || binding.previewEntryId || binding.busyReason) return;
    // 호환 projection effect가 같은 flush에서 authority를 갱신할 수 있다.
    const snapshot = authoring.authority.getSnapshot();
    const nextTarget = snapshot.previewDocument ?? snapshot.document;
    const currentKey = characterHostDocumentKey(nextTarget);
    const request = `${currentKey}/${JSON.stringify([current.recipe, current.colors, current.customControls, current.expression, current.render, h.avatarForgeState])}`;
    if (applied.current?.owner === authoring.authority && applied.current.vrm === h.vrm && applied.current.request === request) return;
    applied.current = { owner: authoring.authority, vrm: h.vrm, request };
    setRuntimeSyncPending("host", true);
    const result = applyCharacterDocumentToHost({ h, binding, current, target: nextTarget });
    setReceipt({ owner: authoring.authority, vrm: h.vrm, key: currentKey, error: result.reason, pending: result.pending });
    if (!result.pending) setRuntimeSyncPending("host", false);
  }, [h, binding, current, authoring, key, attempt, setRuntimeSyncPending]);
  useEffect(() => {
    if (!receipt?.pending) return;
    const timeout = window.setTimeout(() => {
      setReceipt((latest) => latest?.owner === receipt.owner && latest.key === receipt.key && latest.vrm === receipt.vrm
        ? { ...latest, pending: false, error: "캐릭터 런타임이 문서 적용을 확인하지 못했습니다. 모델 상태를 확인한 뒤 다시 시도해 주세요." } : latest);
      setRuntimeSyncPending("host", false);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [receipt?.owner, receipt?.vrm, receipt?.key, receipt?.pending, setRuntimeSyncPending]);
  const retry = useCallback(() => { applied.current = null; setAttempt((value) => value + 1); }, []);
  return { error, retry, pending, unsupported };
}
