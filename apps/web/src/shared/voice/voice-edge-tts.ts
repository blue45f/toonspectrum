/**
 * Edge TTS 실험 어댑터 (opt-in, 프로덕션 미연결).
 *
 * Microsoft Edge의 "소리내어 읽기"에 쓰이는 신경망 음성을 브라우저에서
 * 직접 호출하는 실험 모듈이다. API 키 없이 무료로 고품질 한국어 음성
 * (ko-KR-SunHiNeural 등)을 쓸 수 있다.
 *
 * ⚠️ 중요 — 프로덕션 경로에 연결하지 마라:
 * - 비공식 API다. Microsoft가 예고 없이 변경·중단할 수 있다.
 * - 이용약관상 회색 지대다. 상용 서비스의 핵심 경로에 쓰면 리스크가 있다.
 * - 이 모듈은 기본으로 비활성화되어 있으며, 사용자가 명시적으로 켠
 *   실험실에서만 동작한다.
 *
 * 참고:
 * - Piper TTS(MIT)는 완전 오프라인·상용 안전하지만 한국어 품질이 C+급이고
 *   모델 다운로드(~75MB)가 필요해 이번에는 통합하지 않았다.
 * - Web Speech API(브라우저 내장)가 기본 경로이며, 이 어댑터는
 *   "실험적 고품질 옵션"으로만 제공한다.
 */

export interface EdgeTtsVoice {
  readonly name: string;
  readonly shortName: string;
  readonly gender: "Female" | "Male";
  readonly locale: string;
}

/** 한국어 신경망 음성 목록 (Edge 카탈로그 기준). */
export const EDGE_TTS_KOREAN_VOICES: readonly EdgeTtsVoice[] = [
  { name: "Microsoft Server Speech Text to Speech Voice (ko-KR, SunHiNeural)", shortName: "ko-KR-SunHiNeural", gender: "Female", locale: "ko-KR" },
  { name: "Microsoft Server Speech Text to Speech Voice (ko-KR, InJoonNeural)", shortName: "ko-KR-InJoonNeural", gender: "Male", locale: "ko-KR" },
];

/** 영어 폴백 음성. */
export const EDGE_TTS_ENGLISH_VOICES: readonly EdgeTtsVoice[] = [
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)", shortName: "en-US-AriaNeural", gender: "Female", locale: "en-US" },
  { name: "Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)", shortName: "en-US-GuyNeural", gender: "Male", locale: "en-US" },
];

const EDGE_TTS_WS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
// 공개 상수: Edge 비공식 TTS 엔드포인트가 요구하는 고정 클라이언트 식별자(개인 자격증명 아님, 시크릿 스캔 오탐 방지).
const EDGE_TTS_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

export interface EdgeTtsSynthesizeOptions {
  /** SSML 문자열 (voice-ssml.ts의 buildSsml() 출력을 그대로 사용). */
  readonly ssml: string;
  /** 사용할 음성 shortName. 기본값은 ko-KR-SunHiNeural. */
  readonly voiceShortName?: string;
  /** 출력 형식. 기본 mp3. */
  readonly outputFormat?: "audio-24khz-48kbitrate-mono-mp3" | "audio-24khz-96kbitrate-mono-mp3";
}

export interface EdgeTtsResult {
  /** 합성된 오디오 Blob (mp3). */
  readonly audio: Blob;
  /** 요청에 걸린 시간 (ms). */
  readonly durationMs: number;
}

/**
 * Edge TTS가 현재 환경에서 시도 가능한지 (WebSocket 지원 여부).
 * 실제 호출 가능 여부는 네트워크·Microsoft 정책에 달려 있다.
 */
export function isEdgeTtsAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.WebSocket !== "undefined";
}

function buildSsmlMessage(ssml: string, voiceShortName: string): string {
  // Edge 엔드포인트는 SSML 요청을 그대로 받는다.
  return (
    `X-Timestamp:${new Date().toString()}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-RequestId:${crypto.randomUUID()}\r\n` +
    `Path:ssml\r\n\r\n` +
    ssmlWithVoice(ssml, voiceShortName)
  );
}

function ssmlWithVoice(ssml: string, voiceShortName: string): string {
  // <speak> 루트에 voice를 지정하지 않은 경우를 대비해 래핑한다.
  // 이미 voice가 지정된 SSML이면 그대로 둔다.
  if (ssml.includes("<voice")) return ssml;
  const inner = ssml.replace(/^<speak[^>]*>/, "").replace(/<\/speak>\s*$/, "");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR">` +
    `<voice name="${voiceShortName}"><prosody>${inner}</prosody></voice></speak>`;
}

function buildConfigMessage(outputFormat: string): string {
  return (
    `X-Timestamp:${new Date().toString()}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
            outputFormat,
          },
        },
      },
    })
  );
}

/**
 * Edge TTS로 SSML을 합성한다 (실험용).
 *
 * @throws 네트워크 오류·타임아웃·프로토콜 변경 시 예외를 던진다.
 * 호출자는 반드시 try/catch로 감싸고 Web Speech API로 폴백해야 한다.
 */
export function synthesizeWithEdgeTts(options: EdgeTtsSynthesizeOptions): Promise<EdgeTtsResult> {
  const voiceShortName = options.voiceShortName ?? "ko-KR-SunHiNeural";
  const outputFormat = options.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3";
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(
        `${EDGE_TTS_WS_URL}?TrustedClientToken=${EDGE_TTS_TRUSTED_CLIENT_TOKEN}`,
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Edge TTS 연결 실패"));
      return;
    }
    socket.binaryType = "arraybuffer";

    const audioChunks: BlobPart[] = [];
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("Edge TTS 타임아웃 (15초)"));
    }, 15_000);

    const cleanup = () => window.clearTimeout(timeout);

    socket.onopen = () => {
      socket.send(buildConfigMessage(outputFormat));
      socket.send(buildSsmlMessage(options.ssml, voiceShortName));
    };

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        // turn.end가 오면 합성 완료.
        if (event.data.includes("Path:turn.end")) {
          cleanup();
          socket.close();
          resolve({
            audio: new Blob(audioChunks, { type: "audio/mpeg" }),
            durationMs: Date.now() - startedAt,
          });
        }
        return;
      }
      // 바이너리: 2바이트 헤더 길이 + 헤더 + 오디오 데이터.
      const buffer = event.data as ArrayBuffer;
      const view = new DataView(buffer);
      const headerLength = view.getInt16(0);
      const audioStart = 2 + headerLength;
      if (audioStart < buffer.byteLength) {
        audioChunks.push(buffer.slice(audioStart));
      }
    };

    socket.onerror = () => {
      cleanup();
      reject(new Error("Edge TTS 연결 오류 — 비공식 API가 변경되었을 수 있다"));
    };
  });
}

/**
 * 실험실 플래그: Edge TTS를 켤지 여부.
 * 기본 off. 사용자가 설정에서 명시적으로 켜야 한다.
 */
const EDGE_TTS_EXPERIMENT_KEY = "ts_voice_edge_tts_experiment";

export function isEdgeTtsExperimentEnabled(): boolean {
  try {
    return localStorage.getItem(EDGE_TTS_EXPERIMENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setEdgeTtsExperimentEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(EDGE_TTS_EXPERIMENT_KEY, enabled ? "1" : "0");
  } catch {
    /* private browsing — 조용히 무시 */
  }
}
