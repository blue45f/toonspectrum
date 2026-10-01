/**
 * PhysicsPanel(outfit-physics): provider 라디오(builtin-pbd/rapier/havok) → `physics/set-provider` dispatch 1회,
 * provider 상태(active 버전·결정성 / unavailable 사유), settle 스텝 입력·실행(`engine.settle(steps)`),
 * 미리보기 재생(프레임마다 `engine.settle(1)` = 1스텝 진행).
 *
 * - 엔진이 없으면 settle·재생 버튼을 비활성화하고 사유를 보여준다(무음 대체 금지).
 * - 프레임 스케줄러는 주입 가능(`schedule`)하며 기본은 requestAnimationFrame이다. rAF가 없는 환경은 재생 불가 사유를 표시한다.
 * - 스타일 접두 `cl-physics-`(app/styles/character-lab.css, core 소유).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { PHYSICS_PROVIDER_IDS, PHYSICS_PROVIDER_LABELS_KO, SETTLE_DEFAULTS, isPhysicsProviderId } from "../../../contracts";
import { PHYSICS_PROVIDER_CATALOG } from "../../../domains/physics/provider-factory";
import { useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import type { PhysicsProviderId, PhysicsStatus, SettleReceipt } from "../../../contracts";
import type { PhysicsProviderDescriptor } from "../../../domains/physics/provider-factory";

/** 프레임마다 tick을 호출하는 스케줄러. 돌려주는 함수가 중지한다. */
export type FrameScheduler = (tick: () => void) => () => void;

const RAF_AVAILABLE = typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function";

const rafScheduler: FrameScheduler = (tick) => {
  let active = true;
  let handle = 0;
  const loop = (): void => {
    if (!active) return;
    tick();
    handle = requestAnimationFrame(loop);
  };
  handle = requestAnimationFrame(loop);
  return () => {
    active = false;
    cancelAnimationFrame(handle);
  };
};

export interface PhysicsPanelProps {
  /** 미리보기 재생 스케줄러(테스트 주입용). 기본 requestAnimationFrame */
  readonly schedule?: FrameScheduler;
}

const ROLE_LABELS_KO: Readonly<Record<PhysicsProviderDescriptor["role"], string>> = {
  primary: "1급(헤어·의상)",
  auxiliary: "보조(소품·접지)",
  unavailable: "미설치",
};

export function describePhysicsStatus(status: PhysicsStatus | null): { readonly text: string; readonly tone: "busy" | "ok" | "error" } {
  if (!status) return { text: "상태 없음: 엔진이 아직 물리 provider를 초기화하지 않았습니다.", tone: "busy" };
  if (status.status === "active") {
    return { text: `활성 · ${PHYSICS_PROVIDER_LABELS_KO[status.id]} · ${status.versionLabel} · ${status.deterministic ? "결정적" : "비결정적"}`, tone: "ok" };
  }
  return { text: `사용 불가(${PHYSICS_PROVIDER_LABELS_KO[status.id]}): ${status.reasonKo}`, tone: "error" };
}

function clampSteps(value: number): number {
  if (!Number.isFinite(value)) return SETTLE_DEFAULTS.defaultSteps;
  return Math.min(SETTLE_DEFAULTS.maxSteps, Math.max(0, Math.floor(value)));
}

