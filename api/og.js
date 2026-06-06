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
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "toonspectrum.vercel.app").toString();
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
    const titleText = `${t.title} · 툰스펙트럼`;
    const desc = (t.synopsis || "").replace(/\s+/g, " ").trim().slice(0, 160) || `${t.title} — 툰스펙트럼에서 평점·플랫폼·가격을 한눈에.`;
    const img = t.coverImage
      ? (t.coverImage.startsWith("http") ? t.coverImage : `${proto}://${host}${t.coverImage.startsWith("/") ? "" : "/"}${t.coverImage}`)
      : `${proto}://${host}/og.png`;
    const url = `${proto}://${host}/title/${encodeURIComponent(slug)}`;
    const sub = [t.author, ...(t.genres || []).slice(0, 2)].filter(Boolean).join(" · ");
    const fullDesc = sub ? `${sub} — ${desc}` : desc;
    // 빌드된 index.html은 일부 메타 태그가 여러 줄로 포매팅되어 있어, 속성 사이 공백/줄바꿈을
    // 허용하는 전체-태그 매칭으로 치환한다. 치환값은 함수로 전달해 '$' 특수해석을 피한다.
    page = page
      .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(titleText)}</title>`)
      .replace(/<meta\s+name="description"[^>]*>/, () => `<meta name="description" content="${esc(fullDesc)}" />`)
      .replace(/<link\s+rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${esc(url)}" />`)
      .replace(/<meta\s+property="og:title"[^>]*>/, () => `<meta property="og:title" content="${esc(titleText)}" />`)
      .replace(/<meta\s+property="og:description"[^>]*>/, () => `<meta property="og:description" content="${esc(fullDesc)}" />`)
      .replace(/<meta\s+property="og:image"\s+content="[^>]*>/, () => `<meta property="og:image" content="${esc(img)}" />`)
      .replace(/<meta\s+property="og:url"[^>]*>/, () => `<meta property="og:url" content="${esc(url)}" />`)
      .replace(/<meta\s+name="twitter:title"[^>]*>/, () => `<meta name="twitter:title" content="${esc(titleText)}" />`)
      .replace(/<meta\s+name="twitter:description"[^>]*>/, () => `<meta name="twitter:description" content="${esc(fullDesc)}" />`)
      .replace(/<meta\s+name="twitter:image"[^>]*>/, () => `<meta name="twitter:image" content="${esc(img)}" />`);

    // 구조화 데이터(schema.org) — 작품을 Book으로, 평점이 있으면 aggregateRating 포함(별점 리치 결과).
    const st = t.stats || {};
    const ratingCount = Number(st.ratingCount) || 0;
    const ratingValue = Number(st.ratingAvg) || 0;
    const work = {
      "@type": "Book",
      "@id": `${url}#work`,
      name: t.title,
      url,
      inLanguage: "ko",
    };
    if (t.author) work.author = { "@type": "Person", name: t.author };
    if (fullDesc) work.description = fullDesc;
    if (img) work.image = img;
    if (Array.isArray(t.genres) && t.genres.length) work.genre = t.genres;
    if (t.releaseYear) work.datePublished = String(t.releaseYear);
    if (ratingCount > 0 && ratingValue > 0) {
      work.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: Math.round(ratingValue * 10) / 10,
        ratingCount,
        bestRating: 5,
        worstRating: 1,
      };
    }
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        work,
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "홈", item: `${proto}://${host}/` },
            { "@type": "ListItem", position: 2, name: t.title, item: url },
          ],
        },
      ],
    };
    // </script> 조기 종료·HTML 주입 방지를 위해 '<'를 유니코드 이스케이프.
    const ldJson = JSON.stringify(ld).replace(/</g, "\\u003c");
    page = page.replace(
      /<\/head>/,
      `<script type="application/ld+json">${ldJson}</script></head>`
    );
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // 성공(작품 메타 주입)한 경우만 캐시 — 콜드스타트로 메타 주입 실패한 응답이 캐시에 박히지 않게.
  res.setHeader("Cache-Control", t ? "public, max-age=300, s-maxage=86400" : "no-store");
  return res.status(200).send(page);
};
