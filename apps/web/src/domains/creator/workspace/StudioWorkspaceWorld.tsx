import { useState } from "react";
import { ArrowRight, BookOpen, Boxes, ClipboardCheck, MapPin, ScanLine, Users } from "lucide-react";
import { workspaceNavigationHref } from "@/shared/components/workspace/workspace-navigation-model";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { workspaceProjectLinks } from "./studio-workspace-model";

/** Original art is an optional preview, never a fabricated live-presence indicator. */
export function StudioWorkspaceWorld({ project, links, onFallback, resumeLabel }: {
  readonly project: StudioProjectLibraryEntry | null;
  readonly links: ReturnType<typeof workspaceProjectLinks>;
  readonly onFallback: () => void;
  readonly resumeLabel?: string | null;
}) {
  const bt = useBilingual("StudioWorkspaceWorld");
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState(true);
  const destinations = [
    { key: "story", label: bt("이야기와 회차", "Story and episodes"), href: links.story, icon: BookOpen },
    { key: "materials", label: bt("소재장", "Materials"), href: links.assets, icon: Boxes },
    { key: "desk", label: bt("내 책상", "My desk"), href: links.resume, icon: ArrowRight },
    { key: "review", label: bt("작품 보드", "Work board"), href: links.review, icon: ClipboardCheck },
    { key: "team", label: bt("팀과 함께", "With your team"), href: workspaceNavigationHref("/team", project ? { projectId: project.id } : { personal: true }), icon: Users },
  ];
  if (failed) return <div className="workspace-world-loading" role="status">
    <p>{bt("공간 이미지를 불러오지 못했습니다. 작품은 목록에서 계속 열 수 있습니다.", "The space image could not load. Your work remains available in list view.")}</p>
    <button type="button" onClick={onFallback}>{bt("목록 보기로 전환", "Switch to list view")}</button>
  </div>;
  return <figure className="workspace-world" data-space-labels={labels ? "visible" : "minimal"}>
    <div className="workspace-world-toolbar">
      <div><span className="workspace-preview-dot" aria-hidden="true" /><strong>{bt("가상 스튜디오", "Virtual studio")}</strong><span className="workspace-preview-tag">{bt("미리보기", "PREVIEW")}</span></div>
      <button type="button" className="workspace-icon-button workspace-world-label-toggle" aria-pressed={labels} onClick={() => setLabels((value) => !value)}><ScanLine size={16} aria-hidden="true" />{bt("공간 안내", "Space guide")}</button>
    </div>
    <div className="workspace-world-image">
      <img src="/assets/virtual-studio/production-v2/master-central-lossless.webp"
        alt={bt("책상, 작품 보드와 소재장이 있는 스튜디오 원본 아트. 그림 속 인물은 실제 접속자가 아닙니다.", "Original studio art. Illustrated people are not online participants.")}
        width={850} height={798} fetchPriority="high" decoding="async" onError={() => setFailed(true)} />
      <div className="workspace-world-hotspots" aria-label={bt("공간 작업 바로가기", "Space work shortcuts")}>
        {destinations.map(({ key, label, href, icon: Icon }, index) => <Link key={key} href={href}
          data-workspace-resume={key === "desk" && project ? "true" : undefined}
          aria-label={key === "desk" && resumeLabel ? `${label} · ${resumeLabel}` : label}
          className={`workspace-hotspot workspace-hotspot--${key}`}>
          <span className="workspace-hotspot-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="workspace-hotspot-label"><Icon size={15} aria-hidden="true" />{label}</span>
        </Link>)}
      </div>
    </div>
    <figcaption>
      <span><strong>{bt("공간 미리보기", "Space preview")}</strong><small>{bt("원본 아트 · 실시간 접속 상태는 입장 후 확인합니다", "Original art · live presence is shown after entering")}</small></span>
      <Link className="workspace-primary" href={project ? links.space : "/studio/new"}>
        <MapPin size={18} aria-hidden="true" />{project ? bt("이 작품의 스튜디오 입장", "Enter this work's studio") : bt("내 작업실 시작", "Start your studio")}
      </Link>
    </figcaption>
  </figure>;
}
