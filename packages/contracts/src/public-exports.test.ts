import { afterEach, describe, expect, it, vi } from "vitest";

const publicEntries = [
  {
    name: "기본 진입점",
    load: () => import("@toonstudio/contracts"),
    functions: ["isCsrfProtectedMethod"],
  },
  {
    name: "공유 타입의 실행 값",
    load: () => import("@toonstudio/contracts/types"),
    functions: ["deriveSavedTitleIds"],
    values: ["COMMUNITY_CAFE_KINDS"],
  },
  {
    name: "추천",
    load: () => import("@toonstudio/contracts/recommend"),
    functions: ["similarTitles", "recommendForTaste"],
  },
  {
    name: "검색",
    load: () => import("@toonstudio/contracts/search"),
    functions: ["searchTitles", "sortTitles"],
  },
  {
    name: "분류",
    load: () => import("@toonstudio/contracts/taxonomy"),
    values: ["GENRES", "TAGS"],
  },
  {
    name: "리소스 작업 흐름",
    load: () => import("@toonstudio/contracts/creator-resource-workflow"),
    functions: ["mergeCreatorWorkspaces", "selectBoardResources"],
  },
  {
    name: "레퍼런스 자산",
    load: () => import("@toonstudio/contracts/reference-assets"),
    values: ["REFERENCE_SEARCH_FIELDS", "REFERENCE_LENSES"],
  },
  {
    name: "요청 제한",
    load: () => import("@toonstudio/contracts/rate-limit"),
    functions: ["rateLimit", "clientIp"],
  },
  {
    name: "CRDT 바이너리 전송",
    load: () => import("@toonstudio/contracts/studio-crdt-binary-envelope"),
    functions: ["encodeStudioCrdtBinaryEnvelope", "decodeStudioCrdtBinaryEnvelope"],
  },
  {
    name: "CRDT 래스터 연산",
    load: () => import("@toonstudio/contracts/studio-crdt-raster-ops"),
    functions: ["mergeStudioRasterOperationLogs", "replayStudioRasterOperationLog"],
  },
  {
    name: "CRDT 래스터 압축",
    load: () => import("@toonstudio/contracts/studio-crdt-raster-compaction"),
    functions: ["createStudioRasterCompactionCheckpoint", "compactStudioRasterOperationLog"],
  },
  {
    name: "CRDT 래스터 문서",
    load: () => import("@toonstudio/contracts/studio-crdt-raster-document-contract"),
    functions: ["readStudioCrdtRasterDocument", "preservesStudioCrdtRasterRoots"],
  },
  {
    name: "필터 마스크",
    load: () => import("@toonstudio/contracts/studio-filter-mask-surface-contract"),
    functions: ["createStudioFilterMaskSurfaceSpec", "isStudioFilterMaskSurfaceSpec"],
  },
  {
    name: "잉크 입력",
    load: () => import("@toonstudio/contracts/studio-ink-input-contract"),
    values: ["STUDIO_INK_INPUT_CONTRACT_KIND", "STUDIO_INK_INPUT_CONTRACT_VERSION"],
  },
  {
    name: "3D 연결 패스 자산",
    load: () => import("@toonstudio/contracts/studio-linked-3d-pass-asset-fence"),
    functions: ["extractStudioLinked3dPassAssetRequirements", "isStudioLinked3dPassServerAssetId"],
  },
  {
    name: "실시간 인증 티켓",
    load: () => import("@toonstudio/contracts/studio-live-auth-ticket"),
    values: ["StudioLiveGuestCredentialSchema", "STUDIO_LIVE_AUTH_TICKET_VERSION"],
  },
  {
    name: "실시간 즉석 작업 범위",
    load: () => import("@toonstudio/contracts/studio-live-jam-scope"),
    functions: ["isStudioLiveJamWorkId", "isStudioLiveJamScope"],
  },
  {
    name: "실시간 리소스 잠금",
    load: () => import("@toonstudio/contracts/studio-live-lock-resource"),
    functions: ["parseStudioLiveLockResourceScope", "studioLiveLockResourcesConflict"],
  },
  {
    name: "래스터 자산",
    load: () => import("@toonstudio/contracts/studio-raster-asset-contract"),
    values: ["STUDIO_RASTER_ASSET_CONTRACT_VERSION", "STUDIO_RASTER_ASSET_MAX_BYTES"],
  },
  {
    name: "작업 자산",
    load: () => import("@toonstudio/contracts/studio-work-asset-contract"),
    functions: ["isStudioWorkAssetAdmissionOptedIn"],
    values: ["StudioWorkAssetSmartFiltersSchema"],
  },
  {
    name: "원격 레퍼런스 이미지",
    load: () => import("@toonstudio/contracts/studio-remote-reference-image-contract"),
    values: ["STUDIO_REMOTE_REFERENCE_IMAGE_ENDPOINT"],
  },
  {
    name: "팀 댓글 이벤트",
    load: () => import("@toonstudio/contracts/studio-team-comment-live-event"),
    functions: ["parseStudioTeamCommentLiveEvent", "isNewerStudioTeamCommentLiveEvent"],
  },
  {
    name: "음성 ICE 정책",
    load: () => import("@toonstudio/contracts/studio-voice-ice-policy-contract"),
    values: ["StudioVoiceIceServerSchema", "StudioVoiceIcePolicyResponseSchema"],
  },
  {
    name: "조정 엔진 식별자",
    load: () => import("@toonstudio/contracts/studio-adjustment-engine-ids"),
    values: ["STUDIO_ADJUSTMENT_ENGINE_IDS"],
  },
  {
    name: "실시간 조정 메타데이터",
    load: () => import("@toonstudio/contracts/studio-live-adjustment-contract"),
    functions: ["canonicalizeStudioLiveAdjustmentElement"],
  },
  {
    name: "래스터 자산 승인",
    load: () => import("@toonstudio/contracts/studio-raster-asset-admission"),
    functions: ["isStudioRasterAssetAdmissionOptedIn"],
  },
  {
    name: "스마트 필터 스택",
    load: () => import("@toonstudio/contracts/studio-smart-filter-stack-contract"),
    values: ["StudioWorkAssetSmartFiltersSchema"],
  },
  {
    name: "잉크 봉투 서명",
    load: () => import("@toonstudio/contracts/studio-ink-envelope-webcrypto-attestation"),
    functions: ["createStudioInkEnvelopeWebCryptoAttester", "createStudioInkEnvelopeWebCryptoVerifier"],
  },
  {
    name: "코덱 공급자",
    load: () => import("@toonstudio/contracts/studio-codec-provider-contract"),
    functions: ["parseStudioCodecProviderManifest"],
  },
  {
    name: "제품 코덱 인증",
    load: () => import("@toonstudio/contracts/studio-product-codec-certification"),
    values: ["STUDIO_PRODUCT_CODEC_CERTIFICATE_KIND"],
  },
] satisfies ReadonlyArray<{
  name: string;
  load: () => Promise<Record<string, unknown>>;
  functions?: readonly string[];
  values?: readonly string[];
}>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("공유 계약 공개 진입점", () => {
  it("저장된 작품 집합은 읽음·구독·컬렉션을 합치고 하차한 읽음 상태를 제외한다", async () => {
    const { deriveSavedTitleIds } = await import("@toonstudio/contracts/types");

    expect(deriveSavedTitleIds(
      { read: "reading", dropped: "dropped", empty: undefined },
      { subscribed: true, inactive: false, read: true },
      [{ titleIds: ["collected", "read"] }, { titleIds: ["collected"] }],
    )).toEqual(new Set(["read", "subscribed", "collected"]));
  });

  it.each(publicEntries)("$name의 실행 값을 공개 경로에서 가져온다", async (entry) => {
    const loaded: Record<string, unknown> = await entry.load();

    for (const name of entry.functions ?? []) {
      expect(loaded[name], `${entry.name}.${name}`).toBeTypeOf("function");
    }
    for (const name of entry.values ?? []) {
      expect(loaded[name], `${entry.name}.${name}`).toBeDefined();
    }
  });

  it("기본 진입점은 읽기 요청과 변경 요청의 CSRF 보호를 구분한다", async () => {
    const { isCsrfProtectedMethod } = await import("@toonstudio/contracts");

    expect(isCsrfProtectedMethod("GET")).toBe(false);
    expect(isCsrfProtectedMethod("POST")).toBe(true);
  });

  it("요청 제한은 키를 격리하고 슬라이딩 윈도 만료 시 다시 허용한다", async () => {
    const { rateLimit } = await import("@toonstudio/contracts/rate-limit");
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    expect(rateLimit("public-export:rate-limit", 2, 100)).toBe(true);
    expect(rateLimit("public-export:rate-limit", 2, 100)).toBe(true);
    expect(rateLimit("public-export:rate-limit", 2, 100)).toBe(false);
    expect(rateLimit("public-export:other-client", 2, 100)).toBe(true);

    now.mockReturnValue(1_099);
    expect(rateLimit("public-export:rate-limit", 2, 100)).toBe(false);
    now.mockReturnValue(1_100);
    expect(rateLimit("public-export:rate-limit", 2, 100)).toBe(true);
  });

  it("클라이언트 IP의 기존 헤더 우선순위와 기본값을 유지한다", async () => {
    const { clientIp } = await import("@toonstudio/contracts/rate-limit");
    const request = (headers: Record<string, string>) => new Request("https://example.test", { headers });

    expect(clientIp(request({
      "x-forwarded-for": " 192.0.2.1, 192.0.2.2",
      "x-real-ip": "192.0.2.3",
    }))).toBe("192.0.2.1");
    expect(clientIp(request({ "x-real-ip": "192.0.2.3" }))).toBe("192.0.2.3");
    expect(clientIp(request({}))).toBe("unknown");
  });

  it("즉석 작업은 동일한 work와 room만 허용하고 일반 작업과 분리한다", async () => {
    const { isStudioLiveJamScope, isStudioLiveJamWorkId, studioRealtimeJamGuestActorId } =
      await import("@toonstudio/contracts/studio-live-jam-scope");
    const workId = "work-instant-abc123-a1b2";

    expect(isStudioLiveJamScope({ workId, roomId: workId })).toBe(true);
    expect(isStudioLiveJamScope({ workId, roomId: "work-instant-abc123-c3d4" })).toBe(false);
    expect(isStudioLiveJamWorkId("work-project-123")).toBe(false);
    expect(isStudioLiveJamWorkId("work-instant-abc_123-a1b2")).toBe(false);
    expect(studioRealtimeJamGuestActorId("session-1")).toBe("guest:session-1");
  });

  it("바이너리 봉투는 소유한 바이트를 반환하고 손상 및 종류 불일치를 거부한다", async () => {
    const { encodeStudioCrdtBinaryEnvelope, decodeStudioCrdtBinaryEnvelope, StudioCrdtBinaryEnvelopeError } =
      await import("@toonstudio/contracts/studio-crdt-binary-envelope");
    const source = Uint8Array.of(1, 2, 3);
    const envelope = encodeStudioCrdtBinaryEnvelope("update", source);
    source[0] = 9;

    const decoded = decodeStudioCrdtBinaryEnvelope(envelope, "update");
    expect(decoded).toEqual({ kind: "update", codec: "identity", bytes: Uint8Array.of(1, 2, 3) });
    decoded.bytes[0] = 7;
    expect(decodeStudioCrdtBinaryEnvelope(envelope, "update").bytes).toEqual(Uint8Array.of(1, 2, 3));
    expect(() => decodeStudioCrdtBinaryEnvelope(envelope, "state-vector")).toThrow(StudioCrdtBinaryEnvelopeError);
    expect(() => decodeStudioCrdtBinaryEnvelope(envelope.subarray(0, 8), "update")).toThrow(StudioCrdtBinaryEnvelopeError);

    envelope[envelope.length - 1] ^= 1;
    expect(() => decodeStudioCrdtBinaryEnvelope(envelope, "update")).toThrow(StudioCrdtBinaryEnvelopeError);
  });

  it("분할한 CRDT 동기화 봉투를 순서대로 복원하고 누락된 조각을 거부한다", async () => {
    const {
      STUDIO_CRDT_BINARY_SYNC_FRAGMENT_MAX_BYTES,
      encodeStudioCrdtBinaryEnvelope,
      decodeStudioCrdtBinaryEnvelope,
      fragmentStudioCrdtBinarySyncEnvelope,
      reassembleStudioCrdtBinarySyncEnvelope,
      StudioCrdtBinaryEnvelopeError,
    } = await import("@toonstudio/contracts/studio-crdt-binary-envelope");
    const source = new Uint8Array(STUDIO_CRDT_BINARY_SYNC_FRAGMENT_MAX_BYTES + 1).fill(42);
    const envelope = encodeStudioCrdtBinaryEnvelope("sync-diff", source);
    const fragments = fragmentStudioCrdtBinarySyncEnvelope(envelope);

    expect(fragments).toHaveLength(2);
    expect(decodeStudioCrdtBinaryEnvelope(
      reassembleStudioCrdtBinarySyncEnvelope(fragments, envelope.byteLength), "sync-diff"
    ).bytes).toEqual(source);
    expect(() => reassembleStudioCrdtBinarySyncEnvelope(fragments.slice(0, 1), envelope.byteLength))
      .toThrow(StudioCrdtBinaryEnvelopeError);
  });

  it("래스터 이벤트 정렬은 안전 정수 범위 밖 시계와 동률의 작성자 순서를 유지한다", async () => {
    const { compareStudioRasterEventOrder } = await import("@toonstudio/contracts/studio-crdt-raster-ops");

    expect(compareStudioRasterEventOrder(
      { logicalClock: "9007199254740992", actorId: "actor-z", eventId: "event-1" },
      { logicalClock: "9007199254740993", actorId: "actor-a", eventId: "event-1" }
    )).toBeLessThan(0);
    expect(compareStudioRasterEventOrder(
      { logicalClock: "2", actorId: "actor-a", eventId: "event-z" },
      { logicalClock: "2", actorId: "actor-b", eventId: "event-a" }
    )).toBeLessThan(0);
  });

  it("필터 마스크 공개 스키마는 정상 ID를 보존하고 과대 표면을 거부한다", async () => {
    const { createStudioFilterMaskSurfaceSpec, isStudioFilterMaskSurfaceSpec } =
      await import("@toonstudio/contracts/studio-filter-mask-surface-contract");
    const surfaceId = "filter-mask:v1:11111111-1111-4111-8111-111111111111";
    const surface = createStudioFilterMaskSurfaceSpec({ surfaceId, width: 1024, height: 512 });

    expect(surface).toMatchObject({ surfaceId, width: 1024, height: 512 });
    expect(isStudioFilterMaskSurfaceSpec(surface)).toBe(true);
    expect(isStudioFilterMaskSurfaceSpec({ ...surface, width: 4097 })).toBe(false);
    expect(isStudioFilterMaskSurfaceSpec({ ...surface, surfaceId: "layer-1" })).toBe(false);
  });
});
