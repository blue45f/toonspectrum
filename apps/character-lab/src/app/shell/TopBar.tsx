/**
 * 상단 바: 엔진 명시 선택 [WebGPU] [WebGL2](자동 선택·자동 전환 없음, ADR-0018), 활성 backend·어댑터 배지,
 * Undo/Redo(Ctrl/Cmd+Z, Shift로 Redo), PBR↔툰 스위치, 품질 프리셋.
 * 엔진 생성에 쓸 캔버스는 viewport-registry에서 `claim()`으로 꺼낸다(백엔드를 바꿔 다시 고르면 새 캔버스, 없으면 fail-visible 실패 이벤트).
 */
import { useEffect } from "react";

import { ENGINE_BACKENDS, ENGINE_BACKEND_LABELS_KO, QUALITY_PRESETS, QUALITY_PRESET_LABELS_KO, applyQualityPreset, failVisible } from "../../contracts";
import { stableStringify } from "../../shared/stable-json";

import { describeEngineStatus } from "./engine-status-text";
import { useDispatch, useEngineSession, useLabState, useLabStore, useViewportRegistry } from "./lab-store-context";

import type { EngineBackend, QualityPresetId, ShadingProfile } from "../../contracts";

const QUALITY_PRESET_IDS: readonly QualityPresetId[] = ["preview", "standard", "hero"];

/** 현재 셰이딩이 어느 품질 프리셋과 같은지(mode·toon 옵션은 비교에서 제외). 어느 것과도 다르면 null. */
export function detectQualityPreset(profile: ShadingProfile): QualityPresetId | null {
  const key = stableStringify({ shadows: profile.shadows, postfx: profile.postfx, ibl: profile.ibl });
  for (const id of QUALITY_PRESET_IDS) {
    const preset = QUALITY_PRESETS[id];
    if (stableStringify({ shadows: preset.shadows, postfx: preset.postfx, ibl: preset.ibl }) === key) return id;
  }
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export function TopBar() {
  const state = useLabState();
  const store = useLabStore();
  const dispatch = useDispatch();
  const engineSession = useEngineSession();
  const viewport = useViewportRegistry();
  const engineText = describeEngineStatus(state.engine);
  const initializing = state.engine.phase === "initializing";
  const activeBackend = state.engine.phase === "ready" ? state.engine.backend : null;
  const shading = state.recipe.shading;
  const quality = detectQualityPreset(shading);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || isEditableTarget(event.target)) return;
      const history = store.getState().history;
      const redo = event.shiftKey;
      if (redo ? !history.canRedo : !history.canUndo) return;
      event.preventDefault();
      dispatch({ type: redo ? "history/redo" : "history/undo" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, store]);

  const selectBackend = (backend: EngineBackend): void => {
    // 컨텍스트(webgpu|webgl2)는 캔버스에 잠기므로 엔진 생성마다 아직 쓰지 않은 캔버스를 받는다.
    const canvas = viewport.claim();
    if (!canvas) {
      store.applyEvent({
        type: "failure",
        failure: failVisible("viewport-canvas-missing", "뷰포트 캔버스를 찾을 수 없어 엔진을 만들 수 없습니다. 뷰포트가 마운트된 뒤 다시 선택하세요."),
      });
      return;
    }
    void engineSession.select(backend, canvas);
  };

  return (
    <header className="cl-topbar">
      <div className="cl-topbar-brand">
        <p className="cl-eyebrow">실험 앱 · 배포 대상 아님</p>
        <h1 className="cl-title">ToonStudio Character Lab</h1>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="엔진 선택">
        {ENGINE_BACKENDS.map((backend) => (
          <button
            key={backend}
            type="button"
            className="cl-button"
            aria-pressed={activeBackend === backend}
            disabled={initializing}
            onClick={() => selectBackend(backend)}
          >
            {ENGINE_BACKEND_LABELS_KO[backend]}
          </button>
        ))}
        <span className="cl-engine-badge" data-tone={engineText.tone} role="status">
          {engineText.text}
        </span>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="히스토리">
        <button type="button" className="cl-button" disabled={!state.history.canUndo} onClick={() => dispatch({ type: "history/undo" })}>
          실행 취소
        </button>
        <button type="button" className="cl-button" disabled={!state.history.canRedo} onClick={() => dispatch({ type: "history/redo" })}>
          다시 실행
        </button>
        <span className="cl-muted">깊이 {state.history.depth} · rev {state.history.revision}</span>
      </div>
      <div className="cl-topbar-group" role="group" aria-label="셰이딩">
        <button
          type="button"
          className="cl-button"
          aria-pressed={shading.mode === "toon"}
          onClick={() => dispatch({ type: "shading/set", profile: { mode: shading.mode === "toon" ? "pbr" : "toon" } })}
        >
          {shading.mode === "toon" ? "툰 셰이딩" : "PBR 셰이딩"}
        </button>
        <label className="cl-select-label">
          품질
          <select
            className="cl-select"
            value={quality ?? "custom"}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "preview" || next === "standard" || next === "hero") {
                dispatch({ type: "shading/set", profile: applyQualityPreset(shading, next) });
              }
            }}
          >
            {QUALITY_PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {QUALITY_PRESET_LABELS_KO[id]}
              </option>
            ))}
            <option value="custom" disabled>
              사용자 지정
            </option>
          </select>
        </label>
      </div>
    </header>
  );
}
