import { useId, useMemo, useState } from "react";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";
import { createBrushStudioV6PigmentPalette, type BrushStudioV6PigmentProviderId } from "../brush-studio-v6-pigment-provider";
import { simulatePigmentLayer } from "./external-pigments";
import { StudioPigmentLayerComparison } from "./StudioPigmentLayerComparison";

const MODES: readonly { id: BrushStudioV6PigmentProviderId; node: string; label: string; note: string }[] = [
  { id: "spectral-js-v3", node: "pigment-spectral-js", label: "Spectral.js", note: "분광 K/S · 명도와 착색력으로 혼합 가중치 보정" },
  { id: "open-km-spectral-v1", node: "pigment-open-km-spectral", label: "open-km 분광", note: "K와 S 개별 혼합 · 현재 RGB 복원 스펙트럼, S=1 가정" },
  { id: "colormix-lab-v3", node: "pigment-colormix-lab", label: "ColorMix.js Lab", note: "Lab 색공간 보간 · 물리 안료 모델이 아닌 비교 모드" },
  { id: "mixbox-js-v2", node: "pigment-mixbox", label: "Mixbox", note: "기존 잠재 안료 혼색 · 비상업 라이선스" },
  { id: "spectral-wgm-v1", node: "pigment-spectral", label: "기존 WGM", note: "저장된 브러시와의 비교 · Spectral.js가 아님" },
];

interface Props {
  readonly primary: string;
  readonly secondary: string;
  readonly node: string;
  readonly secondaryActive: boolean;
  readonly onSelect: (node: string) => void;
}

function OpticalLayerProbe({ pigment }: { readonly pigment: string }) {
  const id = useId();
  const [thickness, setThickness] = useState(0.5);
  const [substrate, setSubstrate] = useState("#ffffff");
  const color = useMemo(() => simulatePigmentLayer(pigment, substrate, thickness), [pigment, substrate, thickness]);
  return <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
    <p className="text-xs leading-5 text-fg-2">두께·바탕색에 따른 반사·투과 실험입니다. 합성 스펙트럼과 S=1을 사용하며 실제 도료 단위가 아닙니다. 아래 설정은 브러시에 저장되지 않고 캔버스 아래색도 읽지 않습니다.</p>
    <label htmlFor={`${id}-thickness`} className="block text-xs font-bold text-fg">광학 두께 · {thickness.toFixed(2)}
      <input id={`${id}-thickness`} type="range" min="0" max="5" step="0.05" value={thickness}
        onChange={(event) => setThickness(event.currentTarget.valueAsNumber)} className="mt-2 min-h-9 w-full accent-accent" />
    </label>
    <label htmlFor={`${id}-substrate`} className="block text-xs font-bold text-fg">실험 바탕색
      <input id={`${id}-substrate`} type="color" value={substrate} onChange={(event) => setSubstrate(event.currentTarget.value)} className="mt-2 h-10 w-full" />
    </label>
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-10 w-20 rounded border border-line" style={{ backgroundColor: color }} />
      <output aria-label="광학 층 계산 결과" className="font-mono text-sm text-fg">{color}</output>
    </div>
  </div>;
}

export function StudioPigmentComparison({ primary, secondary, node, secondaryActive, onSelect }: Props) {
  const [showOptics, setShowOptics] = useState(false);
  const palettes = useMemo(() => MODES.map((mode) => ({ ...mode,
    colors: createBrushStudioV6PigmentPalette(primary, secondary, mode.id),
  })), [primary, secondary]);
  return <section aria-label="안료 혼색 비교" className="space-y-3 rounded-2xl border border-line bg-card/60 p-4">
    <h2 className="text-sm font-black text-fg">안료 혼색 비교</h2>
    <p className="text-xs leading-5 text-fg-2">같은 두 색으로 모델별 결과를 비교합니다. 선택한 모델은 재료 브러시와 저장 영수증에 적용되며 기존에 저장한 획은 바꾸지 않습니다. 색이 다르다는 사실이 실제 물감과 더 정확히 일치한다는 뜻은 아닙니다.</p>
    {!secondaryActive ? <p role="note" className="text-xs text-fg-3">현재 획은 보조 색을 사용하지 않습니다. 혼색 효과는 안료 보충·수채·입자 등 두 색을 사용하는 재료 조합에서 확인하세요.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      {palettes.map((mode) => <div key={mode.id} className="rounded-xl border border-line p-3">
        <button type="button" aria-pressed={node === mode.node} onClick={() => onSelect(mode.node)}
          className={`min-h-11 w-full rounded-lg border px-2 text-left text-xs font-bold text-fg hover:bg-raised ${node === mode.node ? "border-accent bg-accent/10" : "border-transparent"} ${STUDIO_FOCUS_RING}`}>{mode.label} 선택 {node === mode.node ? <span aria-hidden="true" className="ml-2 text-accent">선택됨</span> : null}</button>
        <div aria-hidden="true" className="mt-1 flex h-8 overflow-hidden rounded">
          {mode.colors.map((color, index) => <span key={index} style={{ backgroundColor: color }} className="min-w-0 flex-1" />)}
        </div>
        <p className="mt-2 text-xs text-fg-2">중간 혼색 <code>{mode.colors[16]}</code></p>
        <p className="mt-1 text-xs leading-5 text-fg-3">{mode.note}</p>
      </div>)}
    </div>
    <button type="button" aria-expanded={showOptics} onClick={() => setShowOptics((open) => !open)}
      className={`min-h-11 rounded-xl border border-line px-3 text-xs font-bold text-fg ${STUDIO_FOCUS_RING}`}>K–M 광학 층 실험 {showOptics ? "닫기" : "열기"}</button>
    {showOptics ? <><OpticalLayerProbe pigment={primary} /><StudioPigmentLayerComparison primary={primary} secondary={secondary} /></> : null}
  </section>;
}
