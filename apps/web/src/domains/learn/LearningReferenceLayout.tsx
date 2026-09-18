import { Link } from "react-router-dom";

import type { ReactNode } from "react";

export function LearningReferenceLayout({
  eyebrow,
  title,
  intro,
  children,
  actions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl space-y-10 px-4 py-8 text-fg sm:px-6 sm:py-12" lang="ko" aria-label={title}>
      <header className="grid overflow-hidden rounded-3xl border border-line bg-panel lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <p className="text-xs font-bold tracking-[.16em] text-accent">{eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-fg-2 sm:text-lg">{intro}</p>
          {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
        </div>
        <figure className="relative min-h-64 overflow-hidden border-t border-line bg-raised lg:min-h-full lg:border-l lg:border-t-0">
          <img
            className="absolute inset-0 size-full object-cover"
            src="/brand/atelier-process.webp"
            alt="스케치, 선화와 채색으로 이어지는 웹툰 제작 과정 콘셉트 아트"
            width={640}
            height={480}
          />
          <figcaption className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/20 bg-black/70 px-4 py-3 text-sm leading-6 text-white backdrop-blur-sm">
            읽고 끝나는 정보가 아니라, 다음 제작 행동으로 이어지는 안내입니다.
          </figcaption>
        </figure>
      </header>

      {children}

      <footer className="grid gap-6 rounded-3xl border border-line bg-panel p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-accent">LEARN → MAKE</p>
          <h2 className="mt-2 text-2xl font-bold">배운 내용을 실제 프로젝트로 옮겨 보세요.</h2>
          <p className="mt-3 max-w-3xl leading-7 text-fg-2">
            제작 순서를 정리하고 필요한 교육을 찾았다면, ToonStudio에서 기획·콘티·작화·검수를 한 흐름으로 이어갈 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2" to="/studio/new">
            새 프로젝트 시작
          </Link>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-raised" to="/learn">
            학습 홈으로
          </Link>
        </div>
      </footer>
    </section>
  );
}
