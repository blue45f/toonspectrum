import { ArrowRight, Eye, FlipHorizontal2, ImagePlus, Layers3, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useDocumentTitle } from "@/hooks/use-document-title";

const STEPS = [
  {
    icon: ImagePlus,
    title: "레퍼런스를 선택해 가이드 시작",
    body: "Studio 레퍼런스에서 이미지를 선택하고 ‘이 이미지로 따라 그리기’를 누르세요. 원본은 페이지 소유 비출력 가이드로 연결됩니다.",
  },
  {
    icon: Eye,
    title: "겹쳐 보고 선을 익히기",
    body: "겹쳐 보기와 옆에 보기를 전환하고 불투명도·흑백·반전을 조절하세요. 잠긴 가이드는 펜 입력을 받지 않아 그대로 그릴 수 있습니다.",
  },
  {
    icon: Layers3,
    title: "내 원고에서 직접 그리기",
    body: "실제 획은 현재 원고의 일반 드로잉 도구로 기록됩니다. 참고판을 숨기거나 닫아도 원고 획은 그대로 유지됩니다.",
  },
] as const;

export function TracePracticePage() {
  useDocumentTitle("따라 그리기 연습");
  return <Container size="wide" className="py-7 sm:py-10 lg:py-12">
    <header className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
      <p className="eyebrow text-accent">ACADEMY · TRACE PRACTICE</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">참고 이미지는 가이드로, 내 선은 원고에.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
        별도의 복제 원고나 숨은 업로드 경로를 만들지 않고, 기존 Studio 레퍼런스와 실제 드로잉 엔진을 함께 사용합니다.
        연습을 시작하면 레퍼런스가 열리며, 이미지를 선택한 뒤 ‘이 이미지로 따라 그리기’를 누르면 현재 페이지에 가이드가 연결됩니다.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/studio/canvas?practice=trace" className={buttonClass({ size: "lg" })}>
          따라 그리기 시작 <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link to="/learn/recipes" className={buttonClass({ size: "lg", variant: "outline" })}>다른 실습 보기</Link>
      </div>
    </header>
    <section className="mt-6 grid gap-3 lg:grid-cols-3" aria-label="따라 그리기 흐름">
      {STEPS.map(({ icon: Icon, title, body }, index) => <article key={title} className="rounded-2xl border border-line bg-card p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden="true" /></span>
        <p className="mt-4 text-xs font-bold tracking-[0.14em] text-fg-3">STEP {index + 1}</p>
        <h2 className="mt-2 text-lg font-bold text-fg">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-fg-2">{body}</p>
      </article>)}
    </section>
    <section className="mt-6 grid gap-4 rounded-2xl border border-line bg-panel p-5 md:grid-cols-2">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><FlipHorizontal2 size={18} className="text-accent" />연습 도구</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-fg-2">
          <li>겹쳐 보기와 레퍼런스 창 보기 전환</li>
          <li>불투명도·흑백·좌우/상하 반전과 배치 잠금</li>
          <li>원본 숨기기·비교·다시 연습·완료 상태</li>
          <li>가이드는 결과 이미지·썸네일·타임랩스에서 제외</li>
        </ul>
      </div>      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} className="text-accent" />공개·권리 확인</h2>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          참고 이미지를 볼 수 있다는 사실이 재배포 권한을 뜻하지 않습니다. 공개·내보내기 전에 원본의 이용 조건을 직접 확인하세요.
          이 실습은 다른 사람의 원본 이미지를 자동 게시하거나 학습 데이터로 전송하지 않습니다.
        </p>
      </div>
    </section>
    <aside className="mt-6 rounded-2xl border border-warn/35 bg-warn/10 p-4 text-sm leading-7 text-fg-2">
      화면 공유 중이라면 개인 사진이나 비공개 참고자료가 보이지 않는지 먼저 확인하세요.
      브라우저가 운영체제 전체 화면 공유의 내용을 자동으로 숨겨준다고 가정하지 않습니다.
    </aside>
  </Container>;
}
