import { Container } from "@/components/section";

// 개인정보처리방침(/privacy).
export function PrivacyPage() {
  return (
    <Container size="prose" className="py-12 lg:py-16">
      <p className="eyebrow text-accent">PRIVACY</p>
      <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight sm:text-4xl">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-fg-3">시행일: 2026년 6월 4일</p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg-2">
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">1. 수집하는 항목</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>계정: 이메일, 닉네임, 프로필 이미지/아바타(선택), 소셜 로그인 식별자(선택)</li>
            <li>이용 활동: 리뷰·별점·컬렉션·커뮤니티 게시물 등 이용자가 작성한 콘텐츠</li>
            <li>자동 수집: 서비스 운영·보안에 필요한 최소한의 접속 로그</li>
          </ul>
          <p className="mt-2">취향 분석을 위한 별점·읽음 상태 등 일부 설정은 브라우저(localStorage)에만 저장될 수 있습니다.</p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">2. 이용 목적</h2>
          <p>회원 식별·로그인 유지, 리뷰·커뮤니티 등 기능 제공, 맞춤 추천·취향 분석, 운영·보안 및 문의 응대.</p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">3. 보유 및 파기</h2>
          <p>
            개인정보는 수집 목적 달성 시 또는 회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에서 정한
            기간이 있는 경우 그 기간 동안 보관합니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">4. 제3자 제공 및 처리위탁</h2>
          <p>
            법령에 근거하거나 이용자 동의가 있는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.
            서비스 운영을 위해 인프라(클라우드 호스팅·데이터베이스) 사업자를 이용하며, 소셜 로그인 시 해당
            제공자(예: Google)의 인증 정보를 처리합니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">5. 이용자의 권리</h2>
          <p>
            이용자는 자신의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 설정 페이지에서 프로필
            수정 및 공개/비공개 설정을 직접 변경할 수 있습니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">6. 개인정보 보호책임자 / 문의</h2>
          <p>
            개인정보 관련 문의: <a className="text-accent underline underline-offset-2" href="mailto:blue45f@gmail.com">blue45f@gmail.com</a>
          </p>
        </section>
      </div>
    </Container>
  );
}
