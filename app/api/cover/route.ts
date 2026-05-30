import { NextRequest } from "next/server";

// 표지 이미지 프록시 — 네이버/카카오 이미지 CDN 핫링크/CORS 우회.
// 허용 호스트만 프록시하고, 리다이렉트도 매 홉 재검증하여 SSRF 차단.
const ALLOWED = /(^|\.)(pstatic\.net|kakaopagecdn\.com|kakaocdn\.net)$/;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const allowed = (url: URL) => url.protocol === "https:" && ALLOWED.test(url.hostname);
const refererFor = (hostname: string) =>
  /kakao/.test(hostname) ? "https://webtoon.kakao.com/" : "https://comic.naver.com/";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });

  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!allowed(url)) return new Response("forbidden host", { status: 403 });

  try {
    // 리다이렉트를 수동 추적하며 각 홉의 호스트를 허용목록으로 재검증 (open-redirect → 내부/외부 SSRF 방지)
    let upstream: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url.toString(), {
        headers: {
          Referer: refererFor(url.hostname), // CDN referer 검사 우회 (호스트별)
          "User-Agent": UA,
          Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        },
        redirect: "manual",
        next: { revalidate: 86400 }, // 이미지 CDN 캐시 활용
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return new Response("bad redirect", { status: 502 });
        let next: URL;
        try {
          next = new URL(loc, url);
        } catch {
          return new Response("bad redirect", { status: 502 });
        }
        if (!allowed(next)) return new Response("forbidden redirect", { status: 403 });
        url = next;
        continue;
      }
      upstream = res;
      break;
    }
    if (!upstream) return new Response("too many redirects", { status: 502 });
    if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    // 이미지만 통과 — 프록시를 임의 콘텐츠 페치 수단으로 악용하지 못하도록
    if (!contentType.startsWith("image/")) return new Response("not an image", { status: 415 });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return new Response("fetch failed", { status: 502 });
  }
}
