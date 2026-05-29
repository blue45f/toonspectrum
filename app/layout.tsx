import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CommandPalette } from "@/components/command-palette";
import { MotionProvider } from "@/components/motion-provider";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "WEBDEX — 웹툰·웹소설 통합 인덱스",
    template: "%s · WEBDEX",
  },
  description:
    "네이버·카카오·리디·문피아를 가로지르는 웹툰·웹소설 통합 검색, 다축 랭킹, 소셜 리뷰. 무엇을, 어디서, 왜 봐야 하는지 한 곳에서.",
  keywords: ["웹툰", "웹소설", "랭킹", "리뷰", "통합검색", "WEBDEX"],
  openGraph: {
    title: "WEBDEX — 웹툰·웹소설 통합 인덱스",
    description: "플랫폼을 가로지르는 웹툰·웹소설 디스커버리·랭킹·리뷰",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={spaceGrotesk.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Pretendard 는 next/font 미지원이라 CDN 으로 로드 (App Router 전역 적용) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap"
        />
      </head>
      <body className="min-h-dvh flex flex-col bg-canvas text-fg">
        <a
          href="#main"
          className="sr-only z-[200] rounded-lg bg-accent px-4 py-2 font-medium text-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          본문 바로가기
        </a>
        <MotionProvider>
          <CommandPalette />
          <SiteHeader />
          <main id="main" className="flex-1 pb-[72px] md:pb-0">
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
