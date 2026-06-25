// 정보 / 약관 (/info) — 토스 미니앱 법적 고지 화면.
// 토스에는 웹 SiteFooter 가 없어 약관·개인정보·사업자 정보 노출 경로가 비어 있었다. 이 화면이
// 그 공백을 메운다(비게임 미니앱 출시 컴플라이언스). 사업자 표기·정책 링크는 전부
// @toonspectrum/core 의 BUSINESS_INFO / LEGAL_LINKS 단일 소스에서 가져온다(웹 푸터와 동일 값).
//
// 정책 문서는 토스 안에서 렌더하지 않고 운영 사이트(SITE_URL)의 정본 페이지로 아웃링크한다
// (openExternalUrl → 토스 네이티브 openURL / 브라우저 window.open). 자사 서비스의 법적 고지
// 문서로의 이동이라 외부링크 가이드라인(앱 설치 유도 금지)에 부합한다.
import { BUSINESS_INFO, LEGAL_LINKS, siteUrl } from '@toonspectrum/core';

import { navigate } from '../router';
import { theme, pageShell } from '../theme';
import { openExternalUrl, shareMessage } from '../lib/toss';

const Header = (
  <header
    style={{
      display: 'flex',
      alignItems: 'center',
      height: 56,
      padding: '0 8px',
      paddingTop: 'env(safe-area-inset-top)',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      background: `color-mix(in oklab, ${theme.bg} 84%, transparent)`,
      backdropFilter: 'blur(12px)',
    }}
  >
    <button
      type="button"
      aria-label="뒤로"
      onClick={() => navigate('/explore')}
      className="pressable"
      style={{ width: 44, height: 44, background: 'none', border: 'none', color: theme.text, fontSize: 24, cursor: 'pointer' }}
    >
      ←
    </button>
    <span style={{ fontSize: 17, fontWeight: 800, color: theme.text, marginLeft: 4 }}>정보 · 약관</span>
  </header>
);

/** 사업자 표기 한 줄(라벨·값). */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13.5, lineHeight: 1.6 }}>
      <span style={{ flexShrink: 0, width: 96, color: theme.textMuted }}>{label}</span>
      <span style={{ color: theme.text, wordBreak: 'keep-all' }}>{value}</span>
    </div>
  );
}

export function InfoPage() {
  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      {Header}
      <div className="rise" style={pageShell}>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: theme.textMuted, margin: '8px 0 22px' }}>
          툰스펙트럼은 네이버 웹툰·시리즈와 카카오웹툰 등 여러 국내 플랫폼의 공개 카탈로그를 가로지르는
          웹툰·웹소설 통합 인덱스예요. 일부 지표(조회·관심·완독률 등)는 추정값(≈)으로 표기합니다.
        </p>

        {/* 약관·정책 — 운영 사이트 정본으로 아웃링크 */}
        <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: theme.textMuted, margin: '0 0 10px' }}>
          약관 및 정책
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {LEGAL_LINKS.map((l) => (
            <button
              key={l.path}
              type="button"
              className="pressable"
              onClick={() => openExternalUrl(siteUrl(l.path))}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '15px 16px',
                borderRadius: theme.radius,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                fontSize: 14.5,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{l.label}</span>
              <span aria-hidden style={{ color: theme.accent, fontSize: 15 }}>↗</span>
            </button>
          ))}
        </div>

        {/* 사업자 정보 — 전자상거래법/정보통신망법 표기 */}
        <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: theme.textMuted, margin: '0 0 10px' }}>
          사업자 정보
        </h2>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 16,
            borderRadius: theme.radius,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
          }}
        >
          <InfoRow label="상호" value={BUSINESS_INFO.name} />
          <InfoRow label="대표자" value={BUSINESS_INFO.ceo} />
          <InfoRow label="개인정보보호책임자" value={BUSINESS_INFO.privacyOfficer} />
          <InfoRow label="사업자등록번호" value={BUSINESS_INFO.registrationNumber} />
          <InfoRow label="주소" value={BUSINESS_INFO.address} />
          {/* 이메일·전화는 탭 시 mailto/tel — 토스 밖에서도 동작 */}
          <div style={{ display: 'flex', gap: 12, fontSize: 13.5, lineHeight: 1.6 }}>
            <span style={{ flexShrink: 0, width: 96, color: theme.textMuted }}>이메일</span>
            <a href={`mailto:${BUSINESS_INFO.email}`} style={{ color: theme.accent, textDecoration: 'none' }}>
              {BUSINESS_INFO.email}
            </a>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13.5, lineHeight: 1.6 }}>
            <span style={{ flexShrink: 0, width: 96, color: theme.textMuted }}>전화번호</span>
            <a href={`tel:${BUSINESS_INFO.phone.replace(/-/g, '')}`} style={{ color: theme.accent, textDecoration: 'none' }}>
              {BUSINESS_INFO.phone}
            </a>
          </div>
          <InfoRow label="호스팅" value={BUSINESS_INFO.hosting} />
        </div>

        <button
          type="button"
          className="pressable"
          onClick={() => void shareMessage(`[툰스펙트럼] 웹툰·웹소설 통합 인덱스\n${siteUrl('/')}`)}
          style={{
            width: '100%',
            marginTop: 22,
            height: 48,
            borderRadius: 14,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
            color: theme.text,
            fontSize: 14.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          툰스펙트럼 웹사이트 공유하기
        </button>

        <p style={{ fontSize: 11.5, lineHeight: 1.7, color: theme.textMuted, margin: '20px 0 0', textAlign: 'center' }}>
          © {new Date().getFullYear()} 툰스펙트럼 (Beta) · {BUSINESS_INFO.name}
        </p>
      </div>
    </div>
  );
}
