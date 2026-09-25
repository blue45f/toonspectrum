export type AiCapabilityAvailability =
  | "ready"
  | "setup-required"
  | "unavailable"
  | "checking"
  | "local";

export type AiCapabilityExecution =
  | "service-cloud"
  | "browser-byok"
  | "external-runtime"
  | "local-device";

export type AiCapabilityReleaseChannel =
  | "available"
  | "beta"
  | "developer-preview"
  | "smart-tool";

export interface AiCapabilityStatusItem {
  readonly id:
    | "text"
    | "image"
    | "music"
    | "voice"
    | "sound-effect"
    | "three-d"
    | "external-runtime"
    | "smart-tools";
  readonly title: string;
  readonly description: string;
  readonly availability: AiCapabilityAvailability;
  readonly availabilityDetail: string;
  readonly execution: AiCapabilityExecution;
  readonly billing: "service" | "creator" | "none";
  readonly persistence: "project" | "device" | "provider-runtime" | "mixed";
  readonly releaseChannel: AiCapabilityReleaseChannel;
  readonly generative: boolean;
}

export interface AiCapabilityRegistryInput {
  readonly managedText: "ready" | "checking" | "unavailable";
  readonly userText: boolean;
  readonly userImage: boolean;
  readonly userInference: boolean;
  readonly userThreeD: boolean;
  readonly hyper3d: boolean;
  readonly externalRuntime: boolean;
  readonly creatorPaidExecution:
    | "ready"
    | "checking"
    | "disabled"
    | "coordination-required"
    | "unavailable";
  readonly voiceProvider: boolean;
  readonly soundEffectProvider: boolean;
  readonly music: "ready" | "checking" | "disabled" | "unavailable";
}

function remoteAvailability(
  execution: AiCapabilityRegistryInput["creatorPaidExecution"],
  configured: boolean,
): Pick<AiCapabilityStatusItem, "availability" | "availabilityDetail"> {
  if (execution === "checking") {
    return { availability: "checking", availabilityDetail: "운영 상태 확인 중" };
  }
  if (execution === "disabled") {
    return { availability: "unavailable", availabilityDetail: "비용 보호 정책으로 비활성" };
  }
  if (execution === "coordination-required") {
    return {
      availability: "unavailable",
      availabilityDetail: "분산 비용 보호 서비스 연결 필요",
    };
  }
  if (execution === "unavailable") {
    return { availability: "unavailable", availabilityDetail: "상태를 확인할 수 없음" };
  }
  return configured
    ? { availability: "ready", availabilityDetail: "서비스 한도 내 사용 가능" }
    : { availability: "unavailable", availabilityDetail: "공급자 설정 필요" };
}

