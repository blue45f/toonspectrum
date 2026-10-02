import { useEffect, useState } from "react";
import { Eye, Heart, MapPinned, Play, Sparkles, X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioGalleryFrame, StudioGalleryStats } from "./studio-virtual-space-gallery";
import { useStudioVirtualSpaceGalleryViewer } from "./use-studio-virtual-space-gallery-viewer";

export interface StudioVirtualSpaceGalleryViewerProps {
  readonly frames: readonly StudioGalleryFrame[];
  readonly position: StudioVirtualSpacePoint | null;
  /** null이면 게스트. 관람은 자유롭고 좋아요만 로그인 안내로 분기한다. */
  readonly userId: string | null;
  readonly stats?: StudioGalleryStats;
  readonly onStatsChange?: (stats: StudioGalleryStats) => void;
  readonly onRequireLogin?: () => void;
}

/**
 * 전시관 뷰어: 작품에 다가가면 고해상도 이미지와 작가 노트를 보여 주고,
 * 조회수·좋아요를 집계한다. 도슨트 투어와 인기 작품 바로가기를 제공한다.
 */
export function StudioVirtualSpaceGalleryViewer({
  frames,
  position,
  userId,
  stats,
  onStatsChange,
  onRequireLogin,
}: StudioVirtualSpaceGalleryViewerProps) {
  const bt = useBilingual("StudioVirtualSpaceGalleryViewer");
  const viewer = useStudioVirtualSpaceGalleryViewer({
    frames, position, userId, stats, onStatsChange, onRequireLogin,
  });
  const frame = viewer.currentFrame;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loginNudge, setLoginNudge] = useState(false);

  // 작품이 바뀌면 고해상도 로딩 상태와 로그인 안내를 새로 시작한다.
  useEffect(() => {
    setImageLoaded(false);
    setLoginNudge(false);
  }, [frame?.id]);

  const handleLike = () => {
    const outcome = viewer.toggleLike();
    setLoginNudge(outcome === "login-required");
  };

  // 순위는 항상 매겨지지만, 실제로 본·좋아한 기록이 있는 작품만 인기 목록에 올린다.
  const popularFrames = viewer.popularFrames.filter((entry) => entry.views + entry.likes > 0);
  const currentIsPopular = frame !== null
    && viewer.currentStats.views + viewer.currentStats.likes > 0
    && viewer.popularIds.includes(frame.id);

  return (
    <section aria-label={bt("전시관", "Exhibition hall")}>
      <h2>{bt("전시관", "Exhibition hall")}</h2>
      <p className="space-panel-note">
        {bt(
          "작품 가까이 다가가면 크게 볼 수 있어요. 로그인 없이 관람하고, 좋아요는 로그인하면 남길 수 있어요.",
          "Walk up to a piece to see it up close. Viewing is free without signing in; liking asks you to sign in.",
        )}
      </p>

      {frame ? (
        <figure>
          <div>
            {frame.thumbnailUrl && !imageLoaded ? (
              <img src={frame.thumbnailUrl} alt="" aria-hidden loading="lazy" decoding="async" />
            ) : null}
            <img
              src={frame.imageUrl}
              alt={bt(frame.titleKo, frame.titleEn)}
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
            />
          </div>
          <figcaption>
            <h3>
              {bt(frame.titleKo, frame.titleEn)}
              {currentIsPopular ? (
                <span> · <Sparkles size={13} aria-hidden />{bt("인기 작품", "Popular")}</span>
              ) : null}
            </h3>
            <p>{bt(frame.artistNoteKo, frame.artistNoteEn)}</p>
            <p>
              <Eye size={14} aria-hidden /> {bt("조회", "Views")} {viewer.currentStats.views}
              {" · "}
              <Heart size={14} aria-hidden /> {bt("좋아요", "Likes")} {viewer.currentStats.likes}
            </p>
            <div>
              <button type="button" aria-pressed={viewer.liked} onClick={handleLike}>
                <Heart size={15} aria-hidden fill={viewer.liked ? "currentColor" : "none"} />
                {viewer.liked ? bt("좋아요 취소", "Unlike") : bt("좋아요", "Like")}
              </button>
              <button type="button" onClick={viewer.closeViewer}>
                <X size={15} aria-hidden />{bt("닫기", "Close")}
              </button>
            </div>
            {loginNudge ? (
              <p role="status">{bt("좋아요를 남기려면 로그인해 주세요. 관람은 계속할 수 있어요.", "Sign in to leave a like. You can keep viewing.")}</p>
            ) : null}
          </figcaption>
        </figure>
      ) : (
        <p className="space-panel-note">
          {bt("아직 가까이 있는 작품이 없어요. 벽에 걸린 작품 쪽으로 다가가 보세요.", "No artwork is close yet. Walk toward a piece on the wall.")}
        </p>
      )}

      <div>
        {viewer.docent ? (
          <>
            <p role="status">
              {bt(`도슨트 투어 ${viewer.docent.index + 1} / ${viewer.docent.total}`, `Docent tour ${viewer.docent.index + 1} / ${viewer.docent.total}`)}
            </p>
            <progress value={viewer.docent.progress} max={1} aria-label={bt("투어 진행률", "Tour progress")} />
            <button type="button" onClick={viewer.nextTourFrame}>{bt("다음 작품", "Next piece")}</button>
            <button type="button" onClick={viewer.stopTour}>{bt("투어 종료", "End tour")}</button>
          </>
        ) : (
          <button type="button" disabled={frames.length === 0} onClick={viewer.startTour}>
            <Play size={15} aria-hidden />{bt("도슨트 투어 시작", "Start docent tour")}
          </button>
        )}
      </div>

      {popularFrames.length > 0 ? (
        <>
          <h3>{bt("인기 작품", "Popular pieces")}</h3>
          <ul>
            {popularFrames.map(({ frame: item }) => (
              <li key={item.id}>
                <button type="button" onClick={() => viewer.selectFrame(item.id)}>
                  <MapPinned size={14} aria-hidden />{bt(item.titleKo, item.titleEn)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>{bt("전시 작품", "On display")}</h3>
      {frames.length === 0 ? (
        <p className="space-panel-note">{bt("아직 전시된 작품이 없어요.", "Nothing is on display yet.")}</p>
      ) : (
        <ul>
          {frames.map((item) => (
            <li key={item.id}>
              <button type="button" aria-pressed={frame?.id === item.id} onClick={() => viewer.selectFrame(item.id)}>
                {bt(item.titleKo, item.titleEn)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default StudioVirtualSpaceGalleryViewer;
