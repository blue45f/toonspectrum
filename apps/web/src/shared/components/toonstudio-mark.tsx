import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import { cx } from "@/shared/lib/cx";

export function ToonStudioMark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.65rem] border border-line/70 bg-canvas shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]",
        className
      )}
      aria-hidden
    >
      <img src={resolveAssetUrl("/brand/spectrum-ribbon-v2/icon-192.png")} alt="" className="size-full object-cover" decoding="async" />
    </span>
  );
}
