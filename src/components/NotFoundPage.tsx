import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import Link from "@/src/compat/router-link";

export function NotFoundPage() {
  return (
    <Container size="wide" className="grid min-h-[56vh] place-items-center py-20 text-center">
      <div>
        <p className="eyebrow text-accent">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">페이지를 찾을 수 없어요</h1>
        <p className="mt-3 text-sm text-fg-3">주소를 다시 확인하거나 홈에서 작품을 탐색해 주세요.</p>
        <Link href="/" className={buttonClass({ className: "mt-6" })}>
          홈으로 돌아가기
        </Link>
      </div>
    </Container>
  );
}
