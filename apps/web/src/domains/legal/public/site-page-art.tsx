import type { ReactNode } from "react";

import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import type { WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";

/**
 * 공개 페이지 헤더 오른쪽에 두는 콘셉트 아트 — 스타라이트 톤의 워크플로 일러스트를 쓰고,
 * 실제 편집 화면이 아니라는 점을 캡션으로 함께 밝힌다.
 */
export function SitePageArt({
  kind,
  caption,
  priority = false,
}: {
  readonly kind: WorkflowVisual;
  readonly caption: ReactNode;
  readonly priority?: boolean;
}) {
  return (
    <figure className="m-0">
      <WorkflowIllustration kind={kind} priority={priority} sizes="(max-width: 1023px) 100vw, 24rem" />
      <figcaption className="mt-2 flex items-center gap-2 text-[0.7rem] leading-5 text-fg-3">
        <span aria-hidden="true" className="h-px w-5 shrink-0 bg-accent" />
        {caption}
      </figcaption>
    </figure>
  );
}
