import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { isAllowedImageDataUrl } from "@/shared/lib/image-attach";
import { cn } from "@/shared/lib/utils";

// 첨부 이미지 그리드 — 서버 검증을 거치지만 레거시/손상 행도 방어적으로 다시 거른다.
export function FanPostImages({ title, images }: { title: string; images?: string[] }) {
  const list = (images ?? []).filter(isAllowedImageDataUrl);
  if (list.length === 0) return null;
  return (
    <div className={cn("mt-3 grid gap-2", list.length === 1 ? "grid-cols-1 sm:max-w-sm" : "grid-cols-2 sm:grid-cols-3")}>
      {list.map((src, index) => (
        <img
          key={`${index}-${src.slice(-24)}`}
          src={src}
          alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.community.components.fan.cafe.images", "ko", "{v0} 첨부 이미지 {v1}"), { v0: String(title), v1: String(index + 1) })}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full rounded-xl border border-line object-cover",
            list.length === 1 ? "max-h-96 object-contain bg-canvas/40" : "aspect-square"
          )}
        />
      ))}
    </div>
  );
}
