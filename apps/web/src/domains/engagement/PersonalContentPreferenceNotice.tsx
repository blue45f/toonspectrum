import { ShieldAlert } from "lucide-react";

import { useEngagement } from "./engagement-store";

import type { Title } from "@/shared/lib/types";

import Link from "@/compat/router-link";

export function PersonalContentPreferenceNotice({ title }: { readonly title: Title }) {
  const preferences = useEngagement((state) => state.tastePreferences);
  if (!preferences) return null;
  const avoided = new Set(preferences.avoidTags.map((tag) => tag.trim().toLocaleLowerCase("ko-KR")));
  const matchingTags = title.tags.filter((tag) => avoided.has(tag.trim().toLocaleLowerCase("ko-KR")));
  const intensityConflict = preferences.contentIntensity === "gentle"
    ? title.ageRating === "15" || title.ageRating === "19"
    : preferences.contentIntensity === "balanced" && title.ageRating === "19";
  if (matchingTags.length === 0 && !intensityConflict) return null;

  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-warn/35 bg-warn/10 p-4">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-black text-fg">내 감상 설정과 겹치는 정보가 있어요</p>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {matchingTags.length > 0 ? `카탈로그 태그: ${matchingTags.join(" · ")}. ` : ""}
          {intensityConflict ? `연령 등급: ${title.ageRating}세. ` : ""}
          이 표시는 작품의 기존 태그·등급과 개인 설정을 단순 비교한 것으로, 작가 승인 콘텐츠 경고나 장면별 안전 보증이 아닙니다.
        </p>
        <Link href="/onboarding/taste" className="mt-2 inline-flex min-h-8 items-center text-xs font-bold text-accent hover:underline">감상 설정 바꾸기</Link>
      </div>
    </aside>
  );
}
