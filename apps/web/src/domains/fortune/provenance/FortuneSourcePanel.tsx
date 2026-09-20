import { useState } from "react";

import { FORTUNE_SIGNS } from "../../../../../../packages/contracts/src/fortune-provenance";

import { readSourcedZodiac } from "./fortune-source-client";

import type { FortuneSign, SourcedFortune } from "../../../../../../packages/contracts/src/fortune-provenance";

export function FortuneSourcePanel() {
  const [sign, setSign] = useState<FortuneSign>("aries"), [data, setData] = useState<SourcedFortune | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function read() { setBusy(true); setError(""); try { setData(await readSourcedZodiac(sign)); } catch { setData(null); setError("운세를 불러오지 못했어요. 자동 재요청하지 않습니다."); } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-xl border border-line bg-panel p-5"><h2 className="font-bold">별자리 운세 · 출처 확인</h2><label>선택한 별자리<select className="ml-3 rounded border border-line bg-panel p-2" value={sign} onChange={(e) => { setSign(e.target.value as FortuneSign); setData(null); }}>{Object.entries(FORTUNE_SIGNS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className="min-h-11 rounded border border-line px-4" disabled={busy} onClick={() => { void read(); }}>무료 로컬 운세 확인</button>{error && <p role="alert">{error}</p>}{data && <><p className="text-sm">{data.provenance.provider} · {data.provenance.sourceDate} · {data.provenance.timeZone}</p><p className="text-sm">{data.provenance.status === "local-default" ? "외부 제공자 꺼짐 · 기존 로컬 계산" : data.provenance.status === "external-current" ? "허가된 외부 자료" : "외부 제공자 실패 · 기존 로컬 계산으로 표시"}</p><p className="whitespace-pre-wrap">{data.text}</p></>}</section>;
}
