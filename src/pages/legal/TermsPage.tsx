import { Container } from "@/components/section";

// 이용약관(/terms) — 툰스펙트럼 서비스 이용 조건.
export function TermsPage() {
  return (
    <Container size="prose" className="py-12 lg:py-16">
      <p className="eyebrow text-accent">LEGAL</p>
      <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight sm:text-4xl">이용약관</h1>
      <p className="mt-2 text-sm text-fg-3">시행일: 2026년 6월 4일</p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg-2">
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제1조 (목적)</h2>
          <p>
            본 약관은 툰스펙트럼(이하 “서비스”)이 제공하는 웹툰·웹소설 통합 색인·검색·랭킹·리뷰·커뮤니티
            등 일체의 서비스 이용과 관련하여 서비스와 이용자 간의 권리·의무 및 책임사항을 규정합니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제2조 (서비스의 성격)</h2>
          <p>
            서비스는 각 플랫폼의 공개된 카탈로그 정보를 수집·정리하여 “무엇을, 어디서, 왜 볼지”를 돕는
            <strong className="text-fg"> 색인·발견 도구</strong>입니다. 서비스는 작품 본편(이미지·텍스트)을 호스팅하거나
            재배포하지 않으며, 실제 열람은 각 원 플랫폼의 링크를 통해 이루어집니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제3조 (계정)</h2>
          <p>
            이용자는 이메일 또는 제휴 소셜 로그인으로 계정을 만들 수 있습니다. 계정 정보는 정확하게
            유지해야 하며, 계정의 관리 책임은 이용자에게 있습니다. 타인의 권리를 침해하거나 운영을 방해하는
            계정은 이용이 제한될 수 있습니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제4조 (이용자의 의무)</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>욕설·비방·차별·음란·불법 정보 등 타인에게 피해를 주는 게시물을 작성하지 않습니다.</li>
            <li>저작권 등 제3자의 권리를 침해하는 콘텐츠를 게시하거나 유통하지 않습니다.</li>
            <li>자동화 수단으로 서비스를 과도하게 부하시키거나 데이터를 무단 대량 수집하지 않습니다.</li>
            <li>운영진은 위반 게시물을 비노출 처리하거나 계정 이용을 제한할 수 있습니다.</li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제5조 (콘텐츠 및 지식재산권)</h2>
          <p>
            작품 메타데이터·표지 등은 각 플랫폼/권리자에게 권리가 있으며, 서비스는 이를 정보 제공 목적으로
            인용·연결합니다. 이용자가 작성한 리뷰·게시물의 권리는 이용자에게 있으나, 서비스 노출에 필요한
            범위에서 서비스가 이를 사용할 수 있습니다. 자세한 사항은{" "}
            <a className="text-accent underline underline-offset-2" href="/copyright">저작권·콘텐츠 안내</a>를
            참고하세요.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제6조 (면책)</h2>
          <p>
            서비스가 제공하는 평점·조회·가격 등 일부 지표는 추정값(≈)을 포함하며, 실데이터와 차이가 있을 수
            있습니다. 서비스는 제공 정보의 완전성·정확성을 보증하지 않으며, 원 플랫폼의 정책 변경으로 인한
            링크·가격 변동에 대해 책임지지 않습니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">제7조 (약관의 변경)</h2>
          <p>
            본 약관은 관련 법령에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다. 문의는{" "}
            <a className="text-accent underline underline-offset-2" href="/contact">광고·제휴/문의</a> 페이지의
            연락처로 받습니다.
          </p>
        </section>
      </div>
    </Container>
  );
}
