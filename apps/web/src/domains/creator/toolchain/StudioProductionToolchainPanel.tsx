import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, Layers3, ServerCog, Workflow } from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/compat/router-link";

import { StudioProductionJobWorkspace } from "./StudioProductionJobWorkspace";
import { StudioToonBridgeConnectionCard } from "./StudioToonBridgeConnectionCard";
import {
  groupStudioProductionTools,
  STUDIO_TOOLCHAIN_PROFILES,
  type StudioToolchainProfileId,
} from "./studio-production-toolchain";
import {
  loadStudioToolchainProfile,
  saveStudioToolchainProfile,
} from "./studio-production-toolchain-preferences";
import { useStudioToonBridgeConnection } from "./useStudioToonBridgeConnection";

function href(path: string, projectId: string): string {
  return `${path}?${new URLSearchParams({ projectId }).toString()}`;
}

function CompactProfile({
  profile,
  setProfile,
}: {
  readonly profile: StudioToolchainProfileId;
  readonly setProfile: (profile: StudioToolchainProfileId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label={translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "제작 도구 라이선스 프로필")}>
      {STUDIO_TOOLCHAIN_PROFILES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={profile === item.id}
          onClick={() => setProfile(item.id)}
          className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "en", "min-h-9 rounded-lg border px-3 text-xs font-bold {v0}"), { v0: String(profile === item.id
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:text-fg") })}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}

export function StudioProductionToolchainPanel({
  projectId,
  view,
}: {
  readonly projectId: string;
  readonly view: "pipeline" | "renders";
}) {
  const [profile, setProfileState] = useState<StudioToolchainProfileId>(loadStudioToolchainProfile);
  const connection = useStudioToonBridgeConnection();
  const groups = useMemo(() => groupStudioProductionTools(profile), [profile]);
  const toolCount = groups.reduce((sum, group) => sum + group.tools.length, 0);

  const setProfile = (next: StudioToolchainProfileId) => {
    saveStudioToolchainProfile(next);
    setProfileState(next);
  };

  if (view === "renders") {
    return (
      <section className="space-y-4" aria-label={translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "프로젝트 제작 작업")}>
        <StudioToonBridgeConnectionCard connection={connection} compact />
        <CompactProfile profile={profile} setProfile={setProfile} />
        <StudioProductionJobWorkspace
          projectId={projectId}
          profile={profile}
          connection={connection}
        />
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-line bg-gradient-to-br from-panel via-card to-accent-soft/35 p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "en", "Production toolchain")}</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "외부 제작 도구 연결")}</h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "필터·OCR·벡터화·애니메이션·영상·3D·출판 작업을 이 프로젝트의 결과물과 이력으로 연결합니다. GPL 계열 실행 파일은 웹 번들에 포함하지 않고 로컬 프로세스로 격리합니다.")}</p>
        </div>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-bold text-fg-2">
          <Layers3 size={15} className="text-accent" aria-hidden="true" /> {toolCount}{translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "개 허용 도구")}</span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {groups.slice(0, 6).map((group) => (
          <div key={group.id} className="rounded-2xl border border-line bg-panel/70 p-3.5">
            <strong className="text-sm text-fg">{group.name}</strong>
            <span className="mt-1 block text-xs text-fg-3">{group.tools.map((tool) => tool.name).slice(0, 3).join(" · ")}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-line/70 pt-5 lg:flex-row lg:items-center lg:justify-between">
        <CompactProfile profile={profile} setProfile={setProfile} />
        <div className="flex flex-wrap gap-2">
          <Link
            href={href("/studio/toolchain", projectId)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-xs font-bold text-fg-2 hover:text-fg"
          >
            <Workflow size={15} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "전체 제작 흐름")}</Link>
          <Link
            href={href("/studio/engines", projectId)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-xs font-bold text-fg-2 hover:text-fg"
          >
            <ServerCog size={15} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "설치 상태")}</Link>
          <Link
            href={href("/studio/jobs", projectId)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-fg px-4 text-xs font-bold text-canvas"
          >
            {translateCurrentStaticSourceText("domains.creator.toolchain.StudioProductionToolchainPanel", "ko", "처리 중 작업 ")}<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
