import Link from "next/link";
import type { Title } from "@/lib/types";
import { MiniPoster } from "./rank-row";
import { TYPE_LABEL } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
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

function Node({ title, role, highlight }: { title: Title; role: string; highlight?: boolean }) {
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn(
        "group flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 text-center",
        highlight && "scale-[1.03]"
      )}
    >
      <MiniPoster
        title={title}
        className={cn(
          "w-full ring-1 transition-all",
          highlight ? "ring-accent" : "ring-white/10 group-hover:ring-line-strong"
        )}
      />
      <span className="eyebrow text-[0.58rem] text-fg-3">{role}</span>
      <span className="line-clamp-2 text-[0.72rem] font-medium leading-tight text-fg-2 group-hover:text-fg">
        {title.title}
      </span>
    </Link>
  );
}

function Connector() {
  return (
    <div className="flex shrink-0 items-center self-start pt-7" aria-hidden>
      <span className="h-px w-4 bg-line-strong sm:w-7" />
      <span className="size-1.5 rounded-full bg-accent" />
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
  const ext = [
    ...(original.externalAdaptations ?? []),
    ...adaptations.flatMap((a) => a.externalAdaptations ?? []),
  ];
  return (
    <div className={cn("flex items-start gap-1 overflow-x-auto rail pb-1", className)}>
      <Node
        title={original}
        role={original.type === "webnovel" ? "원작 소설" : "원작"}
        highlight={original.id === currentId}
      />
      {adaptations.map((a) => (
        <div key={a.id} className="flex items-start gap-1">
          <Connector />
          <Node title={a} role={TYPE_LABEL[a.type] + "화"} highlight={a.id === currentId} />
        </div>
      ))}
      {ext.map((e, i) => {
        const Icon = EXT_ICON[e.kind] ?? BookOpen;
        return (
          <div key={i} className="flex items-start gap-1">
            <Connector />
            <div className="flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 text-center">
              <div className="grid aspect-[3/4] w-full place-items-center rounded-md border border-dashed border-line-strong bg-card text-fg-3">
                <Icon size={20} />
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
