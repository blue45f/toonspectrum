import { useId } from "react";
import type { FortuneBirthInput } from "@toonspectrum/core/fortune";

interface Props { label: string; value: FortuneBirthInput; onChange: (value: FortuneBirthInput) => void }
export function FortuneBirthFields({ label, value, onChange }: Props) {
  const id = useId();
  const completed = 1 + Number(Boolean(value.date)) + Number(Boolean(value.time));
  return <fieldset className="fo-birth"><legend>{label}</legend>
    <div className="fo-birth-oracle"><span aria-hidden="true">☾</span><div><strong>나를 이루는 시간의 좌표</strong><p>달력 기준과 생년월일, 알고 있다면 출생시간까지 이어 주세요.</p></div><div className="fo-birth-progress" aria-label={`입력 단서 ${completed}/3`}><i data-active="true" /><i data-active={Boolean(value.date)} /><i data-active={Boolean(value.time)} /></div></div>
    <div className="fo-fields">
      <label htmlFor={`${id}-calendar`}>달력 기준<select id={`${id}-calendar`} value={value.calendar ?? "solar"} onChange={(e) => onChange({ ...value, calendar: e.target.value === "lunar" ? "lunar" : "solar", leapMonth: false })}><option value="solar">양력</option><option value="lunar">음력 (한국)</option></select></label>
      <label htmlFor={`${id}-date`}>생년월일<input id={`${id}-date`} type="text" autoComplete="off" placeholder="1990-06-15" maxLength={10} required pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" value={value.date} aria-describedby={`${id}-help`} onChange={(e) => onChange({ ...value, date: e.target.value })} /></label>
      <label htmlFor={`${id}-time`}>출생시간 · 선택<input id={`${id}-time`} type="time" autoComplete="off" value={value.time ?? ""} onChange={(e) => onChange({ ...value, time: e.target.value || undefined })} /></label>
    </div>
    {value.calendar === "lunar" && <label className="fo-check"><input type="checkbox" checked={value.leapMonth ?? false} onChange={(e) => onChange({ ...value, leapMonth: e.target.checked })} />윤달에 태어났어요 (평달과 구분)</label>}
    <p id={`${id}-help`} className="fo-help">1900~2050년 · YYYY-MM-DD · 시간은 한국 표준시. 빈 시간은 ‘미상’으로 계산하며 시주를 만들지 않습니다.</p>
    <details className="fo-convention"><summary>일자 변경 기준과 계산 범위</summary>
      <label htmlFor={`${id}-boundary`}>일주가 바뀌는 시각<select id={`${id}-boundary`} value={value.dayBoundary ?? "midnight"} onChange={(e) => onChange({ ...value, dayBoundary: e.target.value === "zi" ? "zi" : "midnight" })}><option value="midnight">자정 00:00 (기본)</option><option value="zi">야자시 23:00</option></select></label>
      <p>연주·월주는 절입 시각을 사용합니다. 진태양시·출생지·과거 서머타임은 보정하지 않습니다. 출생시간 미상은 연주·월주 판단에 정오를 사용하므로 절입 당일 결과가 달라질 수 있어요.</p>
    </details>
  </fieldset>;
}
