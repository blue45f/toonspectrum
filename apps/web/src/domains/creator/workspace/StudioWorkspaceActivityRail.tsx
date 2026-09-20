import { ArrowRight, ClipboardCheck, FolderOpen, LockKeyhole, Plus, Upload, Workflow } from "lucide-react";
import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { StudioProjectResumeTarget } from "../studio-project-resume-target";
import type { workspaceProjectLinks } from "./studio-workspace-model";

export function StudioWorkspaceActivityRail({ project, links, resume, resumeLabel }: {
  readonly project: StudioProjectLibraryEntry | null;
  readonly links: ReturnType<typeof workspaceProjectLinks>;
  readonly resume: StudioProjectResumeTarget | null;
  readonly resumeLabel: string | null;
}) {
  const bt = useBilingual("StudioWorkspaceActivityRail");
  const actions = project ? [
    { icon: FolderOpen, href: links.documents, title: bt("원고와 파일", "Manuscripts & files"), detail: bt("선택 작품의 원고 모아보기", "All manuscripts in this work") },
    { icon: Workflow, href: links.production, title: bt("제작 보드", "Production board"), detail: bt("담당 작업과 진행 상태 확인", "Check assignments and progress") },
    { icon: ClipboardCheck, href: links.review, title: bt("검수함", "Review inbox"), detail: bt("받은 요청과 수정 사항 확인", "Review requests and revisions") },
  ] : [
    { icon: Plus, href: "/studio/new", title: bt("새 작품 만들기", "Create a work"), detail: bt("아이디어를 첫 원고로", "Turn your idea into a manuscript") },
    { icon: Upload, href: "/studio/import", title: bt("기존 파일 가져오기", "Import existing work"), detail: bt("가지고 있던 작업에서 시작", "Start with work you already have") },
    { icon: FolderOpen, href: "/studio", title: bt("작품 라이브러리", "Work library"), detail: bt("이 기기의 작품과 복구 경로", "Device works and recovery options") },
  ];
  return <aside className="workspace-activity" aria-label={bt("현재 작품과 다음 작업", "Current work and next steps")}>
    <section className="workspace-resume-card">
      <p className="workspace-eyebrow">{project ? bt("이어서 만들기", "CONTINUE CREATING") : bt("첫 작품을 위한 자리", "A PLACE FOR YOUR FIRST STORY")}</p>
      <div className="workspace-resume-symbol" aria-hidden="true">{project ? project.title.trim().slice(0, 1) || "T" : "+"}</div>
      <h2>{project?.title ?? bt("당신의 이야기를 시작해 보세요.", "Make room for your story.")}</h2>
      <p className="workspace-resume-description">{resume?.summary ?? (project ? bt("작업하던 작품으로 돌아가 다음 장면을 이어가세요.", "Return to your work and continue the next scene.") : bt("작품을 만들면 이 공간에서 원고, 소재, 동료가 하나로 이어집니다.", "Create a work to bring manuscripts, materials and collaborators together."))}</p>
      <Link className="workspace-primary" data-workspace-resume={project ? "true" : undefined} href={project ? links.resume : "/studio/new"}>
        {project ? resumeLabel ?? bt("작품 이어하기", "Continue work") : bt("내 첫 작품 만들기", "Create my first work")}<ArrowRight size={18} aria-hidden="true" />
      </Link>
    </section>
    <section className="workspace-action-section">
      <h2>{project ? bt("지금 할 일", "YOUR NEXT STEP") : bt("이렇게 시작하세요", "START HERE")}</h2>
      <div className="workspace-action-list">{actions.map(({ icon: Icon, href, title, detail }) =>
        <Link key={href} href={href}><Icon size={19} aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} aria-hidden="true" /></Link>,
      )}</div>
    </section>
    <p className="workspace-privacy-note"><LockKeyhole size={15} aria-hidden="true" /><span>{bt("작업 원고와 공개 작품은 분리됩니다. 공유 권한은 작업별로 확인하세요.", "Private manuscripts stay separate from public work. Check access in each workspace.")}</span></p>
  </aside>;
}
