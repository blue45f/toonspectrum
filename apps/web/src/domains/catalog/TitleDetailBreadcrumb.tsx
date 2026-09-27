import { ArrowLeft, ChevronRight } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailBreadcrumb", ko, en);

/** 직접 진입하거나 상세 조회가 실패해도 실제 작품 목록으로 돌아갈 수 있다. */
export function TitleDetailBreadcrumb({ title }: { title?: string }) {
  useBilingualI18nRevision();
  const current = title || bi("작품 상세", "Story details");
  return (
    <nav aria-label={bi("작품 탐색 경로", "Story navigation")} className="relative mb-5 min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm">
        <li className="shrink-0">
          <Link href="/explore" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <ArrowLeft size={16} aria-hidden="true" />
            {bi("작품 목록", "Story list")}
          </Link>
        </li>
        <li aria-hidden="true" className="shrink-0 text-fg-3"><ChevronRight size={14} /></li>
        <li aria-current="page" className="min-w-0 truncate text-fg-3" title={current}>{current}</li>
      </ol>
    </nav>
  );
}
