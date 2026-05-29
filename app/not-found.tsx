import Link from "next/link";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { spectrumGradient } from "@/lib/genre-color";
import { Home, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <div
        className="mb-8 h-1 w-40 rounded-full"
        style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF"]) }}
      />
      <p className="numeral text-7xl text-accent">404</p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">색인에 없는 페이지예요</h1>
      <p className="mt-2 max-w-sm text-pretty text-sm leading-relaxed text-fg-3">
        찾으시는 작품이나 페이지가 사라졌거나, 주소가 바뀌었을 수 있어요. 검색으로 다시 찾아보세요.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={buttonClass()}>
          <Home size={17} /> 홈으로
        </Link>
        <Link href="/explore" className={buttonClass({ variant: "outline" })}>
          <Compass size={17} /> 작품 탐색
        </Link>
      </div>
    </Container>
  );
}
