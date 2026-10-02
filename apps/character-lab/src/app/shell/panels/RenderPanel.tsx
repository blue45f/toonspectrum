/**
 * RenderPanel: 셰이딩 모드(PBR/툰)·품질 프리셋·톤맵·그림자(캐스케이드·PCF·접촉 경화)·후처리(FXAA·블룸·샤프닝·TAA/SSAO 베타)·IBL 세기·
 * 툰 옵션을 `shading/set`으로 바꾸고, 엔진이 보고하는 기능 가용성(CSM·SSS·IBL·TAA·SSAO·GPU 타이머·텍스처 모드)과 HUD 수치를 표로 보인다.
 *
 * - 컨트롤은 레시피의 `shading` 프로파일을 그대로 편집한다(엔진이 없어도 저장되고, 준비되면 적용 루프가 반영한다).
 * - 슬라이더(IBL 세기)는 드래그 중에는 로컬 값만 바꾸고 포인터·키보드를 놓을 때 한 번만 dispatch한다(history 1단계).
 * - 엔진이 켜지 못한 기능은 '사용 불가 + 사유'로 표에 남는다. 패널은 대체 기능을 켜거나 설정을 바꾸지 않는다(무음 축소 금지).
 * - TAA·SSAO는 베타 라벨을 붙인다. 이 컨테이너에는 GPU가 없어 실제 렌더 품질은 브라우저 미검증이다.
 * - 베타 기능 4종(NodeMaterial 툰·IBL 그림자·OpenPBR·투영 페인트)은 엔진 세션 상태라 레시피·히스토리에 저장하지 않고 엔진 포트
 *   (`betaFeatures()`·`setBetaFeature()`)로 켜고 끈다. 기본은 꺼짐이고 엔진이 능력을 확인해 지원하지 않으면 체크박스가 비활성이며 한글 사유를 보인다
 *   (다른 경로로 자동 대체하지 않는다). 확장 능력(체형 관절 오프셋·GLB morph sparse)은 별도 표에 보인다. 키보드: 체크박스는 Tab·Space로 조작한다.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { QUALITY_PRESET_LABELS_KO, TONE_MAPPINGS, applyQualityPreset } from "../../../contracts";
import { BETA_FEATURE_HINTS_KO, BETA_FEATURE_IDS, EXTENDED_FEATURE_LABELS_KO, RIG_CAPABILITY_IDS, hasBetaFeatures, readBetaFeatures, readExtendedFeatures } from "../../../render/beta-features";
import { SCENE_FEATURE_IDS, SCENE_FEATURE_LABELS_KO, SCENE_FEATURE_STATUS_LABELS_KO, readSceneFeatures } from "../../../render/scene-features";
import { describeAdapter } from "../engine-status-text";
import { useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import { hudRows } from "./viewport-interactions";

import type { HudSample, QualityPresetId, ShadingProfile, ToneMapping } from "../../../contracts";
import type { BetaFeatureId, BetaFeatureReport, BetaFeatureState } from "../../../render/beta-features";
import type { SceneFeatureReport } from "../../../render/scene-features";
import type { ChangeEvent } from "react";

export interface RenderPanelProps {
  /** HUD·기능 보고 갱신 주기(ms). 0 이하면 한 번만 읽는다. */
  readonly pollIntervalMs?: number;
}

export const DEFAULT_RENDER_POLL_MS = 500;

const QUALITY_IDS: readonly QualityPresetId[] = ["preview", "standard", "hero"];
const TONE_LABELS_KO: Readonly<Record<ToneMapping, string>> = { "khr-pbr-neutral": "KHR PBR Neutral(기본)", aces: "ACES", none: "없음" };
const OUTLINE_LABELS_KO = { none: "없음", hull: "외곽 셸(hull)", edge: "엣지 검출" } as const;
const CASCADE_CHOICES = [1, 2, 3, 4] as const;
const RAMP_CHOICES = [2, 3, 4] as const;

function isToneMapping(value: string): value is ToneMapping {
  return (TONE_MAPPINGS as readonly string[]).includes(value);
}

function isOutline(value: string): value is ShadingProfile["toon"]["outline"] {
  return value === "none" || value === "hull" || value === "edge";
}

