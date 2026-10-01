/**
 * PaintPanel: 브러시 크기·색·불투명도·경도·간격, 레이어(부위) 선택, UV 랩, 페인트 undo·레이어 비우기.
 * 브러시 상태는 paint/paint-session(React 밖 스토어)에 있고 뷰포트 드로잉 포인터가 같은 세션을 쓴다.
 * undo는 history/undo 명령으로 보내며 토큰 적용(session.applyToken → engine.updatePaintTexture)은 셸이 한다.
 */
import { useCallback, useId, useSyncExternalStore } from "react";

import { PAINTABLE_PART_ROLES, PART_ROLE_LABELS_KO, isPartRole } from "../../../contracts";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { useDispatch, useLabState } from "../lab-store-context";

import type { PaintSession, PaintSessionState } from "../../../paint/paint-session";

export interface PaintPanelProps {
  readonly session?: PaintSession;
}

export function usePaintSessionState(session: PaintSession): PaintSessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

interface SliderProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}

function Slider({ id, label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="cl-paint-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output htmlFor={id}>{format(value)}</output>
    </div>
  );
}

export function PaintPanel({ session = getDefaultPaintSession() }: PaintPanelProps) {
  const state = usePaintSessionState(session);
  const labState = useLabState();
  const dispatch = useDispatch();
  const ids = useId();
  const activeLayer = state.layers.get(state.activePart);
  const engineReady = labState.engine.phase === "ready";

  const onUndo = useCallback(() => {
    dispatch({ type: "history/undo" });
  }, [dispatch]);

  const onClear = useCallback(() => {
    const token = session.clearLayer(state.activePart);
    if (token) dispatch({ type: "paint/stroke", undoToken: token });
  }, [dispatch, session, state.activePart]);

  return (
    <section className="cl-paint-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>페인트</h2>
      {!engineReady ? <p className="cl-paint-hint" role="status">엔진이 준비되지 않아 드로잉이 모델에 반영되지 않습니다(레이어에는 기록됩니다).</p> : null}
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-part`}>레이어(부위)</label>
        <select
          id={`${ids}-part`}
          value={state.activePart}
          onChange={(event) => {
            if (isPartRole(event.target.value)) session.setActivePart(event.target.value);
          }}
        >
          {PAINTABLE_PART_ROLES.map((part) => (
            <option key={part} value={part}>
              {PART_ROLE_LABELS_KO[part]}
            </option>
          ))}
        </select>
      </div>
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-color`}>색</label>
        <input id={`${ids}-color`} type="color" value={state.brush.color} onChange={(event) => session.setBrush({ color: event.target.value })} />
      </div>
      <Slider id={`${ids}-radius`} label="크기(px)" value={state.brush.radiusPx} min={1} max={256} step={1} format={(v) => `${Math.round(v)} px`} onChange={(radiusPx) => session.setBrush({ radiusPx })} />
      <Slider id={`${ids}-opacity`} label="불투명도" value={state.brush.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => session.setBrush({ opacity })} />
      <Slider id={`${ids}-hardness`} label="경도" value={state.brush.hardness} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(hardness) => session.setBrush({ hardness })} />
      <Slider id={`${ids}-spacing`} label="간격(반지름 비율)" value={state.brush.spacing} min={0.05} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(spacing) => session.setBrush({ spacing })} />
      <div className="cl-paint-row">
        <label htmlFor={`${ids}-wrap`}>UV 경계 감싸기</label>
        <input id={`${ids}-wrap`} type="checkbox" checked={state.wrap} onChange={(event) => session.setWrap(event.target.checked)} />
      </div>
      <p className="cl-paint-status">
        {PART_ROLE_LABELS_KO[state.activePart]} 레이어 {activeLayer ? `${activeLayer.width}×${activeLayer.height} · 개정 ${activeLayer.revision}` : "(아직 없음)"}
        {state.strokeActive ? " · 스트로크 진행 중" : ""}
      </p>
      <div className="cl-paint-actions">
        <button type="button" onClick={onUndo} disabled={!labState.history.canUndo}>
          되돌리기
        </button>
        <button type="button" onClick={onClear} disabled={!activeLayer}>
          레이어 비우기
        </button>
      </div>
    </section>
  );
}
