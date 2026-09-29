import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";

import { hasSeenMaterialGuide, markMaterialGuideSeen } from "./material-search-ux";
import "./material-discovery.css";

/** 첫 방문 시 3초 가이드 툴팁. 닫거나 시간이 지나면 다시 표시하지 않는다. */
export function MaterialFirstVisitGuide() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (hasSeenMaterialGuide()) return;
    setVisible(true);
    const id = window.setTimeout(() => { setVisible(false); markMaterialGuideSeen(); }, 8000);
    return () => window.clearTimeout(id);
  }, []);
  if (!visible) return null;
  const dismiss = () => { setVisible(false); markMaterialGuideSeen(); };
  return <div className="md-guide" role="note" aria-label="소재 탐색 첫 방문 안내">
    <Lightbulb size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
    <p><strong>30초만에 소재 찾기:</strong> 검색창에 원하는 배경·소품을 한글로 입력하세요. 마음에 드는 소재는 <strong>담기</strong>로 장면 목록에 모으고, <strong>캔버스로 보내기</strong>로 스튜디오에서 바로 쓸 수 있습니다.</p>
    <button type="button" aria-label="안내 닫기" onClick={dismiss} className="rounded-lg p-1.5 hover:bg-raised"><X size={15} aria-hidden="true" /></button>
  </div>;
}
