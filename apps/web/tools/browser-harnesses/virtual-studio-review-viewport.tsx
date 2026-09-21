import { useState } from "react";
import { createRoot } from "react-dom/client";

import { StudioReviewCompareDisplay } from "../../src/domains/creator/virtual-space/StudioReviewCompareDisplay";

import type { StudioVirtualSpaceReviewPreview } from "../../src/domains/creator/virtual-space/studio-virtual-space-review-preview";
import "../../src/styles/globals.css";

// Local layout fixture, not authentication, server approval or a production document.
const image = (label: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="6000"><rect width="800" height="6000" fill="white"/>${Array.from({ length: 12 }, (_, i) => `<rect x="30" y="${i * 500 + 40}" width="740" height="400" rx="12" fill="${i % 2 ? "#dddddd" : "#eeeeee"}" stroke="black"/><text x="70" y="${i * 500 + 110}" font-size="40">${label} / ${i + 1}</text>`).join("")}</svg>`)}`;
function preview(side: "left" | "right", pageId: string, renewal: number): StudioVirtualSpaceReviewPreview {
  return { ordinal: 0, sha256: (side === "left" ? "a" : "b").repeat(64), byteLength: 2048,
    mediaType: "image/png", url: image(side) + `#renewal-${renewal}`, expiresAt: Date.now() + 30_000,
    mapping: { status: "mapped", version: 1, sourceServerRevision: side === "left" ? 2 : 1,
      sourceContentDigest: (side === "left" ? "c" : "d").repeat(64),
      page: { id: pageId, ordinal: 0, width: 800, height: 6000, renderWidth: 800, renderHeight: 6000, frames: [], elements: [] } } };
}
function Fixture() {
  const [linked, setLinked] = useState(false);
  const [pageId, setPageId] = useState("fixture-page");
  const [renewal, setRenewal] = useState(0);
  return <main className="mx-auto max-w-6xl p-4 text-fg">
    <h1 className="text-xl font-bold">검수 비교 위치 보존 · 로컬 테스트</h1>
    <p className="my-3 text-sm">실제 비교 컴포넌트와 합성 원고입니다. 서버 권한 검증을 대신하지 않습니다.</p>
    <div className="mb-4 flex flex-wrap gap-3">
      <label><input type="checkbox" checked={linked} onChange={(event) => setLinked(event.target.checked)} /> 같은 페이지 연결</label>
      <button type="button" className="min-h-11 border px-3" onClick={() => setRenewal((value) => value + 1)}>미리보기 주소 갱신</button>
      <button type="button" className="min-h-11 border px-3" onClick={() => setPageId((value) => value === "fixture-page" ? "another-page" : "fixture-page")}>원본 페이지 변경</button>
    </div>
    <StudioReviewCompareDisplay left={preview("left", pageId, renewal)} right={preview("right", "fixture-page", renewal)} linked={linked} />
  </main>;
}
const host = document.getElementById("test-root");
if (!host) throw new Error("Viewport fixture root is missing");
createRoot(host).render(<Fixture />);
