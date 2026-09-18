/** Shared first-party legal policy contract. */
export type PolicySlug = "terms-of-service" | "privacy-policy";

export interface PolicyDocument {
  policySlug: string;
  name: string;
  versionLabel: string;
  contentHash: string;
  body: string;
  effectiveAt: string | null;
  /** `static` means reviewed content bundled with the first-party release. */
  source?: "static";
}

export function isPolicySlug(slug: string): slug is PolicySlug {
  return slug === "terms-of-service" || slug === "privacy-policy";
}

// Reviewed legal copy. Do not change it as an infrastructure outage fix.
const STATIC_POLICY_DOCUMENTS: Record<PolicySlug, PolicyDocument> = {
  "terms-of-service": {
    policySlug: "terms-of-service",
    name: "이용약관",
    versionLabel: "내장본 v2026.06.04",
    contentHash: "static-terms-20260604-toonspectrum",
    effectiveAt: "2026-06-04T00:00:00.000+09:00",
    source: "static",
    body: [
      "제1조 (목적)",
      "본 약관은 툰스펙트럼이 제공하는 웹툰·웹소설 통합 색인, 검색, 랭킹, 리뷰, 커뮤니티 및 창작 도구 이용과 관련하여 서비스와 이용자 간의 권리·의무 및 책임사항을 정합니다.",
      "",
      "제2조 (서비스의 성격)",
      "서비스는 공개 카탈로그 정보를 정리해 작품 발견을 돕는 색인·추천 도구입니다. 서비스는 작품 본편 이미지나 텍스트를 호스팅하거나 재배포하지 않으며, 실제 열람은 각 원 플랫폼 링크를 통해 이루어집니다.",
      "",
      "제3조 (계정과 이용자 책임)",
      "이용자는 정확한 계정 정보를 유지해야 하며 타인의 권리 침해, 서비스 운영 방해, 불법 정보 게시, 자동화 남용을 해서는 안 됩니다.",
      "",
      "제4조 (커뮤니티와 창작물)",
      "이용자가 게시한 리뷰, 댓글, 창작물의 책임은 이용자에게 있습니다. 비방, 차별, 저작권 침해, 불법 정보, 스팸은 숨김·삭제·이용 제한 대상이 될 수 있습니다.",
      "",
      "제5조 (콘텐츠 권리)",
      "작품 메타데이터와 표지 등 원천 콘텐츠 권리는 각 플랫폼과 권리자에게 있습니다. 툰스펙트럼이 제작한 UI, 데이터 가공 결과, 편집 콘텐츠의 권리는 서비스 또는 정당한 권리자에게 귀속됩니다.",
      "",
      "제6조 (서비스 변경과 중단)",
      "서비스는 운영상 필요에 따라 기능을 변경하거나 일시 중단할 수 있습니다. 중요한 변경은 서비스 내 공지 또는 정책 페이지를 통해 안내합니다.",
      "",
      "제7조 (약관 변경)",
      "약관 변경 시 시행일과 변경 내용을 서비스 내에서 고지합니다. 이용자는 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단할 수 있습니다.",
    ].join("\n"),
  },
  "privacy-policy": {
    policySlug: "privacy-policy",
    name: "개인정보처리방침",
    versionLabel: "내장본 v2026.09.18",
    contentHash: "static-privacy-20260918-toonspectrum-business-inquiries",
    effectiveAt: "2026-09-18T00:00:00.000+09:00",
    source: "static",
    body: [
      "## 1. 수집하는 항목",
      "- 계정 정보: 이메일, 닉네임, 프로필 이미지 또는 소셜 로그인 식별자",
      "- 이용 활동: 리뷰, 별점, 컬렉션, 커뮤니티 게시물, 창작 게시물 등 이용자가 작성한 콘텐츠",
      "- 비즈니스 문의 정보: 담당자 이름, 회신 이메일, 문의 내용과 이용자가 선택해 입력한 회사·기관명 및 웹사이트 주소",
      "- 자동 수집 정보: 서비스 운영과 보안에 필요한 최소한의 접속 기록",
      "",
      "## 2. 이용 목적",
      "수집한 정보는 회원 식별, 로그인 유지, 리뷰·커뮤니티·창작 기능 제공, 맞춤 추천, 취향 분석, 운영·보안, 일반 문의 응대에 사용합니다. 비즈니스 문의 정보는 투자·IR, 사업 제휴, 콘텐츠·IP 협업, 후원·스폰서십, 자료 및 미팅 요청을 접수·검토하고 필요한 경우 회신하는 데 사용합니다.",
      "",
      "## 3. 브라우저 저장 정보",
      "읽음 상태, 관심 작품, 일부 필터와 표시 설정은 이용자 브라우저의 localStorage에 저장될 수 있으며 서버로 전송되지 않을 수 있습니다.",
      "",
      "## 4. 기기 내 AI 기능과 MediaPipe",
      "3D 캐릭터의 참고 이미지 프리셋 추천은 이용자가 화면에서 별도로 동의한 경우에만 Google MediaPipe API를 사용합니다. 선택한 이미지 픽셀은 기기의 메모리 Worker에서 처리되며 툰스펙트럼 서버나 브라우저 영구 저장소에 보관하지 않습니다. MediaPipe API는 앱 식별자, 처리 매체의 일반적 특성, 추론·세션 수, 호스트 환경 등 이용·성능 메타데이터를 처리할 수 있습니다. 이용자는 동의하지 않고 수동 프리셋을 사용할 수 있으며, 동의 상태는 저장하지 않습니다.",
      "",
      "## 5. 보유 및 파기",
      "개인정보는 수집 목적 달성 또는 회원 탈퇴 시 지체 없이 파기합니다. 비회원 비즈니스 문의 정보도 문의 처리 목적이 달성되면 파기하며, 관련 법령에서 보관 의무를 정한 경우 해당 기간 동안 보관합니다.",
      "",
      "## 6. 제3자 제공 및 처리위탁",
      "법령에 근거하거나 이용자 동의가 있는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다. 서비스 운영을 위해 클라우드 호스팅, 데이터베이스, 인증 제공자를 이용할 수 있습니다.",
      "",
      "## 7. 이용자의 권리",
      "이용자는 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있으며 설정 페이지에서 프로필과 공개 범위를 직접 관리할 수 있습니다.",
      "",
      "## 8. 문의",
      "개인정보 관련 문의는 서비스의 문의 게시판 또는 운영팀이 제공하는 지원 채널을 통해 접수할 수 있습니다.",
    ].join("\n"),
  },
};

Object.values(STATIC_POLICY_DOCUMENTS).forEach(Object.freeze);
Object.freeze(STATIC_POLICY_DOCUMENTS);

/** Stable frozen identity is needed by consumers and integrity tests. */
export function getStaticPolicyDocument(slug: PolicySlug): PolicyDocument {
  return STATIC_POLICY_DOCUMENTS[slug];
}

/**
 * Decode only an exact copy of the reviewed first-party policy.
 * Arbitrary remote payloads can no longer be promoted to policy authority.
 */
export function parsePolicyDocument(
  payload: unknown,
  slug: PolicySlug,
  allowStatic = false,
): PolicyDocument {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("policy_payload_malformed");
  }

  const doc = payload as Record<string, unknown>;
  const expected = getStaticPolicyDocument(slug);
  if (
    !allowStatic ||
    doc.source !== "static" ||
    doc.policySlug !== slug ||
    doc.name !== expected.name ||
    doc.versionLabel !== expected.versionLabel ||
    doc.contentHash !== expected.contentHash ||
    doc.body !== expected.body ||
    doc.effectiveAt !== expected.effectiveAt
  ) {
    throw new Error("policy_payload_malformed");
  }
  return expected;
}