export function buildAiCapabilityRegistry(
  input: AiCapabilityRegistryInput,
): readonly AiCapabilityStatusItem[] {
  const textReady = input.managedText === "ready" || input.userText;
  const textChecking = input.managedText === "checking" && !input.userText;
  const imageReady = input.userImage;
  const threeDReady = input.hyper3d || input.userThreeD;
  const runtimeReady = input.externalRuntime;
  const voice = remoteAvailability(input.creatorPaidExecution, input.voiceProvider);
  const soundEffect = remoteAvailability(
    input.creatorPaidExecution,
    input.soundEffectProvider,
  );

  return Object.freeze([
    Object.freeze({
      id: "text" as const,
      title: "글·대사·번역",
      description: "시나리오, 대사 다듬기, 컷 구성과 번역을 보조합니다.",
      availability: textReady ? "ready" as const : textChecking ? "checking" as const : "setup-required" as const,
      availabilityDetail: textReady
        ? input.managedText === "ready" ? "자동 무료 AI 사용 가능" : "내 AI 연결 사용 가능"
        : textChecking ? "자동 무료 AI 상태 확인 중" : "무료 풀 또는 개인 텍스트 AI 연결 필요",
      execution: input.managedText === "ready" ? "service-cloud" as const : "browser-byok" as const,
      billing: input.managedText === "ready" ? "service" as const : "creator" as const,
      persistence: "project" as const,
      releaseChannel: "available" as const,
      generative: true,
    }),
    Object.freeze({
      id: "image" as const,
      title: "이미지 생성·편집",
      description: "배경 생성, 참조 이미지 변형과 선택 영역 수정을 실행합니다.",
      availability: imageReady ? "ready" as const : "setup-required" as const,
      availabilityDetail: imageReady
        ? "개인 이미지 AI 연결 사용 가능"
        : "브라우저 호출을 허용하는 개인 이미지 AI 연결 필요",
      execution: "browser-byok" as const,
      billing: "creator" as const,
      persistence: "mixed" as const,
      releaseChannel: "beta" as const,
      generative: true,
    }),
    Object.freeze({
      id: "music" as const,
      title: "AI 음악",
      description: "작품 분위기와 길이에 맞는 음악을 생성하고 로컬 라이브러리에 보관합니다.",
      availability: input.music === "ready"
        ? "ready" as const
        : input.music === "checking"
          ? "checking" as const
          : "unavailable" as const,
      availabilityDetail: input.music === "ready"
        ? "서비스 한도 내 사용 가능"
        : input.music === "checking"
          ? "운영 상태 확인 중"
          : input.music === "disabled"
            ? "운영 정책으로 비활성"
            : "공급자 설정 또는 서버 상태 확인 필요",
      execution: "service-cloud" as const,
      billing: "service" as const,
      persistence: "device" as const,
      releaseChannel: "beta" as const,
      generative: true,
    }),
    Object.freeze({
      id: "voice" as const,
      title: "클라우드 음성",
      description: "Gemini 또는 Deepgram으로 대사 음성을 생성합니다.",
      ...voice,
      execution: "service-cloud" as const,
      billing: "service" as const,
      persistence: "device" as const,
      releaseChannel: "beta" as const,
      generative: true,
    }),
    Object.freeze({
      id: "sound-effect" as const,
      title: "AI 효과음",
      description: "짧은 설명으로 장면용 효과음을 생성합니다.",
      ...soundEffect,
      execution: "service-cloud" as const,
      billing: "service" as const,
      persistence: "device" as const,
      releaseChannel: "beta" as const,
      generative: true,
    }),
    Object.freeze({
      id: "three-d" as const,
      title: "AI 3D 생성",
      description: "텍스트·이미지 입력을 Hyper3D/Rodin 작업으로 변환합니다.",
      availability: threeDReady ? "ready" as const : "setup-required" as const,
      availabilityDetail: threeDReady
        ? input.hyper3d ? "Hyper3D 사용자 키가 현재 탭에 연결됨" : "개인 3D AI 연결 사용 가능"
        : "Hyper3D 사용자 키 또는 개인 3D AI 연결 필요",
      execution: input.hyper3d ? "service-cloud" as const : "browser-byok" as const,
      billing: "creator" as const,
      persistence: "project" as const,
      releaseChannel: "beta" as const,
      generative: true,
    }),
    Object.freeze({
      id: "external-runtime" as const,
      title: "외부 Creator Runtime",
      description: "직접 운영하는 GPU Runtime으로 영상·2D↔3D 실험 작업을 실행합니다.",
      availability: runtimeReady ? "ready" as const : "setup-required" as const,
      availabilityDetail: runtimeReady
        ? "외부 Runtime 주소와 토큰이 현재 탭에 연결됨"
        : input.userInference
          ? "개인 미디어 AI 연결은 있으나 Creator Runtime은 미연결"
          : "공개 HTTPS Runtime과 자격 증명 필요",
      execution: "external-runtime" as const,
      billing: "creator" as const,
      persistence: "provider-runtime" as const,
      releaseChannel: "developer-preview" as const,
      generative: true,
    }),
    Object.freeze({
      id: "smart-tools" as const,
      title: "스마트 제작 도구",
      description: "획 안정화, 품질 검사와 규칙 기반 제작 계획을 기기에서 실행합니다.",
      availability: "local" as const,
      availabilityDetail: "AI 모델 호출 없이 즉시 사용 가능",
      execution: "local-device" as const,
      billing: "none" as const,
      persistence: "project" as const,
      releaseChannel: "smart-tool" as const,
      generative: false,
    }),
  ]);
}
