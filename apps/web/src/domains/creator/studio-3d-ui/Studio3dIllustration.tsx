import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-3d-illustrated-chrome.css";

const ART_BASE = "/brand/illustrated-20260928";
// 정본(720px) 외에 320·640px 파생본이 있어 좁은 화면은 작은 파일만 받는다(원본보다 확대하지 않는다).
const PORTRAIT_SIZES = "(max-width: 1023px) 190px, 320px";

function Portrait({ name }: { readonly name: "character-pink" | "character-blue" }) {
  return (
    <img
      src={`${ART_BASE}/${name}.webp`}
      srcSet={`${ART_BASE}/${name}-320.webp 320w, ${ART_BASE}/${name}-640.webp 640w, ${ART_BASE}/${name}.webp 720w`}
      sizes={PORTRAIT_SIZES}
      alt=""
      width={720}
      height={900}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * 안내용 아트는 실제 사용자 모델·렌더 결과와 구분해 표시한다.
 * `compact`는 항상 낮은 비율, `responsiveCompact`는 휴대폰 폭에서만 낮은 비율을 쓴다(첫 화면 높이 절약).
 */
export function Studio3dIllustration({
  compact = false,
  responsiveCompact = false,
}: {
  readonly compact?: boolean;
  readonly responsiveCompact?: boolean;
}) {
  const bt = useBilingual("Studio3dIllustration");
  return (
    <figure
      className="studio-3d-illustration"
      data-compact={compact || undefined}
      data-responsive-compact={responsiveCompact || undefined}
    >
      <div className="studio-3d-illustration__portraits" aria-hidden="true">
        <Portrait name="character-pink" />
        <Portrait name="character-blue" />
      </div>
      <figcaption>
        <span>CHARACTER STUDIO</span>
        <strong>{bt("캐릭터의 첫 장면을 준비하세요", "Prepare your character’s first scene")}</strong>
        <small>{bt("창작 영감을 위한 예시 일러스트", "Illustrations for creative inspiration")}</small>
      </figcaption>
    </figure>
  );
}
