/**
 * 팬 리믹스 원작 배지 — 리믹스 클립에 강제 표시되는 원작 정보.
 *
 * 메타(`clip.remix`)가 있을 때만 렌더링되고, 작품명은 원작 페이지로
 * 링크된다. 팬이 지우거나 바꿀 수 있는 UI는 어디에도 두지 않는다.
 */

import { Shuffle } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { CutsClip } from "./cuts-types";

import "./cuts.css";

export function CutsRemixBadge({
  clip,
}: Readonly<{ clip: CutsClip }>) {
  const t = useBilingual("cuts");
  const remix = clip.remix;
  if (!remix) return null;
  return (
    <p className="cuts-remix-badge">
      <Shuffle size={13} aria-hidden="true" />
      <span>{t("팬 리믹스", "Fan remix")}</span>
      <span aria-hidden="true">·</span>
      <span>
        {t("원작", "Original")}{" "}
        <Link href={remix.originalHref} className="cuts-remix-badge__link">
          {remix.title}
        </Link>{" "}
        ({remix.author})
      </span>
    </p>
  );
}
