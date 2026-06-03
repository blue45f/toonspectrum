"use client";

import Link from "@/src/compat/router-link";
import type { Title } from "@/lib/types";
import { MiniPoster } from "./rank-row";
import { TYPE_LABEL } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { useInView } from "./use-in-view";
import { BookOpen, Tv, Film, Gamepad2, Sparkles } from "lucide-react";

const EXT_ICON: Record<string, typeof Tv> = {
  drama: Tv,
  movie: Film,
  anime: Sparkles,
  game: Gamepad2,
  ott: Tv,
};
const EXT_LABEL: Record<string, string> = {
  drama: "드라마",
  movie: "영화",
  anime: "애니메이션",
  game: "게임",
  ott: "OTT 시리즈",
};

// 노드 등장 안무용 공통 스타일. step = 체인 상의 순서(0=원작).
function nodeReveal(inView: boolean, step: number): React.CSSProperties {
  return {
    opacity: inView ? 1 : 0,
    transform: inView ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 420ms var(--ease-out-expo), transform 420ms var(--ease-out-quint)",
    transitionDelay: `${step * 130 + 90}ms`,
  };
}

function Node({
  title,
  role,
  highlight,
  inView,
  step,
}: {
  title: Title;
  role: string;
  highlight?: boolean;
  inView: boolean;
  step: number;
}) {
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn(
        "group flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 text-center",
        highlight && "scale-[1.03]"
      )}
      style={nodeReveal(inView, step)}
    >
      <MiniPoster
        title={title}
        className={cn(
          "w-full ring-1 transition-all",
          highlight ? "ring-accent" : "ring-[oklch(0.95_0.01_85/0.14)] group-hover:ring-line-strong"
        )}
      />
      <span className="eyebrow text-[0.58rem] text-fg-3">{role}</span>
      <span className="line-clamp-2 text-[0.72rem] font-medium leading-tight text-fg-2 group-hover:text-fg">
        {title.title}
      </span>
    </Link>
  );
}

// 커넥터 — reveal 시 라인이 좌→우로 그려진 뒤 노드 도트가 들어온다.
function Connector({ inView, step }: { inView: boolean; step: number }) {
  const lineDelay = `${step * 130}ms`;
  const dotDelay = `${step * 130 + 60}ms`;
  return (
    <div className="flex shrink-0 items-center self-start pt-7" aria-hidden>
      <span
        className="h-px w-4 origin-left bg-line-strong transition-transform duration-[360ms] ease-out-quint sm:w-7"
        style={{ transform: inView ? "scaleX(1)" : "scaleX(0)", transitionDelay: lineDelay }}
      />
      <span
        className="size-1.5 rounded-full bg-accent transition-[opacity,transform] duration-200 ease-out-expo"
        style={{
          opacity: inView ? 1 : 0,
          transform: inView ? "scale(1)" : "scale(0.2)",
          transitionDelay: dotDelay,
        }}
      />
    </div>
  );
}

// 원작 → 웹툰 → 영상화 그래프
export function AdaptationGraph({
  original,
  adaptations,
  currentId,
  className,
}: {
  original: Title;
  adaptations: Title[];
  currentId?: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const ext = [
    ...(original.externalAdaptations ?? []),
    ...adaptations.flatMap((a) => a.externalAdaptations ?? []),
  ];
  return (
    <div ref={ref} className={cn("flex items-start gap-1 overflow-x-auto rail pb-1", className)}>
      <Node
        title={original}
        role={original.type === "webnovel" ? "원작 소설" : "원작"}
        highlight={original.id === currentId}
        inView={inView}
        step={0}
      />
      {adaptations.map((a, i) => (
        <div key={a.id} className="flex items-start gap-1">
          <Connector inView={inView} step={i + 1} />
          <Node
            title={a}
            role={TYPE_LABEL[a.type] + "화"}
            highlight={a.id === currentId}
            inView={inView}
            step={i + 1}
          />
        </div>
      ))}
      {ext.map((e, i) => {
        const Icon = EXT_ICON[e.kind] ?? BookOpen;
        const step = adaptations.length + 1 + i;
        return (
          <div key={i} className="flex items-start gap-1">
            <Connector inView={inView} step={step} />
            <div
              className="flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 text-center"
              style={nodeReveal(inView, step)}
            >
              <div className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-md border border-line-strong bg-[linear-gradient(145deg,oklch(0.245_0.011_64),oklch(0.185_0.009_68))] text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.1)]">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_0%,oklch(0.72_0.185_42/0.22),transparent_58%)]" />
                <span className="absolute left-0 top-0 h-full w-[2px] bg-accent/70" />
                <Icon size={20} className="relative" />
              </div>
              <span className="eyebrow text-[0.58rem] text-fg-3">{EXT_LABEL[e.kind]}</span>
              <span className="line-clamp-2 text-[0.72rem] font-medium leading-tight text-fg-2">
                {e.name}
                <span className="block text-[0.62rem] text-fg-3 tnum">{e.year}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
