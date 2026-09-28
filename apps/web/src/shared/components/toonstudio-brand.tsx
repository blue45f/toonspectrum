import { cx } from "@/shared/lib/cx";

import { ToonStudioMark } from "./visual-marks";

import "./toonstudio-brand.css";

/** 시각 워드마크는 모든 언어에서 유지하고 주변 설명은 소비자가 번역한다. */
export function ToonStudioWordmark({ className }: { readonly className?: string }) {
  return <span className={cx("toonstudio-wordmark", className)} data-toonstudio-wordmark="true">
    <span>Toon</span><span className="toonstudio-wordmark__studio">Studio</span>
  </span>;
}

/** 링크·제목·문서 이탈 처리는 각 화면이 소유하며 브랜드는 표시만 담당한다. */
export function ToonStudioBrand({ className, markClassName, wordmarkClassName }: {
  readonly className?: string;
  readonly markClassName?: string;
  readonly wordmarkClassName?: string;
}) {
  return <span className={cx("toonstudio-brand", className)}>
    <ToonStudioMark className={markClassName} />
    <ToonStudioWordmark className={wordmarkClassName} />
  </span>;
}
