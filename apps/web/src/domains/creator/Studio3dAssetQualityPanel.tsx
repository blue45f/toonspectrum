import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  enableStudio3dHighAssetQuality,
  getStudio3dAssetQualityMode,
  getStudio3dAssetQualityServerSnapshot,
  getStudio3dAssetQualitySnapshot,
  initializeStudio3dAssetQualitySession,
  resetStudio3dAssetQualityMode,
  subscribeStudio3dAssetQuality,
} from "./studio-3d-asset-quality-session";

interface Studio3dAssetQualityPanelProps {
  readonly active: boolean;
  readonly disabled: boolean;
  readonly emptyScene: boolean;
  readonly deviceLostMessage?: string | null;
  readonly onBeforeEnable: () => Promise<boolean>;
}

const BUTTON = "min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

export function Studio3dAssetQualityPanel({
  active, disabled, emptyScene, deviceLostMessage, onBeforeEnable,
}: Studio3dAssetQualityPanelProps) {
  const headingId = useId();
  const { mode, notice } = useSyncExternalStore(
    subscribeStudio3dAssetQuality,
    getStudio3dAssetQualitySnapshot,
    getStudio3dAssetQualityServerSnapshot,
  );
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    if (!active) {
      setSaving(false);
      setConfirming(false);
      setAcknowledged(false);
      resetStudio3dAssetQualityMode();
      return;
    }
    initializeStudio3dAssetQualitySession();
    function onContextLost(): void {
      generation.current += 1;
      setSaving(false);
      setConfirming(false);
      setAcknowledged(false);
      resetStudio3dAssetQualityMode("GPU 연결이 끊겨 자동 모드로 돌아왔습니다. 저장한 장면 사본을 보존하고, 무거운 원본은 경량본으로 다시 가져오세요.");
    }
    document.addEventListener("webglcontextlost", onContextLost, true);
    return () => {
      generation.current += 1;
      document.removeEventListener("webglcontextlost", onContextLost, true);
      if (getStudio3dAssetQualityMode() === "high") resetStudio3dAssetQualityMode();
    };
  }, [active]);

  useEffect(() => {
    if (active && deviceLostMessage) {
      generation.current += 1;
      setSaving(false);
      setConfirming(false);
      setAcknowledged(false);
      resetStudio3dAssetQualityMode("GPU 장치 오류가 발생해 자동 모드로 돌아왔습니다. 장면 사본을 유지하고 경량본으로 다시 가져오세요.");
    }
  }, [active, deviceLostMessage]);

  async function enableAfterCheckpoint(): Promise<void> {
    if (!active || disabled || saving || !acknowledged || deviceLostMessage) return;
    const token = ++generation.current;
    setSaving(true);
    setError(null);
    try {
      const saved = emptyScene || await onBeforeEnable();
      if (generation.current !== token) return;
      if (!saved) {
        setError("장면 사본 저장을 완료하지 못해 자동 모드를 유지했습니다. 저장 공간과 장면 상태를 확인해 주세요.");
        return;
      }
      enableStudio3dHighAssetQuality();
      setConfirming(false);
      setAcknowledged(false);
    } catch {
      if (generation.current === token) {
        setError("장면 사본을 저장하지 못했습니다. 고품질 설정은 적용하지 않았습니다.");
      }
    } finally {
      if (generation.current === token) setSaving(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="mb-4 space-y-2 rounded-xl border border-line bg-raised/60 p-3" data-studio-3d-asset-quality={mode}>
      <h3 id={headingId} className="text-sm font-bold text-fg">3D 모델 메모리 모드</h3>
      <p className="text-xs leading-relaxed text-fg-3">
        기본은 자동 모드입니다. 고품질은 모바일 모델별 텍스처 예상 용량을 128MiB에서 최대 256MiB로 완화합니다.
        더 엄격한 문서 한도와 파일·메시·형식 검사는 유지하며, 화면 해상도·그림자나 기기의 실제 메모리 한도는 바꾸지 않습니다.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="3D 모델 메모리 모드 선택">
        <button type="button" className={BUTTON} aria-pressed={mode === "auto"} disabled={saving} onClick={() => {
          resetStudio3dAssetQualityMode("자동 모드로 돌아왔습니다. 다음 모델 불러오기부터 안전 한도를 적용합니다.");
          setConfirming(false); setAcknowledged(false); setError(null);
        }}>자동 · 기본</button>
        <button type="button" className={BUTTON} aria-pressed={mode === "high"} disabled={!active || disabled || saving || Boolean(deviceLostMessage) || mode === "high"} onClick={() => {
          setConfirming(true); setAcknowledged(false); setError(null);
        }}>고품질 · 현재 실행만</button>
      </div>
      {confirming && mode === "auto" && <div className="space-y-2 rounded-lg border border-line bg-card p-3">
        <p className="text-xs leading-relaxed text-fg-2">
          고품질 원본은 느려짐·발열·페이지 재로딩을 유발할 수 있습니다.
          {emptyScene ? " 현재 배경 장면이 비어 있어 사본 저장은 생략합니다." : " 전환 전에 현재 배경 장면을 이 기기의 템플릿 라이브러리에 사본으로 저장합니다."}
          이는 전체 작품의 백업을 대신하지 않습니다.
        </p>
        <label className="flex min-h-11 items-start gap-2 text-xs leading-relaxed text-fg-2">
          <input type="checkbox" className="mt-1" checked={acknowledged} disabled={saving} onChange={event => setAcknowledged(event.target.checked)} />
          <span>기기 메모리 부족으로 페이지가 종료될 수 있으며, 새로고침 후 자동 모드로 시작한다는 점을 확인했습니다.</span>
        </label>
        <button type="button" className={`${BUTTON} w-full`} disabled={!acknowledged || disabled || saving || !active || Boolean(deviceLostMessage)} onClick={() => { void enableAfterCheckpoint(); }}>
          {saving ? "장면 사본 저장 중" : emptyScene ? "확인 후 고품질 사용" : "장면 사본 저장 후 고품질 사용"}
        </button>
      </div>}
      {error && <p role="alert" className="text-xs leading-relaxed text-fg-2">{error}</p>}
      {notice && <p role="status" className="text-xs leading-relaxed text-fg-2">{notice}</p>}
      <p className="text-[0.65rem] leading-relaxed text-fg-3">
        새로 불러오는 배경 3D 모델부터 적용합니다. 이미 배치한 원본을 자동 삭제·교체하지 않으며, 자동 모드 전환만으로 현재 메모리가 즉시 줄어들지는 않습니다.
        CC0 라이브러리에서 원본 또는 텍스처 메모리 절약본을 선택해 가져오세요.
      </p>
    </section>
  );
}
