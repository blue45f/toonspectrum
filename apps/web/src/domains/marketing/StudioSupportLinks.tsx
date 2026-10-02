import { ArrowRight } from "lucide-react";

import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { INTRO_CARD } from "./public/intro-tokens";
import { STUDIO_DEPTH_LINKS, STUDIO_SUPPORT_TILES } from "./studio-tour-content";

const SCOPE = "domains.marketing.StudioSupportLinks";

/** 작품 밖으로 나가지 않고 재료·사람·도움을 찾는 세 입구와, 더 깊이 읽을 소개 페이지 링크. */
export function StudioSupportLinks() {
  const bi = useBilingualLocalizer(SCOPE);
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3 md:grid-cols-3" aria-label={bi("재료·사람·도움", "Assets, people and help")}>
        {STUDIO_SUPPORT_TILES.map((tile) => {
          const Icon = tile.icon;
          const copy = bi(tile.ko, tile.en);
          return (
            <li key={tile.id} className="min-w-0">
              <Link href={tile.href} className={`${INTRO_CARD} group grid h-full grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 p-3 md:grid-cols-1 md:p-4`}>
                <WorkflowIllustration kind={tile.art} decorative sizes="(max-width: 767px) 104px, 360px" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-accent"><Icon size={14} aria-hidden="true" />{copy.tag}</span>
                  <span className="mt-1 block break-keep font-bold leading-snug text-fg">{copy.title}</span>
                  <span className="mt-1 hidden break-keep text-sm leading-6 text-fg-2 md:block">{copy.body}</span>
                  <span className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-accent">{bi("열기", "Open")}<ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label={bi("더 깊이 알아보기", "Go deeper")}>
        {STUDIO_DEPTH_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-2 hover:text-fg">
              {bi(link.ko, link.en)}<ArrowRight size={13} className="text-accent" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
