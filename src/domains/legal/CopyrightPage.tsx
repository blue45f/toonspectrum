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
            툰스펙트럼은 여러 국내 웹툰·웹소설 플랫폼의 <strong className="text-fg">공개 카탈로그에서 수집한 메타데이터</strong>(제목·작가·장르 등)를
            정리해 보여주는 <strong className="text-fg">색인·발견 서비스</strong>입니다. 작품 본편(회차 이미지·텍스트)은 저장·재배포하지 않으며,
            열람은 각 원 플랫폼으로의 링크를 통해서만 이루어집니다.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-fg">표지 이미지</h2>
          <p>
            표지는 작품 식별을 돕기 위한 썸네일로, 가능한 경우 원 플랫폼 표지를 출처 링크와 함께
            <strong className="text-fg"> 인용·표시</strong>합니다. 기본 표지는 자체 제작한 타이포그래픽 커버이며, 권리자 요청이나
            운영 정책에 따라 실제 표지 표시는 <strong className="text-fg">즉시 전체 비활성화</strong>할 수 있습니다. 성인(만 19세+)
            작품의 표지는 본인확인 없이 노출하지 않으며 타이포그래픽 커버로 대체합니다.
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
          <h2 className="mb-2 text-base font-bold text-fg">권리 침해 신고 (Notice &amp; Takedown)</h2>
          <p>
            게재된 메타데이터·표지가 귀하의 권리를 침해한다고 판단되시면 아래 이메일로 작품명·해당 URL·권리 근거를
            함께 보내 주세요. 접수 확인 후 <strong className="text-fg">영업일 기준 48시간 이내</strong>에 해당 항목을 수정·비노출
            처리하고 결과를 회신드립니다.
          </p>
          <p className="mt-2">
            이메일: <a className="text-accent underline underline-offset-2" href="mailto:blue45f@gmail.com">blue45f@gmail.com</a>
          </p>
        </section>
      </div>
    </Container>
  );
}
