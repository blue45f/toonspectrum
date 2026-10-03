import { cn } from "@/shared/lib/utils";

/**
 * 번호가 붙은 짧은 단계 목록 — "처음이라면 30초 안내"처럼 순서대로 읽는 세 줄 안내에 쓴다.
 * 순서가 의미 있으므로 `<ol>`로 읽히고, 번호 원은 장식(aria-hidden)이다. 넓은 화면에서는 단계 수만큼 한 줄에 놓인다.
 */
export function SiteStepList({
  steps,
  className,
}: {
  readonly steps: readonly string[];
  readonly className?: string;
}) {
  return (
    <ol className={cn("grid gap-2 text-sm leading-6 text-fg-2", steps.length === 3 && "md:grid-cols-3", className)}>
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 rounded-xl border border-line bg-card/60 p-3">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {index + 1}
          </span>
          <span className="min-w-0 break-keep">{step}</span>
        </li>
      ))}
    </ol>
  );
}
