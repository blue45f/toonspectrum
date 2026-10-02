import { FamilyGallery } from "../ui/FamilyGallery";

/** 갤러리 탭: 29~30종 프리셋을 같은 fixture로 Worker(cpu-reference 경로)에서 렌더해 비교한다. */
export function GalleryView() {
  return (
    <div className="lab-tabpanel">
      <section className="lab-panel">
        <h2>브러시 가족 갤러리</h2>
        <p className="lab-muted">
          모든 프리셋을 같은 획(zigzag 256²)으로 CPU 참조 레인에서 렌더한다. 카드의 해시는 결정성 해시(fnv1a64)로, 같은
          입력이면 항상 같아야 한다. 가족 지표 판정은 자체 정의 임계값이며 브라우저 실측 전까지 달성으로 보고하지 않는다.
        </p>
        <FamilyGallery />
      </section>
    </div>
  );
}
