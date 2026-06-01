import { ImageResponse } from "next/og";
import { findTitle } from "@/lib/server/title";
import { TYPE_LABEL, STATUS_LABEL } from "@/lib/taxonomy";
import { statsAreEstimated } from "@/lib/estimate";

export const alt = "WEBDEX";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 제목 글자를 포함해 서브셋 폰트만 로드 (경량)
async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const src = css.match(/src:\s*url\(([^)]+)\)\s*format/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = findTitle(slug);
  const title = t?.title ?? "WEBDEX";
  const type = t ? TYPE_LABEL[t.type] : "";
  const status = t ? STATUS_LABEL[t.status] : "";
  const genres = t?.genres.slice(0, 3).join("  ·  ") ?? "";
  const rating = t ? t.stats.ratingAvg.toFixed(1) : "";
  const estimated = t ? statsAreEstimated(t) : false;
  const author = t?.author ?? "";

  const text = `WEBDEX웹툰·웹소설 통합 인덱스 별점★ 추정 ${title} ${genres} ${type} ${status} ${author}`;
  const font = await loadKoreanFont(text);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#16130d",
          padding: "72px 80px",
          fontFamily: "NotoKR",
          color: "#f3ede1",
        }}
      >
        {/* 상단: 스펙트럼 바 + 워드마크 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              width: 200,
              height: 10,
              borderRadius: 999,
              background: "linear-gradient(90deg,#ff5d8f,#9b7bff,#5a8cff,#ef6f3c)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, color: "#b9b1a2" }}>
            <span style={{ fontWeight: 800, letterSpacing: -1, color: "#f3ede1" }}>WEBDEX</span>
            <span>웹툰·웹소설 통합 인덱스</span>
          </div>
        </div>

        {/* 중앙: 제목 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 14, fontSize: 28, color: "#ef6f3c", fontWeight: 800 }}>
            <span>{type}</span>
            {genres && <span style={{ color: "#b9b1a2", fontWeight: 400 }}>{genres}</span>}
          </div>
          <div style={{ fontSize: title.length > 16 ? 76 : 100, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {title}
          </div>
          {author && <div style={{ fontSize: 30, color: "#b9b1a2" }}>{author}</div>}
        </div>

        {/* 하단: 평점 */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 40, fontWeight: 800 }}>
          <span style={{ color: "#ef6f3c" }}>★ {rating}</span>
          {estimated && <span style={{ fontSize: 28, color: "#b9b1a2", fontWeight: 400 }}>· 추정</span>}
          {status && <span style={{ fontSize: 28, color: "#b9b1a2", fontWeight: 400 }}>· {status}</span>}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "NotoKR", data: font, weight: 800 as const, style: "normal" as const }] : [],
    }
  );
}
