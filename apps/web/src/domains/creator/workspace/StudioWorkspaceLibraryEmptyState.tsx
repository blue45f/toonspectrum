import { ArrowRight, FolderOpen, Plus, Upload } from "lucide-react";
import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** An empty library is a state to act on, not another product introduction. */
export function StudioWorkspaceLibraryEmptyState() {
  const bt = useBilingual("StudioWorkspaceLibraryEmptyState");
  return <section className="workspace-library-empty" aria-labelledby="workspace-library-empty-title">
    <div className="workspace-library-empty-mark" aria-hidden="true"><FolderOpen size={28} /></div>
    <p className="workspace-eyebrow">YOUR NEXT STORY STARTS HERE</p>
    <h2 id="workspace-library-empty-title">{bt("첫 작품을 위한 자리를 비워 두었어요.", "A place for your first work.")}</h2>
    <p>{bt("새 작품을 만들거나 기존 파일을 가져오세요. 이 기기에 등록한 작품을 여기서 찾고 이어갈 수 있습니다.", "Create a work or import existing files. Find and continue the works registered on this device here.")}</p>
    <div className="workspace-library-empty-actions">
      <Link className="workspace-primary" href="/studio/new"><Plus size={17} aria-hidden="true" />{bt("새 작품 만들기", "Create a work")}</Link>
      <Link className="workspace-icon-button" href="/studio/import"><Upload size={17} aria-hidden="true" />{bt("파일 가져오기", "Import files")}</Link>
    </div>
    <Link className="workspace-library-sample" href="/production/projects/sample-project/overview">{bt("샘플 제작 흐름 살펴보기", "Explore a sample workflow")}<ArrowRight size={15} aria-hidden="true" /></Link>
  </section>;
}