export function PhysicsPanel({ schedule = rafScheduler }: PhysicsPanelProps) {
  const state = useLabState();
  const dispatch = useDispatch();
  const session = useEngineSession();
  const ids = useId();
  const [steps, setSteps] = useState<number>(SETTLE_DEFAULTS.defaultSteps);
  const [receipt, setReceipt] = useState<SettleReceipt | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewSteps, setPreviewSteps] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const selected: PhysicsProviderId = state.recipe.physics.provider;
  const status = describePhysicsStatus(state.physics);
  const engineReady = state.engine.phase === "ready" && session.engine() !== null;
  const canPreview = schedule !== rafScheduler || RAF_AVAILABLE;

  const onSelect = useCallback(
    (provider: string) => {
      if (!isPhysicsProviderId(provider) || provider === selected) return;
      dispatch({ type: "physics/set-provider", provider });
    },
    [dispatch, selected],
  );

  const onSettle = useCallback(async () => {
    const engine = session.engine();
    if (!engine) {
      setSettleError("엔진이 준비되지 않아 정착을 실행할 수 없습니다.");
      return;
    }
    setBusy(true);
    setSettleError(null);
    try {
      setReceipt(await engine.settle(clampSteps(steps)));
    } catch (error) {
      setReceipt(null);
      setSettleError(`정착 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [session, steps]);

  useEffect(() => {
    if (!playing) return undefined;
    const engine = session.engine();
    if (!engine) {
      setPreviewError("엔진이 준비되지 않아 미리보기를 재생할 수 없습니다.");
      setPlaying(false);
      return undefined;
    }
    const stop = schedule(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      engine
        .settle(1)
        .then(() => {
          setPreviewSteps((n) => n + 1);
        })
        .catch((error: unknown) => {
          setPreviewError(`미리보기 실패: ${error instanceof Error ? error.message : String(error)}`);
          setPlaying(false);
        })
        .finally(() => {
          inFlight.current = false;
        });
    });
    return () => {
      stop();
    };
  }, [playing, schedule, session]);

  return (
    <section className="cl-physics-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="cl-physics-title">
        물리
      </h2>
      <fieldset className="cl-physics-row">
        <legend>물리 provider</legend>
        {PHYSICS_PROVIDER_IDS.map((id) => {
          const descriptor = PHYSICS_PROVIDER_CATALOG.find((entry) => entry.id === id);
          return (
            <label key={id} title={descriptor?.noteKo}>
              <input type="radio" name={`${ids}-provider`} value={id} checked={selected === id} onChange={(event) => onSelect(event.target.value)} />
              {PHYSICS_PROVIDER_LABELS_KO[id]}
              {descriptor ? <span className="cl-physics-hint">({ROLE_LABELS_KO[descriptor.role]})</span> : null}
            </label>
          );
        })}
      </fieldset>
      <p className="cl-physics-status" role="status" data-tone={status.tone}>
        {status.text}
      </p>
      {state.physics && state.physics.status === "unavailable" ? <p className="cl-physics-reason">선택한 provider는 사용할 수 없습니다. 다른 provider를 직접 선택하세요(자동 대체 없음).</p> : null}
      <div className="cl-physics-row">
        <label htmlFor={`${ids}-steps`}>정착 스텝(최대 {SETTLE_DEFAULTS.maxSteps})</label>
        <input id={`${ids}-steps`} type="number" min={0} max={SETTLE_DEFAULTS.maxSteps} step={1} value={steps} onChange={(event) => setSteps(clampSteps(Number(event.target.value)))} />
        <span className="cl-physics-hint">
          dt 1/{Math.round(1 / SETTLE_DEFAULTS.dtSeconds)} s × 서브스텝 {SETTLE_DEFAULTS.substeps}
        </span>
      </div>
      <div className="cl-physics-actions">
        <button type="button" onClick={() => void onSettle()} disabled={!engineReady || busy}>
          {busy ? "정착 중…" : "정착 실행"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPreviewError(null);
            setPlaying((value) => !value);
          }}
          disabled={!engineReady || !canPreview}
          aria-pressed={playing}
        >
          {playing ? "미리보기 정지" : "미리보기 재생"}
        </button>
        {playing ? <span className="cl-physics-hint">재생 중 · {previewSteps} 스텝</span> : null}
      </div>
      {!engineReady ? <p className="cl-physics-hint">엔진이 준비되면 정착·미리보기를 실행할 수 있습니다.</p> : null}
      {!canPreview ? <p className="cl-physics-hint">이 환경에는 requestAnimationFrame이 없어 미리보기를 재생할 수 없습니다.</p> : null}
      {receipt ? (
        <p className="cl-physics-status" data-tone={receipt.settled ? "ok" : "busy"} data-testid="settle-receipt">
          {receipt.settled ? "정착 완료" : "상한 도달(미수렴)"} · {receipt.steps} 스텝 · 최대 속도 {receipt.maxVelocity.toExponential(2)} m/s
        </p>
      ) : null}
      {settleError ? (
        <p className="cl-physics-reason" role="alert">
          {settleError}
        </p>
      ) : null}
      {previewError ? (
        <p className="cl-physics-reason" role="alert">
          {previewError}
        </p>
      ) : null}
    </section>
  );
}
