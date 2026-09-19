import { useId, useMemo, useState } from "react";
import { prepareSyntheticPigmentLayers } from "./external-pigments";

/** Local optical probe. Deliberately does not change brush receipts or sample canvas pixels. */
export function StudioPigmentLayerComparison({ primary, secondary }: { readonly primary: string; readonly secondary: string }) {
  const id = useId();
  const [firstThickness, setFirstThickness] = useState(0.5);
  const [secondThickness, setSecondThickness] = useState(0.5);
  const [substrate, setSubstrate] = useState("#ffffff");
  const prepared = useMemo(() => prepareSyntheticPigmentLayers(primary, secondary, substrate), [primary, secondary, substrate]);
  const colors = useMemo(() => prepared(firstThickness, secondThickness), [prepared, firstThickness, secondThickness]);
  const swatches = [
    ["미리 섞은 도막", colors.premixed],
    ["주 색을 위에 덧칠", colors.firstOnSecond],
    ["보조 색을 위에 덧칠", colors.secondOnFirst],
  ] as const;
  return <section aria-label="KM 혼합과 겹칠 비교" className="mt-3 space-y-3 rounded-xl border border-line p-3">
    <h3 className="text-sm font-bold text-fg">같은 양 · 섞기와 겹쳐 칠하기</h3>
    <p className="text-xs leading-5 text-fg-2">같은 두 색과 총 도막 두께로 세 결과를 계산합니다. K와 S를 섞는 것과 층을 올리는 것은 다른 연산입니다. 겹칠 때 중간 색을 RGB로 바꾸지 않습니다.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label htmlFor={`${id}-first`} className="text-xs font-bold text-fg">주 색 도막 두께 · {firstThickness.toFixed(2)}
        <input id={`${id}-first`} type="range" min="0" max="5" step="0.05" value={firstThickness}
          onChange={(event) => setFirstThickness(event.currentTarget.valueAsNumber)} className="mt-2 min-h-9 w-full accent-accent" />
      </label>
      <label htmlFor={`${id}-second`} className="text-xs font-bold text-fg">보조 색 도막 두께 · {secondThickness.toFixed(2)}
        <input id={`${id}-second`} type="range" min="0" max="5" step="0.05" value={secondThickness}
          onChange={(event) => setSecondThickness(event.currentTarget.valueAsNumber)} className="mt-2 min-h-9 w-full accent-accent" />
      </label>
    </div>
    <label htmlFor={`${id}-substrate`} className="block text-xs font-bold text-fg">겹칠 비교 바탕색
      <input id={`${id}-substrate`} type="color" value={substrate} onChange={(event) => setSubstrate(event.currentTarget.value)} className="mt-2 h-10 w-full" />
    </label>
    <div className="grid gap-3 sm:grid-cols-3">
      {swatches.map(([label, color]) => <div key={label} className="rounded-lg border border-line p-2">
        <p className="text-xs font-bold text-fg">{label}</p>
        <div aria-hidden="true" className="my-2 h-9 rounded border border-line" style={{ backgroundColor: color }} />
        <output aria-label={label} className="font-mono text-sm text-fg">{color}</output>
      </div>)}
    </div>
    <p role="note" className="text-xs leading-5 text-fg-3">RGB 복원 분광값과 S=1을 쓰는 합성 안료 실험입니다. 두께는 실측 길이·알파값이 아닙니다. 바탕색·두께는 저장되지 않고, 실제 캔버스의 겹칠·스머지에는 아직 적용되지 않습니다.</p>
  </section>;
}
