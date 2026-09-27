import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioScene3dCutSession } from "./studio-scene3d-cut-session";
import type { compareStudioScene3dCutSource } from "./studio-scene3d-shot-versions";

const BUTTON =
  "min-h-11 min-w-11 rounded-md border border-line bg-card px-3 py-2 text-xs text-fg hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
export function StudioScene3dCutPanel({
  session,
}: {
  readonly session: StudioScene3dCutSession;
}) {
  const t = useBilingual("scene3d-cut-versions");
  const state = useSyncExternalStore(
    session.subscribe,
    session.read,
    session.read
  );
  const [name, setName] = useState("");
  const [comparison, setComparison] = useState<{
    id: string;
    value: ReturnType<typeof compareStudioScene3dCutSource>;
  } | null>(null);
  const [updateScene, setUpdateScene] = useState(true);
  const [characters, setCharacters] = useState<Set<string>>(new Set());
  const [json, setJson] = useState("");
  const backupUrl = useRef<string | null>(null);
  useEffect(() => {
    if (session.read().phase === "loading") void session.restore();
    return () => {
      session.dispose();
      if (backupUrl.current) URL.revokeObjectURL(backupUrl.current);
    };
  }, [session]);
  const busy = ["loading", "saving", "applying"].includes(state.phase);
  const available = Boolean(state.project) && !busy;
  const cuts = state.project?.shotVersions?.cuts ?? [];
  const selected = cuts.find((cut) => cut.id === state.selectedId);
  const act = (fn: () => void) => session.run(fn);
  const asyncAct = (fn: () => Promise<void>) => {
    void fn().catch((error: unknown) =>
      session.run(() => {
        throw error;
      })
    );
  };
  const compare = () => {
    if (selected)
      act(() => {
        const value = session.compare(selected.id);
        setComparison({ id: selected.id, value });
        setCharacters(new Set());
      });
  };
  return (
    <details
      className="shrink-0 border-b border-line bg-panel text-fg"
      open
      data-testid="scene3d-cut-panel"
    >
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">
        {t("컷 버전 · 원본 고정", "Cut versions · pinned sources")}
      </summary>
      <div className="max-h-[55vh] space-y-3 overflow-auto p-3">
        <p className="text-xs text-fg-2">
          {t(
            "컷마다 장면·모델 포즈·카메라 원본을 보존합니다. 승인한 다른 컷은 자동으로 변경되지 않습니다.",
            "Each cut preserves its scene, model pose and camera. Other approved cuts stay unchanged."
          )}
        </p>
        <div
          role={state.phase === "error" ? "alert" : "status"}
          aria-live="polite"
          className="text-xs"
        >
          {state.notice}
          {state.dirty
            ? ` · ${t("저장하지 않은 변경", "Unsaved changes")}`
            : ""}
        </div>
        {session.host.blockedReason() && (
          <p role="note" className="text-xs text-fg-2">
            {session.host.blockedReason()}
          </p>
        )}
        {!session.repository.supportsAtomicWrites && (
          <p role="note" className="text-xs text-fg-2">
            {t(
              "이 환경은 문서 잠금을 지원하지 않아 로컬 저장을 사용할 수 없습니다. JSON 백업을 사용하세요.",
              "Local saving requires document locks. Use a JSON backup in this environment."
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => asyncAct(() => session.restore())}
          >
            {t("로컬 다시 불러오기", "Reload local project")}
          </button>
          {busy && (
            <button
              type="button"
              className={BUTTON}
              onClick={() => session.cancel()}
            >
              {t("작업 취소", "Cancel operation")}
            </button>
          )}
          <button
            type="button"
            className={BUTTON}
            disabled={!available || !session.repository.supportsAtomicWrites}
            onClick={() => asyncAct(() => session.save())}
          >
            {t("로컬 저장", "Save locally")}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!available || !state.canUndo}
            onClick={() => act(() => session.step("undo"))}
          >
            {t("컷 실행 취소", "Undo cut edit")}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!available || !state.canRedo}
            onClick={() => act(() => session.step("redo"))}
          >
            {t("컷 다시 실행", "Redo cut edit")}
          </button>
        </div>
        <p className="text-xs text-fg-2">
          {t(
            "컷 실행 취소는 컷 목록과 버전 변경을 되돌립니다. 장면 변경은 편집기의 실행 취소를 사용하세요.",
            "Cut undo restores cut lists and versions. Use the editor's undo for scene changes."
          )}
        </p>
        <label className="block text-xs">
          {t("컷 이름", "Cut name")}
          <input
            className="mt-1 min-h-11 w-full rounded border border-line bg-card px-2 text-fg"
            value={name}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={BUTTON}
          disabled={
            !available ||
            Boolean(session.host.blockedReason()) ||
            cuts.length >= 128
          }
          onClick={() =>
            act(() => {
              session.capture(name);
              setName("");
            })
          }
        >
          {t("현재 장면으로 컷 만들기", "Create cut from current scene")}
        </button>
        <ul
          className="flex flex-wrap gap-2"
          aria-label={t("고정한 컷 목록", "Pinned cuts")}
        >
          {cuts.map((cut) => (
            <li key={cut.id}>
              <button
                type="button"
                className={BUTTON}
                aria-pressed={cut.id === state.selectedId}
                disabled={!available}
                onClick={() =>
                  act(() => {
                    session.select(cut.id);
                    setComparison(null);
                    setName(cut.name);
                  })
                }
              >
                {cut.name} ·{" "}
                {cut.status === "approved"
                  ? t("승인", "Approved")
                  : cut.status === "needs-review"
                  ? t("재검토 필요", "Needs review")
                  : t("초안", "Draft")}
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <section
            aria-label={t("선택한 컷 버전", "Selected cut version")}
            className="space-y-2 rounded border border-line p-2"
          >
            <p className="break-all text-xs">
              {selected.name} · {t("컷 버전", "Cut revision")}{" "}
              {selected.revision} · {t("장면 버전", "Scene revision")}{" "}
              {selected.source.scene.revision}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={!available}
                onClick={() => asyncAct(() => session.apply(selected.id))}
              >
                {t("이 컷으로 복귀", "Return to this cut")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={!available}
                onClick={() => act(() => session.savePerformance(selected.id))}
              >
                {t("현재 카메라·포즈 저장", "Save current camera and pose")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={!available}
                onClick={() => act(() => session.duplicate(selected.id))}
              >
                {t("컷 복제", "Duplicate cut")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={!available || !name.trim()}
                onClick={() => act(() => session.rename(selected.id, name))}
              >
                {t("이름 변경", "Rename")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={!available}
                onClick={() => act(() => session.remove(selected.id))}
              >
                {t("컷 삭제", "Delete cut")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={!available}
                onClick={compare}
              >
                {t("현재 원본과 비교", "Compare with current source")}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={
                  !available ||
                  selected.corrections.some(
                    (item) => item.status === "needs-review"
                  )
                }
                onClick={() => act(() => session.approve(selected.id))}
              >
                {t("이 버전 승인", "Approve this version")}
              </button>
            </div>
            <p className="text-xs text-fg-2">
              {t(
                "원고에 넣기 전에 이 컷으로 복귀하면 선택한 원본 버전과 승인 상태가 Linked3D 레이어에 남습니다.",
                "Return to this cut before inserting it to retain the source version and approval in Linked3D."
              )}
            </p>
            {comparison?.id === selected.id && (
              <fieldset className="space-y-2">
                <legend className="text-xs">
                  {t(
                    "변경 비교 및 선택 업데이트",
                    "Compare and selectively update"
                  )}
                </legend>
                <p className="text-xs" role="status">
                  {comparison.value.sceneChanged
                    ? t("장면 원본 변경됨", "Scene source changed")
                    : t("장면 원본 동일", "Scene source unchanged")}{" "}
                  · {t("변경 캐릭터", "Changed characters")}{" "}
                  {comparison.value.changedCharacterIds.length}
                </p>
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={updateScene}
                    onChange={(event) => setUpdateScene(event.target.checked)}
                  />
                  {t(
                    "장면·BG3D 모델 원본 업데이트",
                    "Update scene and BG3D model sources"
                  )}
                </label>
                {comparison.value.changedCharacterIds.map((id) => (
                  <label
                    key={id}
                    className="flex min-h-11 items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={characters.has(id)}
                      onChange={(event) =>
                        setCharacters((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                    />
                    {id}
                  </label>
                ))}
                <button
                  type="button"
                  className={BUTTON}
                  disabled={!available || (!updateScene && !characters.size)}
                  onClick={() =>
                    act(() => {
                      session.update(selected.id, {
                        scene: updateScene,
                        characterIds: [...characters],
                      });
                      setComparison(null);
                    })
                  }
                >
                  {t("선택한 원본만 업데이트", "Update selected sources")}
                </button>
              </fieldset>
            )}
            {selected.corrections.map((correction) => (
              <div key={correction.id} className="text-xs">
                <p>
                  {correction.kind === "screen-space"
                    ? t("화면 좌표 보정", "Screen-space correction")
                    : t("표면 부착 보정", "Surface-attached correction")}{" "}
                  · {correction.elementId} ·{" "}
                  {correction.status === "needs-review"
                    ? t("재검토 필요", "Needs review")
                    : t("검토됨", "Reviewed")}
                </p>
                {correction.status === "needs-review" &&
                  (correction.kind === "screen-space" ? (
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={!available}
                      onClick={() =>
                        act(() =>
                          session.reviewScreen(selected.id, correction.id)
                        )
                      }
                    >
                      {t(
                        "화면 보정 확인 완료",
                        "Confirm screen correction review"
                      )}
                    </button>
                  ) : (
                    <p>
                      {t(
                        "자동 재투영을 지원하지 않습니다. 원본 도구에서 표면을 다시 부착해야 합니다.",
                        "Automatic reprojection is unavailable. Reattach the surface in its source tool."
                      )}
                    </p>
                  ))}
              </div>
            ))}
          </section>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-xs">
            {t("JSON 백업·가져오기", "JSON backup and import")}
          </summary>
          <p className="text-xs text-fg-2">
            {t(
              "모델 파일은 포함하지 않습니다. 같은 모델 원본이 이 기기에 있어야 복원할 수 있습니다.",
              "Model files are not embedded. The same model sources must be available on this device."
            )}
          </p>
          <button
            type="button"
            className={BUTTON}
            disabled={!available}
            onClick={() =>
              act(() => {
                const raw = session.backup();
                setJson(raw);
                if (backupUrl.current) URL.revokeObjectURL(backupUrl.current);
                backupUrl.current = URL.createObjectURL(
                  new Blob([raw], { type: "application/json" })
                );
                const anchor = document.createElement("a");
                anchor.href = backupUrl.current;
                anchor.download = "studio-3d-cuts.json";
                anchor.click();
              })
            }
          >
            {t("JSON 백업 다운로드", "Download JSON backup")}
          </button>
          <label className="block text-xs">
            {t("프로젝트 JSON", "Project JSON")}
            <textarea
              className="min-h-24 w-full rounded border border-line bg-card p-2 text-fg"
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={BUTTON}
            disabled={!available || !json.trim()}
            onClick={() => asyncAct(() => session.importJson(json))}
          >
            {t("JSON 가져오기", "Import JSON")}
          </button>
        </details>
      </div>
    </details>
  );
}
