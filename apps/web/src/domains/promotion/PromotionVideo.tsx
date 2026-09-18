import { Play } from "lucide-react";
import { useState } from "react";

import { promotionVideo } from "../../../../../packages/core/src/promotion";

export function PromotionVideo({ url, title }: { url: string; title: string }) {
  const media = promotionVideo(url);
  if (!media) return null;
  return <PromotionVideoPlayer key={media.embedUrl} media={media} title={title} />;
}

function PromotionVideoPlayer({ media, title }: { media: NonNullable<ReturnType<typeof promotionVideo>>; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return <section className="pc-video" aria-label="홍보 영상">
    {loaded ? <iframe title={`${title} 홍보 영상`} src={media.embedUrl} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <button type="button" className="pc-video-gate" onClick={() => setLoaded(true)}><Play size={36} aria-hidden="true" /><strong>홍보 영상 보기</strong><span>클릭하면 {media.provider} 플레이어에 연결돼요.</span></button>}
    <p className="pc-caption">자동 재생하지 않습니다. 재생 제한·연령 확인이 있으면 <a href={media.url} target="_blank" rel="noopener noreferrer">{media.provider}에서 보기 ↗</a></p>
  </section>;
}
