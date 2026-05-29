import { NextRequest } from "next/server";

// 표지 이미지 프록시 — 네이버 이미지 CDN 핫링크/CORS 우회.
// 허용 호스트(pstatic.net)만 프록시하여 SSRF 차단.
const ALLOWED = /(^|\.)pstatic\.net$/;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });

  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.test(url.hostname)) {
    return new Response("forbidden host", { status: 403 });
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: {
        // 네이버 CDN 은 referer 검사 → 네이버 referer 로 우회
        Referer: "https://comic.naver.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      // 이미지 CDN 캐시 활용
      next: { revalidate: 86400 },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("upstream error", { status: 502 });
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
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
