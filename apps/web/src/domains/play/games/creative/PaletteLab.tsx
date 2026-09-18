import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { LockKeyhole, Shuffle, UnlockKeyhole } from "lucide-react";
import { useState } from "react";

import { escapeXml, freshSeed, HARMONIES, paletteFor, PALETTE_PRESETS, svgDocument, type Harmony } from "../../lab/creative-core";
import { downloadFile } from "../../lab/creative-export";
import { CopyButton, DraftNotice, ExportDrawing, StudioBridge } from "../../lab/LabShared";
import { recordResult, usePlayDraft } from "../../lab/play-storage";

const validColor = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
type Draft = { colors: string[]; locks: boolean[]; harmony: Harmony; name: string };
const validDraft = (value: unknown): value is Draft => {
  if (!value || typeof value !== "object") return false;
  const v = value as Draft;
  return Array.isArray(v.colors) && v.colors.length === 5 && v.colors.every(validColor) && Array.isArray(v.locks) && v.locks.length === 5 && v.locks.every((l) => typeof l === "boolean") && Object.hasOwn(HARMONIES, v.harmony) && typeof v.name === "string" && v.name.length <= 80;
};
export default function PaletteLab() {
  const { value, setValue, saved } = usePlayDraft<Draft>("palette", () => ({ colors: [...PALETTE_PRESETS[0].colors], locks: [false, false, false, false, false], harmony: "analogous", name: PALETTE_PRESETS[0].name }), validDraft);
  const [message, setMessage] = useState("");
  const css = `/* ${value.name.replace(/[\r\n*/]/g, " ")} · ToonStudio */\n:root {\n${value.colors.map((color, i) => `  --toon-color-${i + 1}: ${color};`).join("\n")}\n}`;
  const svg = svgDocument(`<text x="40" y="57" fill="#322b28" font-family="sans-serif" font-size="28">${escapeXml(value.name)}</text>${value.colors.map((color, index) => `<rect x="${40 + index * 184}" y="90" width="176" height="330" rx="12" fill="${color}"/><text x="${48 + index * 184}" y="462" font-family="monospace" font-size="22" fill="#322b28">${color.toUpperCase()}</text>`).join("")}<text x="40" y="508" fill="#685d51" font-family="sans-serif" font-size="16">ToonStudio · Palette Lab</text>`, 1000, 540, value.name);
  return <div className="play-lab-content">
    <div className="play-exercise-heading"><div><span className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "en", "PALETTE LAB · SET THE MOOD")}</span><h2>{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "한 장면의 분위기, 다섯 가지 색.")}</h2><p>{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "배색을 바꾸고 마음에 드는 색은 잠가 두세요. 완성한 팔레트는 작업 자료로 가져갈 수 있습니다.")}</p></div>
      <button type="button" className="play-button primary" disabled={value.locks.every(Boolean)} onClick={() => { const generated = paletteFor(freshSeed(), value.harmony); setValue({ ...value, colors: value.colors.map((color, i) => value.locks[i] ? color : generated[i]), name: `${HARMONIES[value.harmony]} 창작 팔레트` }); setMessage("잠긴 색을 유지하며 새 배색을 만들었습니다."); }}><Shuffle size={16} />{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "새 배색 만들기")}</button>
    </div>
    <div className="play-actions" aria-label={translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "배색 규칙")}>{(Object.entries(HARMONIES) as [Harmony, string][]).map(([id, label]) => <button type="button" className="play-chip" key={id} aria-pressed={value.harmony === id} onClick={() => setValue({ ...value, harmony: id })}>{label}</button>)}</div>
    <div className="play-palette">{value.colors.map((color, index) => <div className="play-palette-color" key={index} style={{ background: color }}><div className="play-palette-controls">
      <button type="button" className="play-icon-button" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "{v0}번 색 {v1}"), { v0: String(index + 1), v1: String(value.locks[index] ? "잠금 해제" : "잠그기") })} aria-pressed={value.locks[index]} onClick={() => setValue({ ...value, locks: value.locks.map((lock, i) => i === index ? !lock : lock) })}>{value.locks[index] ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}</button>
      <label><span className="sr-only">{index + 1}{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "번 색 직접 선택")}</span><input type="color" value={color} onChange={(event) => setValue({ ...value, colors: value.colors.map((c, i) => i === index ? event.target.value : c) })} /><code>{color.toUpperCase()}</code></label>
    </div></div>)}</div>
    <label className="play-field"><span>{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "팔레트 이름")}</span><input maxLength={80} value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} /></label>
    <section><h3 className="play-subheading">{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "장면에서 시작하는 오리지널 배색")}</h3><div className="play-palette-presets">{PALETTE_PRESETS.map((preset) => <button type="button" key={preset.name} className="play-palette-preset" onClick={() => { setValue({ ...value, name: preset.name, colors: value.colors.map((color, i) => value.locks[i] ? color : preset.colors[i]) }); setMessage("잠긴 색은 유지하고 장면 배색을 적용했습니다."); }}><span className="play-mini-palette" aria-hidden="true">{preset.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>{preset.name}</button>)}</div></section>
    <div className="play-actions"><CopyButton text={css} label={translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "CSS 변수 복사")} /><button type="button" className="play-button" onClick={() => downloadFile(css, "toonstudio-palette.css", "text/css;charset=utf-8")}>{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "CSS 파일 저장")}</button><button className="play-button" type="button" onClick={() => setMessage(recordResult({ id: `palette-${value.colors.join("").replaceAll("#", "")}`, game: "palette-lab", label: value.name || "나의 배색" }) ? "완성한 배색을 내 창작 기록에 남겼습니다." : "기록 저장이 차단되었습니다. 팔레트를 파일로 보관해 주세요.")}>{translateCurrentStaticSourceText("domains.play.games.creative.PaletteLab", "ko", "배색 완성")}</button></div>
    <ExportDrawing svg={svg} name="toonstudio-palette" width={1000} height={540} />
    <p className="play-feedback" role="status">{message}</p><DraftNotice saved={saved} /><StudioBridge />
  </div>;
}