/** 베타 항목 한 줄 상태(한글). 요청했지만 지금은 적용되지 않는 경우(모드 불일치 등)는 오류가 아니라 '대기'다. */
export function describeBetaState(state: BetaFeatureState): string {
  if (state.status === "active") return state.detail ? `활성 — ${state.detail}` : "활성";
  if (state.status === "unavailable") return `사용 불가 — ${state.reasonKo ?? "사유 없음"}`;
  if (state.requested) return `대기 — ${state.reasonKo ?? "지금은 적용되지 않습니다."}`;
  return state.reasonKo ? `꺼짐 — ${state.reasonKo}` : "꺼짐";
}

function failureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "reasonKo" in error && typeof (error as { reasonKo: unknown }).reasonKo === "string") return (error as { reasonKo: string }).reasonKo;
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

export function RenderPanel({ pollIntervalMs = DEFAULT_RENDER_POLL_MS }: RenderPanelProps) {
  const state = useLabState();
  const dispatch = useDispatch();
  const session = useEngineSession();
  const ids = useId();
  const shading = state.recipe.shading;
  const engine = state.engine.phase === "ready" ? session.engine() : null;
  const diagnostics = state.engine.phase === "ready" ? state.engine.diagnostics : null;

  const [features, setFeatures] = useState<SceneFeatureReport | null>(null);
  const [hud, setHud] = useState<HudSample | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const featuresKeyRef = useRef("");
  const [beta, setBeta] = useState<BetaFeatureReport | null>(null);
  const betaKeyRef = useRef("");
  const [betaPending, setBetaPending] = useState<ReadonlySet<BetaFeatureId>>(() => new Set());
  const [betaMessage, setBetaMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // IBL 세기 슬라이더: 드래그 중 로컬 값, 놓을 때 dispatch
  const [iblDraft, setIblDraft] = useState(shading.ibl.intensity);
  useEffect(() => {
    setIblDraft(shading.ibl.intensity);
  }, [shading.ibl.intensity]);

  const poll = useCallback((): void => {
    if (!engine) {
      setFeatures(null);
      setHud(null);
      setBeta(null);
      featuresKeyRef.current = "";
      betaKeyRef.current = "";
      return;
    }
    try {
      const report = readSceneFeatures(engine);
      const key = report ? JSON.stringify(report) : "";
      if (key !== featuresKeyRef.current) {
        featuresKeyRef.current = key;
        setFeatures(report);
      }
      const betaReport = readBetaFeatures(engine);
      const betaKey = betaReport ? JSON.stringify(betaReport) : "";
      if (betaKey !== betaKeyRef.current) {
        betaKeyRef.current = betaKey;
        setBeta(betaReport);
      }
      setHud(engine.readHud());
      setPollError(null);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "엔진 상태를 읽지 못했습니다.");
    }
  }, [engine]);

  useEffect(() => {
    poll();
    if (!(pollIntervalMs > 0)) return undefined;
    const timer = window.setInterval(poll, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [poll, pollIntervalMs]);

  // 셰이딩이 바뀌면 적용 루프가 엔진에 반영한 뒤 보고가 달라지므로 다음 틱에 다시 읽는다.
  useEffect(() => {
    const timer = window.setTimeout(poll, 0);
    return () => window.clearTimeout(timer);
  }, [poll, shading]);

  const set = (profile: Partial<ShadingProfile>): void => dispatch({ type: "shading/set", profile });

  const commitIbl = (): void => {
    if (iblDraft !== shading.ibl.intensity) set({ ibl: { ...shading.ibl, intensity: iblDraft } });
  };

  const toggleBeta = async (id: BetaFeatureId, enabled: boolean): Promise<void> => {
    if (!engine || !hasBetaFeatures(engine)) return;
    setBetaPending((previous) => new Set(previous).add(id));
    try {
      const next = await engine.setBetaFeature(id, enabled);
      if (mountedRef.current) setBetaMessage(`${EXTENDED_FEATURE_LABELS_KO[id]}: ${describeBetaState(next)}`);
    } catch (error) {
      if (mountedRef.current) setBetaMessage(`${EXTENDED_FEATURE_LABELS_KO[id]}: 바꾸지 못했습니다 — ${failureMessage(error)}`);
    } finally {
      if (mountedRef.current) {
        setBetaPending((previous) => {
          const copy = new Set(previous);
          copy.delete(id);
          return copy;
        });
        poll();
      }
    }
  };

  const betaSupported = engine !== null && hasBetaFeatures(engine);
  const extended = readExtendedFeatures(features);
  const isToon = shading.mode === "toon";
  const hudList = hud ? hudRows(hud) : [];
  const unavailable = (id: keyof SceneFeatureReport): string | null => {
    const entry = features?.[id];
    return entry && entry.status === "unavailable" ? (entry.reasonKo ?? "사유 없음") : null;
  };

  return (
    <section className="cl-render-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="cl-render-title">
        렌더
      </h2>
      {diagnostics ? (
        <p className="cl-render-status" data-tone="ok">
          활성 엔진 {diagnostics.backend} · {describeAdapter(diagnostics)} · Babylon {diagnostics.engineVersion}
        </p>
      ) : (
        <p className="cl-render-hint" role="status">
          엔진이 준비되지 않았습니다. 설정은 레시피에 저장되고 엔진을 선택하면 적용됩니다.
        </p>
      )}

      <div className="cl-render-row" role="group" aria-label="셰이딩 모드">
        <button type="button" aria-pressed={!isToon} onClick={() => set({ mode: "pbr" })}>
          PBR
        </button>
        <button type="button" aria-pressed={isToon} onClick={() => set({ mode: "toon" })}>
          툰
        </button>
      </div>

      <div className="cl-render-actions" role="group" aria-label="품질 프리셋">
        {QUALITY_IDS.map((id) => (
          <button key={id} type="button" onClick={() => set(applyQualityPreset(shading, id))}>
            {QUALITY_PRESET_LABELS_KO[id]}
          </button>
        ))}
      </div>

      <div className="cl-render-row">
        <label htmlFor={`${ids}-tone`}>톤맵</label>
        <select
          id={`${ids}-tone`}
          value={shading.toneMapping}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            if (isToneMapping(event.target.value)) set({ toneMapping: event.target.value });
          }}
        >
          {TONE_MAPPINGS.map((tone) => (
            <option key={tone} value={tone}>
              {TONE_LABELS_KO[tone]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="cl-render-group">
        <legend>그림자</legend>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-shadow-on`}>사용</label>
          <input id={`${ids}-shadow-on`} type="checkbox" checked={shading.shadows.enabled} onChange={(event) => set({ shadows: { ...shading.shadows, enabled: event.target.checked } })} />
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-cascades`}>캐스케이드</label>
          <select
            id={`${ids}-cascades`}
            value={shading.shadows.cascades}
            disabled={!shading.shadows.enabled}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 1 || value === 2 || value === 3 || value === 4) set({ shadows: { ...shading.shadows, cascades: value } });
            }}
          >
            {CASCADE_CHOICES.map((count) => (
              <option key={count} value={count}>
                {count}단
              </option>
            ))}
          </select>
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-pcf`}>부드러운 필터(PCF)</label>
          <input id={`${ids}-pcf`} type="checkbox" checked={shading.shadows.pcf} disabled={!shading.shadows.enabled} onChange={(event) => set({ shadows: { ...shading.shadows, pcf: event.target.checked } })} />
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-pcss`}>접촉 경화(PCSS)</label>
          <input
            id={`${ids}-pcss`}
            type="checkbox"
            checked={shading.shadows.contactHardening}
            disabled={!shading.shadows.enabled}
            onChange={(event) => set({ shadows: { ...shading.shadows, contactHardening: event.target.checked } })}
          />
        </div>
        {unavailable("cascadedShadows") ? <p className="cl-render-reason">{unavailable("cascadedShadows")}</p> : null}
      </fieldset>

      <fieldset className="cl-render-group">
        <legend>후처리</legend>
        {(
          [
            { key: "fxaa", label: "FXAA", beta: false },
            { key: "bloom", label: "블룸", beta: false },
            { key: "sharpen", label: "샤프닝", beta: false },
            { key: "taa", label: "TAA", beta: true },
            { key: "ssao", label: "SSAO", beta: true },
          ] as const
        ).map((entry) => (
          <div key={entry.key} className="cl-render-row">
            <label htmlFor={`${ids}-fx-${entry.key}`}>
              {entry.label}
              {entry.beta ? <span className="cl-render-beta"> (베타)</span> : null}
            </label>
            <input id={`${ids}-fx-${entry.key}`} type="checkbox" checked={shading.postfx[entry.key]} onChange={(event) => set({ postfx: { ...shading.postfx, [entry.key]: event.target.checked } })} />
          </div>
        ))}
        {unavailable("taa") && shading.postfx.taa ? <p className="cl-render-reason">TAA: {unavailable("taa")}</p> : null}
        {unavailable("ssao") && shading.postfx.ssao ? <p className="cl-render-reason">SSAO: {unavailable("ssao")}</p> : null}
      </fieldset>

      <fieldset className="cl-render-group">
        <legend>이미지 기반 조명(IBL)</legend>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-ibl-on`}>사용</label>
          <input id={`${ids}-ibl-on`} type="checkbox" checked={shading.ibl.enabled} onChange={(event) => set({ ibl: { ...shading.ibl, enabled: event.target.checked } })} />
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-ibl-intensity`}>세기</label>
          <input
            id={`${ids}-ibl-intensity`}
            type="range"
            min={0}
            max={4}
            step={0.05}
            value={iblDraft}
            disabled={!shading.ibl.enabled}
            onChange={(event) => setIblDraft(Number(event.target.value))}
            onPointerUp={commitIbl}
            onKeyUp={commitIbl}
            onBlur={commitIbl}
          />
          <output htmlFor={`${ids}-ibl-intensity`}>{iblDraft.toFixed(2)}</output>
        </div>
        {unavailable("imageBasedLighting") && shading.ibl.enabled ? <p className="cl-render-reason">{unavailable("imageBasedLighting")}</p> : null}
      </fieldset>

      <fieldset className="cl-render-group" disabled={!isToon}>
        <legend>툰 옵션{isToon ? "" : " (툰 모드에서 사용)"}</legend>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-ramp`}>음영 단계</label>
          <select
            id={`${ids}-ramp`}
            value={shading.toon.rampSteps}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 2 || value === 3 || value === 4) set({ toon: { ...shading.toon, rampSteps: value } });
            }}
          >
            {RAMP_CHOICES.map((steps) => (
              <option key={steps} value={steps}>
                {steps}단계
              </option>
            ))}
          </select>
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-sdf`}>얼굴 SDF 그림자</label>
          <input id={`${ids}-sdf`} type="checkbox" checked={shading.toon.faceSdfShadow} onChange={(event) => set({ toon: { ...shading.toon, faceSdfShadow: event.target.checked } })} />
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-outline`}>외곽선</label>
          <select
            id={`${ids}-outline`}
            value={shading.toon.outline}
            onChange={(event) => {
              if (isOutline(event.target.value)) set({ toon: { ...shading.toon, outline: event.target.value } });
            }}
          >
            {(Object.keys(OUTLINE_LABELS_KO) as Array<keyof typeof OUTLINE_LABELS_KO>).map((mode) => (
              <option key={mode} value={mode}>
                {OUTLINE_LABELS_KO[mode]}
              </option>
            ))}
          </select>
        </div>
        <div className="cl-render-row">
          <label htmlFor={`${ids}-rim`}>림 라이트</label>
          <input id={`${ids}-rim`} type="checkbox" checked={shading.toon.rim} onChange={(event) => set({ toon: { ...shading.toon, rim: event.target.checked } })} />
        </div>
      </fieldset>

      <fieldset className="cl-render-group" data-group="beta">
        <legend>
          베타 기능<span className="cl-render-beta"> (베타)</span>
        </legend>
        <p id={`${ids}-beta-note`} className="cl-render-hint">
          기본은 꺼짐입니다. 켜기 전에 엔진 능력을 확인하고 지원하지 않으면 켜지지 않으며(사유 표시) 다른 경로로 자동 대체하지 않습니다. 이 설정은 레시피에 저장되지 않고 엔진을 다시 고르면 꺼집니다.
          OpenPBR·IBL 그림자는 청색 노이즈 텍스처 1장을 assets.babylonjs.com에서 받습니다(외부 요청). 실제 렌더 품질은 GPU 브라우저에서 검증해야 합니다.
        </p>
        {!betaSupported ? <p className="cl-render-reason">{engine ? "이 엔진은 베타 기능 토글을 제공하지 않습니다." : "엔진이 준비되면 베타 기능을 켤 수 있습니다."}</p> : null}
        {BETA_FEATURE_IDS.map((id) => {
          const entry = beta?.[id] ?? null;
          const pending = betaPending.has(id);
          const unsupported = entry !== null && !entry.supported;
          return (
            <div key={id} className="cl-render-beta-item" data-beta={id} data-status={entry?.status ?? "off"}>
              <div className="cl-render-row">
                <label htmlFor={`${ids}-beta-${id}`}>
                  {EXTENDED_FEATURE_LABELS_KO[id]}
                  <span className="cl-render-beta"> (베타)</span>
                </label>
                <input
                  id={`${ids}-beta-${id}`}
                  type="checkbox"
                  checked={entry?.requested ?? false}
                  disabled={!betaSupported || entry === null || unsupported || pending}
                  aria-describedby={`${ids}-beta-${id}-hint ${ids}-beta-${id}-state`}
                  aria-busy={pending ? "true" : undefined}
                  onChange={(event) => {
                    // 비활성 컨트롤은 브라우저가 이벤트를 만들지 않지만, 합성 이벤트(보조 기술·테스트)로도 지원하지 않는 기능을 켜지 않는다.
                    if (entry === null || unsupported || pending) return;
                    void toggleBeta(id, event.target.checked);
                  }}
                />
              </div>
              <p id={`${ids}-beta-${id}-hint`} className="cl-render-hint">
                {BETA_FEATURE_HINTS_KO[id]}
              </p>
              <p id={`${ids}-beta-${id}-state`} className={entry?.status === "unavailable" ? "cl-render-reason" : "cl-render-hint"} data-role="beta-state">
                {pending ? "처리 중…" : entry ? describeBetaState(entry) : "엔진 상태를 읽을 수 없습니다."}
              </p>
            </div>
          );
        })}
        <p className="cl-render-hint" role="status" aria-live="polite" data-role="beta-message">
          {betaMessage ?? ""}
        </p>
      </fieldset>

      <h3 className="cl-render-title">엔진 기능 상태</h3>
      {!engine ? (
        <p className="cl-render-hint">엔진이 준비되면 기능 가용성이 여기에 표시됩니다.</p>
      ) : features ? (
        <table className="cl-render-table" aria-label="엔진 기능 상태">
          <tbody>
            {SCENE_FEATURE_IDS.map((id) => {
              const entry = features[id];
              return (
                <tr key={id} data-feature={id} data-status={entry.status}>
                  <th scope="row">{SCENE_FEATURE_LABELS_KO[id]}</th>
                  <td>{SCENE_FEATURE_STATUS_LABELS_KO[entry.status]}</td>
                  <td>{entry.reasonKo ?? entry.detail ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="cl-render-hint">이 엔진은 기능 가용성 보고를 제공하지 않습니다.</p>
      )}
      {extended ? (
        <table className="cl-render-table" aria-label="확장 기능 상태">
          <tbody>
            {RIG_CAPABILITY_IDS.map((id) => {
              const entry = extended[id];
              if (!entry) return null;
              return (
                <tr key={id} data-feature={id} data-status={entry.status}>
                  <th scope="row">{EXTENDED_FEATURE_LABELS_KO[id]}</th>
                  <td>{SCENE_FEATURE_STATUS_LABELS_KO[entry.status]}</td>
                  <td>{entry.reasonKo ?? entry.detail ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <h3 className="cl-render-title">HUD 수치</h3>
      {hudList.length > 0 ? (
        <table className="cl-render-table" aria-label="HUD 수치">
          <tbody>
            {hudList.map((row) => (
              <tr key={row.key} data-key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="cl-render-hint">엔진이 준비되면 프레임·드로 콜·backend 수치가 표시됩니다.</p>
      )}
      {pollError ? <p className="cl-render-reason">{pollError}</p> : null}
      <p className="cl-render-hint">TAA·SSAO는 베타 기능입니다. 실제 렌더 품질은 GPU 브라우저에서 검증해야 합니다(이 저장소 컨테이너는 NullEngine까지만 검증).</p>
    </section>
  );
}
