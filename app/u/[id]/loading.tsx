import { Container } from "@/components/section";

// 프로필(force-dynamic, DB 조회) 전용 로딩 스켈레톤 — 전역 포스터그리드 스켈레톤과 달리
// 실제 프로필 레이아웃(아바타·통계·최애·리뷰)에 맞춰 레이아웃 깜빡임을 줄인다.
export default function ProfileLoading() {
  return (
    <Container size="wide" className="py-10">
      <header className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-center">
        <div className="skeleton size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="skeleton mb-2 h-3 w-16" />
          <div className="skeleton mb-3 h-8 w-44" />
          <div className="skeleton h-3 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-5 sm:flex sm:gap-7">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton mb-1.5 h-3 w-10" />
              <div className="skeleton h-7 w-8" />
            </div>
          ))}
        </div>
      </header>

      <div className="mt-10">
        <div className="skeleton mb-4 h-4 w-20" />
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      </div>

      <div className="mt-10">
        <div className="skeleton mb-4 h-4 w-24" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </Container>
  );
}
