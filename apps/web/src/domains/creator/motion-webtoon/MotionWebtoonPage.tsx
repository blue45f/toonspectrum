/**
 * 모션 웹툰 페이지 (`/studio/motion-webtoon`).
 *
 * MotionWebtoonEditor를 호스팅하고 회차를 localStorage에 자동 저장한다.
 * 공유 링크(#motion-episode=<id>)로 들어오면 저장된 회차를 복원한다.
 */

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { MotionWebtoonEditor } from "./MotionWebtoonEditor";
import { MOTION_WEBTOON_UI_LABELS } from "./motion-webtoon-labels";
import {
  createMotionId,
  type MotionEpisode,
} from "./motion-webtoon-model";
import {
  loadLastEpisodeId,
  loadMotionEpisode,
  parseShareHashId,
  saveMotionEpisode,
} from "./motion-webtoon-storage";
import "./motion-webtoon.css";

const L = MOTION_WEBTOON_UI_LABELS;

type PageNotice =
  | { readonly kind: "restored" }
  | { readonly kind: "share-not-found" }
  | { readonly kind: "resumed" }
  | null;

function createEmptyEpisode(): MotionEpisode {
  const characterId = createMotionId("char");
  return {
    id: createMotionId("episode"),
    titleKo: "새 회차",
    titleEn: "New episode",
    characters: [
      { id: characterId, nameKo: "주인공", nameEn: "Hero", presetId: "narrator" },
    ],
    cuts: [],
  };
}

interface InitialState {
  readonly episode: MotionEpisode;
  readonly notice: PageNotice;
}

/** 첫 렌더에서 한 번만 초기 상태를 계산한다 (해시 파싱·복원). */
function resolveInitialState(): InitialState {
  if (typeof window === "undefined") {
    return { episode: createEmptyEpisode(), notice: null };
  }
  const shareId = parseShareHashId(window.location.hash);
  if (shareId) {
    const shared = loadMotionEpisode(shareId);
    // 해시는 한 번 소비하고 지운다 — 새로고침해도 복원 공지가 반복되지 않는다.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (shared) {
      saveMotionEpisode(shared);
      return { episode: shared, notice: { kind: "restored" } };
    }
    const lastId = loadLastEpisodeId();
    const last = lastId ? loadMotionEpisode(lastId) : null;
    return { episode: last ?? createEmptyEpisode(), notice: { kind: "share-not-found" } };
  }
  const lastId = loadLastEpisodeId();
  const last = lastId ? loadMotionEpisode(lastId) : null;
  if (last) {
    return { episode: last, notice: { kind: "resumed" } };
  }
  return { episode: createEmptyEpisode(), notice: null };
}

export function MotionWebtoonPage(): JSX.Element {
  const t = useBilingual("motion-webtoon");
  const [initial] = useState<InitialState>(resolveInitialState);
  const [notice, setNotice] = useState<PageNotice>(initial.notice);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 8000);
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, [notice]);

  const handleChange = (episode: MotionEpisode): void => {
    saveMotionEpisode(episode);
  };

  const noticeText = (current: Exclude<PageNotice, null>): string => {
    switch (current.kind) {
      case "restored":
        return t(L.pageRestoredNotice.titleKo, L.pageRestoredNotice.titleEn);
      case "share-not-found":
        return t(L.pageShareNotFound.titleKo, L.pageShareNotFound.titleEn);
      case "resumed":
        return t(L.pageResumeNotice.titleKo, L.pageResumeNotice.titleEn);
    }
  };

  return (
    <div className="mw-page">
      {notice && (
        <p className="mw-page-notice" role="status">
          {noticeText(notice)}
        </p>
      )}
      <MotionWebtoonEditor initialEpisode={initial.episode} onChange={handleChange} />
    </div>
  );
}
