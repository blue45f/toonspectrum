export interface ExportableDeckSlide {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
  readonly note: string;
  readonly flow?: readonly string[];
  readonly technologies?: readonly string[];
  readonly question?: string;
}
export function escapeDeckHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
/** 외부 스크립트·폰트·영상 없이 열리는 발표 백업이다. 서비스의 오프라인 복제본은 아니다. */
export function buildOfflineEngineeringDeck(slides: readonly ExportableDeckSlide[], locale: string): string {
  const ko = locale.startsWith("ko");
  const label = ko ? "오프라인 발표 백업 · 외부 영상과 서비스는 포함하지 않습니다." : "Offline presentation backup · External media and services are not included.";
  const cards = slides.map((slide, index) => `<article data-slide${index ? " hidden" : ""}>
    <header>${escapeDeckHtml(slide.eyebrow)} · ${index + 1}/${slides.length}</header>
    <h1>${escapeDeckHtml(slide.title)}</h1><p class="takeaway">${escapeDeckHtml(slide.body)}</p>
    <ol>${slide.points.map((point) => `<li>${escapeDeckHtml(point)}</li>`).join("")}</ol>
    <p class="flow">${(slide.flow ?? []).map(escapeDeckHtml).join(" → ")}</p>
    <p class="tech">${(slide.technologies ?? []).map(escapeDeckHtml).join(" · ")}</p>
    <details><summary>${ko ? "발표자 노트 · 청중 화면에서는 닫아두세요" : "Speaker notes · Keep closed on the audience screen"}</summary><p class="notes">${escapeDeckHtml(slide.note)}</p><p>${escapeDeckHtml(slide.question ?? "")}</p></details>
  </article>`).join("\n");
  return `<!doctype html><html lang="${escapeDeckHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>ToonStudio · ${ko ? "오프라인 기술 발표" : "Offline engineering presentation"}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f2f4e9;color:#203729;font-family:system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:clamp(24px,5vw,72px)}article[hidden]{display:none}header,.tech{color:#526a56;font-size:14px}h1{font-size:clamp(28px,4.5vw,56px);line-height:1.2;word-break:keep-all}p,li{font-size:clamp(17px,2vw,24px);line-height:1.7}li{padding:10px}details{border-top:1px solid #78916d;margin-top:24px;padding:16px 0}.notes{white-space:pre-line;font-size:18px}.flow{font-weight:700}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap;position:sticky;bottom:0;padding:16px;background:#e3ead7;border-top:1px solid #78916d}button,select{font:inherit;min-height:44px;padding:8px 16px;max-width:100%}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #203729;outline-offset:3px}footer{font-size:13px;padding:12px 24px}.takeaway{font-weight:600}@media print{article[hidden],article{display:block;break-after:page}nav,footer,details{display:none}main{padding:0}}</style></head><body><main>${cards}</main>
<nav aria-label="${ko ? "발표 조작" : "Presentation controls"}"><button id="prev">${ko ? "이전" : "Previous"}</button><button id="next">${ko ? "다음" : "Next"}</button><label>${ko ? "슬라이드" : "Slide"} <select id="jump">${slides.map((slide,index) => `<option value="${index}">${index + 1}. ${escapeDeckHtml(slide.title)}</option>`).join("")}</select></label><span id="status" role="status"></span></nav><footer>${label} ← → · Space · Home · End</footer>
<script>(()=>{const slides=[...document.querySelectorAll('[data-slide]')];const prev=document.getElementById('prev');const next=document.getElementById('next');const jump=document.getElementById('jump');let index=0;function show(value){index=Math.max(0,Math.min(slides.length-1,value));slides.forEach((slide,i)=>{slide.hidden=i!==index});prev.disabled=index===0;next.disabled=index===slides.length-1;jump.value=String(index);document.getElementById('status').textContent=(index+1)+' / '+slides.length;}prev.onclick=()=>show(index-1);next.onclick=()=>show(index+1);jump.onchange=()=>show(Number(jump.value));document.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest?.('button,select,input,textarea,summary,a,[contenteditable]'))return;const moves={ArrowRight:index+1,PageDown:index+1,' ':index+1,ArrowLeft:index-1,PageUp:index-1,Home:0,End:slides.length-1};if(Object.prototype.hasOwnProperty.call(moves,event.key)){event.preventDefault();show(moves[event.key]);}});show(0);})();</script></body></html>`;
}
export function downloadOfflineEngineeringDeck(html: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
