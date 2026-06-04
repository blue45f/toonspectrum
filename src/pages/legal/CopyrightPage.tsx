import { Container } from "@/components/section";

// 저작권·콘텐츠 안내(/copyright).
export function CopyrightPage() {
  return (
    <Container size="prose" className="py-12 lg:py-16">
      <p className="eyebrow text-accent">COPYRIGHT</p>
      <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight sm:text-4xl">저작권·콘텐츠 안내</h1>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg-2">
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">콘텐츠 출처와 원칙</h2>
          <p>
            툰스펙트럼은 여러 국내 웹툰·웹소설 플랫폼의 <strong className="text-fg">공개 카탈로그에서 수집한 메타데이터</strong>(제목·작가·장르·표지 등)를
            정리해 보여주는 <strong className="text-fg">색인·발견 서비스</strong>입니다. 작품 본편(이미지·텍스트)은 저장·재배포하지 않으며,
            열람은 각 원 플랫폼으로의 링크를 통해서만 이루어집니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">지표의 정직성</h2>
          <p>
            네이버 웹툰의 별점은 실수집값이며, 조회·관심수는 공개 집계가 비공개로 전환되어 추정값(≈)으로
            표기합니다. 그 외 플랫폼의 평점·조회·완독률 등 일부 지표도 추정값(≈)으로 표기하며, 추정은
            명확히 구분 표시합니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">권리</h2>
          <p>
            각 작품의 메타데이터·표지에 대한 권리는 해당 플랫폼 및 권리자에게 있습니다. 서비스는 이를
            정보 제공·인용 목적으로 사용하며 출처(플랫폼) 링크를 함께 제공합니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">권리 침해 신고</h2>
          <p>
            게재된 정보가 귀하의 권리를 침해한다고 판단되시면 아래로 연락 주세요. 확인 후 신속히 수정·비노출
            조치하겠습니다.
          </p>
          <p className="mt-2">
            이메일: <a className="text-accent underline underline-offset-2" href="mailto:blue45f@gmail.com">blue45f@gmail.com</a> ·
            전화: <a className="text-accent underline underline-offset-2" href="tel:01038734197">010-3873-4197</a>
          </p>
        </section>
      </div>
    </Container>
  );
}
