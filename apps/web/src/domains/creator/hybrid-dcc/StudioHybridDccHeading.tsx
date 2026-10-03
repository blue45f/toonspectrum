import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 정밀 3D 모델링 화면의 제목. 편집기 메뉴 이름("정밀 3D 모델링…")과 같은 이름을 쓰고,
 * 부제는 기술 용어 대신 무엇을 하는 곳인지 한 줄로 말한다. 라우트 게이트(로딩)와
 * 실제 작업대가 같은 제목을 써야 화면이 바뀌어도 같은 곳임을 알 수 있다.
 */
export function StudioHybridDccHeading({ titleId }: { readonly titleId: string }) {
  const bt = useBilingual("StudioHybridDccHeading");
  return (
    <div className="min-w-0 flex-1">
      <h2 id={titleId} className="truncate text-sm font-semibold tracking-tight text-fg sm:text-base">
        {bt("정밀 3D 모델링", "Precision 3D modeling")}
      </h2>
      <p className="line-clamp-2 text-xs leading-snug text-fg-2 [word-break:keep-all] sm:line-clamp-1">
        {bt(
          "웹툰 배경·소품을 3D로 만들어 여러 컷에서 다시 쓰는 작업대",
          "Build props and sets in 3D, then reuse them across panels",
        )}
      </p>
    </div>
  );
}
