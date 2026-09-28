import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-3d-illustrated-chrome.css";

/** 안내용 아트는 실제 사용자 모델·렌더 결과와 구분해 표시한다. */
export function Studio3dIllustration({ compact = false }: { readonly compact?: boolean }) {
  const bt = useBilingual("Studio3dIllustration");
  return (
    <figure className="studio-3d-illustration" data-compact={compact || undefined}>
      <div className="studio-3d-illustration__portraits" aria-hidden="true">
        <img src="/brand/illustrated-20260928/character-pink.webp" alt="" width={720} height={900} loading="lazy" decoding="async" />
        <img src="/brand/illustrated-20260928/character-blue.webp" alt="" width={720} height={900} loading="lazy" decoding="async" />
      </div>
      <figcaption>
        <span>CHARACTER STUDIO</span>
        <strong>{bt("캐릭터의 첫 장면을 준비하세요", "Prepare your character’s first scene")}</strong>
        <small>{bt("창작 영감을 위한 예시 일러스트", "Illustrations for creative inspiration")}</small>
      </figcaption>
    </figure>
  );
}
