import { brushStudioV6Node } from "./brush-studio-v6-engine";

import type { BrushStudioV6ProviderRuntimePlan } from "./brush-studio-v6-provider-runtime";

const ITEM = "rounded-xl border border-line bg-bg-2/55 p-3";

export function StudioBrushV6ProviderPlan({
  plan,
}: {
  readonly plan: BrushStudioV6ProviderRuntimePlan;
}) {
  return (
    <section
      aria-label="무폴백 브러시 엔진 바인딩"
      className="rounded-2xl border border-line bg-card/60 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-fg">무폴백 엔진 바인딩</h2>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            저장·협업·재생은 아래 프로바이더와 버전을 고정합니다. 실행 불가 시 다른 엔진으로 바꾸지 않습니다.
          </p>
        </div>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[0.68rem] font-black text-accent">
          {plan.licenseProfile} · fallback none
        </span>
      </div>

      {plan.blockedNodeIds.length > 0 ? (
        <div role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-bold text-danger">
          실행 프로바이더 없음: {plan.blockedNodeIds.map((id) => brushStudioV6Node(id).label).join(", ")}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {plan.bindings.map((binding) => (
          <article key={`${binding.providerId}:${binding.execution}`} className={ITEM}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black text-fg">{binding.label}</h3>
              <span className={`rounded-full border px-2 py-1 text-[0.62rem] font-black ${
                binding.execution === "native"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-warning/40 bg-warning/10 text-warning"
              }`}>
                {binding.execution === "native" ? "제품 커널" : "명시적 호환 어댑터"}
              </span>
            </div>
            <p className="mt-1 break-all text-[0.68rem] font-bold text-fg-2">
              {binding.providerId}@{binding.version}
            </p>
            <p className="mt-1 text-[0.65rem] text-fg-3">{binding.license} · {binding.rights}</p>
            <p className="mt-2 text-[0.68rem] leading-5 text-fg-3">
              {binding.nodeIds.map((id) => brushStudioV6Node(id).label).join(" · ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
