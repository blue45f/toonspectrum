/**
 * 네트워크 없이 여는 발표 백업(단일 HTML). 서비스의 오프라인 복제본이 아니다.
 * - 외부 스크립트·폰트·이미지·영상을 포함하지 않는다(인라인 스크립트 1개만).
 * - 모든 콘텐츠 문자열은 이스케이프한다.
 * - 이 파일은 앱 밖에서 열리므로 테마 토큰을 쓸 수 없어, 스타라이트 팔레트를 파일 안 변수로 고정한다.
 */

export interface ExportableDeckSlide {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly points: readonly string[];
  readonly notes: string;
  readonly flow?: readonly string[];
  readonly stack?: readonly string[];
  readonly question?: string;
}

function escapeDeckHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const OFFLINE_DECK_STYLE = `
:root{--bg:#070a14;--panel:#0b101d;--card:#101726;--line:#303b54;--fg:#f1f4ff;--fg2:#c5cede;--fg3:#a5b3c9;--accent:#b39bff;--accent2:#6edaff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1200px;margin:auto;padding:clamp(20px,4vw,56px)}
article[hidden]{display:none}
header{color:var(--accent2);font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
h1{margin:14px 0 0;font-size:clamp(28px,4.4vw,54px);line-height:1.18;word-break:keep-all}
.lead{color:var(--fg2);font-weight:600;font-size:clamp(17px,2vw,24px);line-height:1.6;word-break:keep-all}
ol{display:grid;gap:10px;padding:0;list-style:none;counter-reset:p}
li{padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card);font-size:clamp(16px,1.8vw,21px);line-height:1.55;word-break:keep-all}
li::before{counter-increment:p;content:counter(p);display:inline-grid;place-items:center;width:1.6em;height:1.6em;margin-right:10px;border-radius:50%;background:rgba(179,155,255,.2);color:var(--accent);font-weight:800;font-size:.8em}
.flow{color:var(--fg);font-weight:700}
.tech{color:var(--fg3);font-size:14px}
details{border-top:1px solid var(--line);margin-top:24px;padding:16px 0;color:var(--fg2)}
summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
.notes{white-space:pre-line;font-size:18px;line-height:1.7}
nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap;position:sticky;bottom:0;padding:14px 16px;background:var(--panel);border-top:1px solid var(--line)}
button,select{font:inherit;min-height:44px;padding:8px 16px;max-width:100%;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg)}
button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--accent2);outline-offset:3px}
footer{font-size:13px;padding:12px 24px;color:var(--fg3)}
@media print{body{background:#fff;color:#111}article[hidden],article{display:block;break-after:page}nav,footer,details{display:none}main{padding:0}li{background:none}}
`;

const OFFLINE_DECK_SCRIPT = `(()=>{const slides=[...document.querySelectorAll('[data-slide]')];const prev=document.getElementById('prev');const next=document.getElementById('next');const jump=document.getElementById('jump');const status=document.getElementById('status');let index=0;function show(value){index=Math.max(0,Math.min(slides.length-1,value));slides.forEach((slide,i)=>{slide.hidden=i!==index});prev.disabled=index===0;next.disabled=index===slides.length-1;jump.value=String(index);status.textContent=(index+1)+' / '+slides.length;}function notes(){const d=slides[index].querySelector('details');if(d)d.open=!d.open;}prev.onclick=()=>show(index-1);next.onclick=()=>show(index+1);jump.onchange=()=>show(Number(jump.value));document.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest?.('button,select,input,textarea,summary,a,[contenteditable]'))return;const moves={ArrowRight:index+1,PageDown:index+1,' ':index+1,ArrowLeft:index-1,PageUp:index-1,Home:0,End:slides.length-1};if(Object.prototype.hasOwnProperty.call(moves,event.key)){event.preventDefault();show(moves[event.key]);return;}const key=event.key.toLowerCase();if(key==='n'||key==='s'){notes();}else if(key==='f'&&document.documentElement.requestFullscreen){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});}});show(0);})();`;

export function buildOfflineEngineeringDeck(slides: readonly ExportableDeckSlide[], locale: string): string {
  const ko = locale.startsWith("ko");
  const label = ko
    ? "오프라인 발표 백업 · 외부 영상과 서비스는 포함하지 않습니다."
    : "Offline presentation backup · External media and services are not included.";
  const shortcuts = ko ? "← → · Space · Home · End · N 노트 · F 전체 화면" : "← → · Space · Home · End · N notes · F fullscreen";
  const cards = slides.map((slide, index) => `<article data-slide${index ? " hidden" : ""}>
    <header>${escapeDeckHtml(slide.eyebrow)} · ${index + 1}/${slides.length}</header>
    <h1>${escapeDeckHtml(slide.title)}</h1><p class="lead">${escapeDeckHtml(slide.lead)}</p>
    ${slide.points.length ? `<ol>${slide.points.map((point) => `<li>${escapeDeckHtml(point)}</li>`).join("")}</ol>` : ""}
    ${slide.flow?.length ? `<p class="flow">${slide.flow.map(escapeDeckHtml).join(" → ")}</p>` : ""}
    ${slide.stack?.length ? `<p class="tech">${slide.stack.map(escapeDeckHtml).join(" · ")}</p>` : ""}
    <details><summary>${ko ? "발표자 노트 · 청중 화면에서는 닫아두세요" : "Speaker notes · Keep closed on the audience screen"}</summary><p class="notes">${escapeDeckHtml(slide.notes)}</p>${slide.question ? `<p>${escapeDeckHtml(slide.question)}</p>` : ""}</details>
  </article>`).join("\n");
  const options = slides.map((slide, index) => `<option value="${index}">${index + 1}. ${escapeDeckHtml(slide.title)}</option>`).join("");
  return `<!doctype html><html lang="${escapeDeckHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark"><title>ToonStudio · ${ko ? "오프라인 기술 발표" : "Offline engineering presentation"}</title>
<style>${OFFLINE_DECK_STYLE}</style></head><body><main>${cards}</main>
<nav aria-label="${ko ? "발표 조작" : "Presentation controls"}"><button id="prev">${ko ? "이전" : "Previous"}</button><button id="next">${ko ? "다음" : "Next"}</button><label>${ko ? "슬라이드" : "Slide"} <select id="jump">${options}</select></label><span id="status" role="status"></span></nav><footer>${label} ${shortcuts}</footer>
<script>${OFFLINE_DECK_SCRIPT}</script></body></html>`;
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
