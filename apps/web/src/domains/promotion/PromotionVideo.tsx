import { Play } from "lucide-react";
import { useState } from "react";

import { promotionVideo } from "../../../../../packages/core/src/promotion";

export function PromotionVideo({ url, title }: { url: string; title: string }) {
  const media = promotionVideo(url);
  const [loadedUrl, setLoadedUrl] = useState("");
  if (!media) return null;
  return <section className="pc-video" aria-label="홍보 영상">
    {loadedUrl === media.embedUrl ? <iframe title={`${title} 홍보 영상`} src={media.embedUrl} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <button type="button" className="pc-video-gate" onClick={() => setLoadedUrl(media.embedUrl)}><Play size={36} aria-hidden="true" /><strong>홍보 영상 보기</strong><span>클릭하면 {media.provider} 플레이어에 연결돼요.</span></button>}
    <p className="pc-caption">자동 재생하지 않습니다. 재생 제한·연령 확인이 있으면 <a href={media.url} target="_blank" rel="noopener noreferrer">{media.provider}에서 보기 ↗</a></p>
  </section>;
}
