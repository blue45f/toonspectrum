/* eslint-disable no-undef -- Vercel Node CJS 서버리스 함수 */
// 작품 상세(/title/:slug) SNS 공유용 — 크롤러(카카오/페북/트위터 등)에는 작품별 OG 메타를
// 주입한 HTML을, 사람에게는 평소 SPA 셸을 그대로 준다(추가 지연 없음).
const fs = require("fs");
const path = require("path");

let TEMPLATE = null;
function template() {
  if (TEMPLATE === null) {
    for (const p of [path.join(process.cwd(), "dist", "index.html"), path.join(__dirname, "..", "dist", "index.html")]) {
      try { TEMPLATE = fs.readFileSync(p, "utf8"); break; } catch { /* try next */ }
    }
    if (TEMPLATE === null) TEMPLATE = "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>";
  }
  return TEMPLATE;
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const BOT_RE = /bot|crawl|spider|facebookexternalhit|kakaotalk|slack|twitter|discord|whatsapp|telegram|line|pinterest|embedly|preview|naver|daum|skype|vkshare/i;

module.exports = async (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0];
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "webtoon-index.vercel.app").toString();
  const slug = decodeURIComponent((req.query?.slug || "").toString());
  const ua = (req.headers["user-agent"] || "").toString();

  // 사람: 평소 SPA 셸(빠름). 크롤러만 작품 메타 주입.
  if (!BOT_RE.test(ua)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(template());
  }

  let t = null;
  try {
    const r = await fetch(`${proto}://${host}/api/titles/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(22000), // API 콜드스타트(카탈로그 적재) 여유
    });
    if (r.ok) t = (await r.json())?.title ?? null;
  } catch { /* fall back to default OG */ }

  let page = template();
  if (t) {
    const titleText = `${t.title} · WEBDEX`;
    const desc = (t.synopsis || "").replace(/\s+/g, " ").trim().slice(0, 160) || `${t.title} — WEBDEX에서 평점·플랫폼·가격을 한눈에.`;
    const img = t.coverImage
      ? (t.coverImage.startsWith("http") ? t.coverImage : `${proto}://${host}${t.coverImage.startsWith("/") ? "" : "/"}${t.coverImage}`)
      : `${proto}://${host}/og.png`;
    const url = `${proto}://${host}/title/${encodeURIComponent(slug)}`;
    const sub = [t.author, ...(t.genres || []).slice(0, 2)].filter(Boolean).join(" · ");
    const fullDesc = sub ? `${sub} — ${desc}` : desc;
    page = page
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(titleText)}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(titleText)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(fullDesc)}$2`)
      .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(img)}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(titleText)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(fullDesc)}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(img)}$2`);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // 성공(작품 메타 주입)한 경우만 캐시 — 콜드스타트로 메타 주입 실패한 응답이 캐시에 박히지 않게.
  res.setHeader("Cache-Control", t ? "public, max-age=300, s-maxage=86400" : "no-store");
  return res.status(200).send(page);
};
