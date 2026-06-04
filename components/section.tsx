import Link from "@/src/compat/router-link";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { buttonClass } from "./ui/button";

export function Section({
  eyebrow,
  title,
  desc,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(className)}>
      <header className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5 text-accent">{eyebrow}</p>}
          <h2 className="text-pretty text-xl font-bold tracking-tight text-fg sm:text-2xl">
            {title}
          </h2>
          {desc && <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{desc}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className={buttonClass({ size: "sm", variant: "quiet", className: "group gap-1" })}
            // 링크 접근명에 섹션 제목을 포함해 "전체 보기" 같은 모호한 링크텍스트 문제 방지(문자열 제목 한정).
            aria-label={typeof title === "string" ? `${title} ${action.label}` : `${action.label} 바로가기`}
          >
            {action.label}
            <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

// 가로 스크롤 레일
export function Rail({
  children,
  className,
  itemClassName = "w-[150px] sm:w-[172px]",
}: {
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div className={cn("rail -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0", className)}>
      {children.map((child, i) => (
        <div key={i} className={cn("shrink-0 snap-start", itemClassName)}>
          {child}
        </div>
      ))}
    </div>
  );
}

// 페이지 컨테이너
export function Container({
  children,
  className,
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "wide" | "prose";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        size === "wide" && "max-w-[1320px]",
        size === "default" && "max-w-[1180px]",
        size === "prose" && "max-w-3xl",
        className
      )}
    >
      {children}
    </div>
  );
}
