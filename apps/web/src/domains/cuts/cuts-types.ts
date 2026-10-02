/**
 * 컷츠(Cuts) 도메인 타입.
 *
 * 숏폼 "컷츠"는 웹툰 회차의 패널(컷) 이미지들을 9:16 세로형 클립으로 자동 변환한
 * 짧은 영상 피드다. 실제 MP4 인코딩 대신, 클립은 "샷(Shot)" 단위의 재생 명세로
 * 표현하고 플레이어가 브라우저에서 실시간 렌더링한다(켄 번즈 + 자막 + 내레이션).
 * 이는 기존 스튜디오 프로모 영상 E2E 하네스(`tools/browser-harnesses/promo-e2e.html`)가
 * 브라우저 렌더링을 캡처해 영상을 만들던 접근과 같은 발상이다.
 */

import type { VoiceSegment } from "@/shared/voice/voice-emotion-markup";

/** 회차의 한 패널(컷) — 클립 변환의 입력 단위. */
export interface EpisodePanel {
  /** 패널 이미지 URL. 없으면 프로시저럴 아트로 대체된다. */
  readonly imageUrl?: string;
  /** 접근성용 대체 텍스트. */
  readonly alt: string;
  /** 화면에 표시되는 자막 (한국어). */
  readonly caption: string;
  /** 내레이션 대본 — 감정 마크업(`[강조]` 등) 사용 가능. */
  readonly narration: string;
}

/** 클립 변환 대상 회차. */
export interface EpisodeSource {
  readonly titleId: string;
  readonly title: string;
  readonly author: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  /** 회차 패널 목록 (순서대로 재생). */
  readonly panels: readonly EpisodePanel[];
}

/** 켄 번즈 이동 — 9:16 프레임 안의 시작/종료 카메라. */
export interface KenBurnsMove {
  readonly from: { readonly scale: number; readonly x: number; readonly y: number };
  readonly to: { readonly scale: number; readonly x: number; readonly y: number };
  /** 이동 방향 식별자 (테스트·접근성용). */
  readonly direction: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up";
}

/** 클립의 한 샷 — 패널 하나에 대한 재생 명세. */
export interface CutsShot {
  readonly id: string;
  readonly imageUrl: string;
  readonly alt: string;
  readonly caption: string;
  /** 내레이션 세그먼트 (감정 마크업 파싱 결과). */
  readonly narrationSegments: readonly VoiceSegment[];
  /** Web Speech API용 순수 텍스트 내레이션. */
  readonly narrationPlain: string;
  /** 클립 시작 기준 오프셋 (ms). */
  readonly startMs: number;
  /** 샷 재생 길이 (ms). */
  readonly durationMs: number;
  readonly kenBurns: KenBurnsMove;
}

/** 컷츠 클립. */
export interface CutsClip {
  readonly id: string;
  readonly titleId: string;
  readonly title: string;
  readonly author: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  readonly shots: readonly CutsShot[];
  /** 전체 재생 길이 (ms). */
  readonly durationMs: number;
  /** 클라우드 TTS(Google Cloud TTS 등) 내보내기용 SSML. */
  readonly narrationSsml: string;
  /** 썸네일 — 첫 샷 이미지. */
  readonly thumbnailUrl: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly publishedAt: string;
  readonly views: number;
  readonly likes: number;
}

/** 클립 변환 옵션. */
export interface CutsBuildOptions {
  /** 클립 ID 접두 (기본 "cuts"). */
  readonly idPrefix?: string;
  /** 클립 1개당 최대 샷 수 (기본 8). */
  readonly maxShots?: number;
  /** 샷당 최소 재생 길이 ms (기본 2800). */
  readonly minShotMs?: number;
  /** 샷당 최대 재생 길이 ms (기본 6000). */
  readonly maxShotMs?: number;
}

/** 피드 통계 표시용 집계. */
export interface CutsStats {
  readonly views: number;
  readonly likes: number;
}
