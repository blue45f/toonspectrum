import type { JSX, ReactNode } from "react";

import "./motion-assets-effects.css";
import { motionAssetClass, resolveAssetSize, useMotionAssetLang, type MotionAssetSize } from "./motion-assets-engine";
import {
  MotionIllustration,
  type MotionIllustrationName,
} from "./motion-assets-illustrations";
import {
  getMotionAssetLabels,
} from "./motion-assets-labels";

/**
 * 테마 일러스트 빈 상태: 검색 결과 없음 / 데이터 없음 / 에러 / 로딩.
 * 각각 전용 일러스트 + 행동 유도 버튼 슬롯.
 */

export type MotionEmptyKind = "search" | "empty" | "error" | "loading";

const KIND_ILLUSTRATION: Record<MotionEmptyKind, MotionIllustrationName> = {
  search: "eye",
  empty: "webtoon-panels",
  error: "shout-bubble",
  loading: "magic-wand",
};

export interface MotionEmptyStateProps {
  kind: MotionEmptyKind;
  /** 제목 (미지정 시 기본 문구). */
  title?: string;
  /** 설명 (미지정 시 기본 문구). */
  description?: string;
  /** 행동 유도 버튼 슬롯. */
  action?: ReactNode;
  /** 일러스트 크기. 기본 lg(160). */
  illustrationSize?: MotionAssetSize;
  className?: string;
  lang?: "ko" | "en";
}

/**
 * @example
 * <MotionEmptyState kind="search" action={<button onClick={reset}>필터 초기화</button>} />
 * <MotionEmptyState kind="empty" title="첫 컷을 그려보세요" action={<button>새 원고 만들기</button>} />
 */
export function MotionEmptyState({
  kind,
  title,
  description,
  action,
  illustrationSize = "lg",
  className,
  lang,
}: MotionEmptyStateProps): JSX.Element {
  const detectedLang = useMotionAssetLang();
  const resolvedLang = lang ?? detectedLang;
  const labels = getMotionAssetLabels(resolvedLang);
  const defaultTitle =
    kind === "search" ? labels.emptySearchTitle
    : kind === "empty" ? labels.emptyDataTitle
    : kind === "error" ? labels.emptyErrorTitle
    : labels.emptyLoadingTitle;
  const defaultDescription =
    kind === "search" ? labels.emptySearchDescription
    : kind === "empty" ? labels.emptyDataDescription
    : kind === "error" ? labels.emptyErrorDescription
    : labels.emptyLoadingDescription;

  return (
    <div
      className={motionAssetClass(className)}
      data-motion-empty={kind}
      role={kind === "error" ? "alert" : "status"}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "40px 24px",
        gap: 6,
      }}
    >
      <div className="ma-empty-figure" style={{ marginBottom: 10, opacity: 0.9 }}>
        <MotionIllustration name={KIND_ILLUSTRATION[kind]} size={illustrationSize} />
      </div>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title ?? defaultTitle}</h3>
      <p style={{ margin: "4px 0 0", fontSize: 13.5, opacity: 0.65, maxWidth: 340, lineHeight: 1.6 }}>
        {description ?? defaultDescription}
      </p>
      {action ? <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{action}</div> : null}
      {kind === "loading" ? (
        <span
          aria-hidden="true"
          style={{
            marginTop: 10,
            width: Math.max(120, resolveAssetSize(illustrationSize) * 0.9),
            height: 6,
            borderRadius: 3,
            background: "color-mix(in srgb, currentColor 12%, transparent)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <span
            className="ma-anim-shimmer"
            style={{
              position: "absolute",
              inset: 0,
              width: "40%",
              borderRadius: 3,
              background: "currentColor",
              opacity: 0.55,
            }}
          />
        </span>
      ) : null}
    </div>
  );
}
