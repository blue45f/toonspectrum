import { useEffect } from "react";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { useLab, useLabSelector } from "../shell/lab-context";
import { messageOf } from "../state/run-compare";

import { PresetCard } from "./PresetCard";

import type { GalleryRenderer } from "../../platform/worker-client";
import type { LabActions, LabStore } from "../state/lab-store";

/** 동시에 띄우는 Worker 요청 수. Worker 1개이므로 큐 길이만 제한한다. */
const GALLERY_CONCURRENCY = 2;

/**
 * 모든 프리셋을 같은 fixture·크기로 Worker에 순차 요청한다. 결과는 저장소에 쌓여 탭 전환 후에도 남는다.
 * Worker 실패는 해당 카드의 오류로 남고 다음 프리셋으로 넘어간다(무음 대체 없음).
 */
export async function renderGallery(
  gallery: GalleryRenderer,
  store: LabStore,
  actions: LabActions,
  presetIds: readonly string[],
): Promise<void> {
  const { fixtureId, size } = store.get().gallery;
  actions.setGalleryStatus("running");
  for (const id of presetIds) actions.setGalleryEntry(id, { status: "pending", result: null, error: null });
  const queue = [...presetIds];
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const result = await gallery.render(id, fixtureId, size);
        actions.setGalleryEntry(id, { status: "done", result, error: null });
      } catch (error) {
        actions.setGalleryEntry(id, { status: "error", result: null, error: messageOf(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: GALLERY_CONCURRENCY }, () => worker()));
  actions.setGalleryStatus("done");
}

export function FamilyGallery() {
  const { gallery, galleryError, store, actions } = useLab();
  const state = useLabSelector((s) => s.gallery);
  useEffect(() => {
    if (!gallery || state.status !== "idle") return;
    void renderGallery(gallery, store, actions, PRESET_CATALOG.map((p) => p.id));
  }, [gallery, state.status, store, actions]);

  const entries = Object.values(state.entries);
  const done = entries.filter((e) => e.status === "done").length;
  const failed = entries.filter((e) => e.status === "error").length;
  const open = (presetId: string): void => {
    actions.setPreset(presetId);
    actions.setTab("compare");
  };
  return (
    <div className="lab-tabpanel">
      <div className="lab-button-row">
        <span aria-live="polite">
          {gallery
            ? `${state.status === "idle" ? "대기" : state.status === "running" ? "렌더 중" : "완료"} · ${done}/${PRESET_CATALOG.length} 완료${failed > 0 ? ` · 실패 ${failed}` : ""} · fixture ${state.fixtureId} ${state.size}² · cpu-reference 경로(Worker)`
            : "갤러리 Worker를 만들 수 없다."}
        </span>
        <button
          type="button"
          className="lab-button"
          disabled={!gallery || state.status === "running"}
          onClick={() => actions.resetGallery()}
        >
          다시 렌더
        </button>
      </div>
      {!gallery ? (
        <p className="lab-error-list" role="alert">
          갤러리 렌더러 없음: {galleryError ?? "사유 없음"} (무음 대체 없음 — 메인 스레드로 대체 렌더하지 않는다)
        </p>
      ) : null}
      <div className="lab-gallery" role="list" aria-label="브러시 가족 갤러리">
        {PRESET_CATALOG.map((preset) => (
          <div role="listitem" key={preset.id}>
            <PresetCard preset={preset} entry={state.entries[preset.id]} onOpen={open} />
          </div>
        ))}
      </div>
    </div>
  );
}
