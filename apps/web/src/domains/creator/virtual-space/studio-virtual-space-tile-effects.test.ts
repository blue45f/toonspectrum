import { describe, expect, it } from "vitest";
import {
  createStudioTilePortalPair,
  createStudioTilePortalPairFromPreset,
  createTileEffect,
  resolveTileEffectTrigger,
  STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH,
  STUDIO_ZONE_ENTRY_PARTICLES,
  studioTileBgmCovers,
  studioTileEffectContains,
  zoneEntryParticles,
  type StudioTileEffectDefinition,
} from "./studio-virtual-space-tile-effects";

const TILE = { width: 16, height: 16 };

function created(input: Parameters<typeof createTileEffect>[0], existingIds: readonly string[] = []) {
  const result = createTileEffect(input, existingIds);
  if (!result.ok) throw new Error(`생성 실패: ${JSON.stringify(result.errors)}`);
  return result;
}

describe("createTileEffect 입력 살균", () => {
  it("알 수 없는 종류는 kind 오류로 실패한다", () => {
    const result = createTileEffect({ kind: "teleport", tileX: 0, tileY: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([{ code: "unknown-kind", field: "kind" }]);
  });

  it("id가 없으면 종류 기반으로 결정적 id를 만들고 중복을 피한다", () => {
    const first = created({ kind: "spawn", tileX: 1, tileY: 2 });
    expect(first.effect.id).toBe("tile-effect-spawn-1");
    const second = created({ kind: "spawn", tileX: 3, tileY: 4 }, [first.effect.id]);
    expect(second.effect.id).toBe("tile-effect-spawn-2");
    const third = created({ kind: "spawn", tileX: 5, tileY: 6 }, [first.effect.id, second.effect.id, "tile-effect-spawn-3"]);
    expect(third.effect.id).toBe("tile-effect-spawn-4");
  });

  it("중복 id와 잘못된 id 형식을 거부한다", () => {
    const duplicate = createTileEffect({ kind: "blocked", id: "wall-1", tileX: 0, tileY: 0 }, ["wall-1"]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.errors[0]?.code).toBe("duplicate-id");
    const malformed = createTileEffect({ kind: "blocked", id: "공백 포함!", tileX: 0, tileY: 0 });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.errors[0]?.code).toBe("invalid-id");
  });

  it("음수·비정수 타일 좌표와 크기를 거부하고 범위를 벗어나면 경고와 함께 보정한다", () => {
    const bad = createTileEffect({ kind: "spawn", tileX: -1, tileY: 1.5 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.map((error) => error.code)).toEqual(["invalid-tile-x", "invalid-tile-y"]);
    const clamped = created({ kind: "blocked", tileX: 0, tileY: 0, width: 0, height: 99 });
    expect(clamped.effect.width).toBe(1);
    expect(clamped.effect.height).toBe(32);
    expect(clamped.warnings).toHaveLength(2);
  });

  it("포털은 목적지 구역이 필수이고 목적지 좌표 기본값은 0이다", () => {
    const missing = createTileEffect({ kind: "portal", tileX: 2, tileY: 3 });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]?.code).toBe("missing-destination-room");
    const portal = created({ kind: "portal", tileX: 2, tileY: 3, destinationRoom: " recording-booth " });
    if (portal.effect.kind !== "portal") throw new Error("포털이 아님");
    expect(portal.effect.destinationRoom).toBe("recording-booth");
    expect(portal.effect.destinationTileX).toBe(0);
    expect(portal.effect.destinationTileY).toBe(0);
  });

  it("구역 태그는 private이 기본이고 알 수 없는 태그는 거부한다", () => {
    const zone = created({ kind: "zone", tileX: 0, tileY: 0 });
    if (zone.effect.kind !== "zone") throw new Error("구역이 아님");
    expect(zone.effect.zoneTag).toBe("private");
    const silent = created({ kind: "zone", tileX: 0, tileY: 0, zoneTag: "silent" });
    if (silent.effect.kind !== "zone") throw new Error("구역이 아님");
    expect(silent.effect.zoneTag).toBe("silent");
    const bad = createTileEffect({ kind: "zone", tileX: 0, tileY: 0, zoneTag: "loud" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.code).toBe("invalid-zone-tag");
  });

  it("유튜브 URL을 정규화해 embed URL을 만들고 비유튜브 URL은 거부한다", () => {
    for (const raw of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=10",
    ]) {
      const video = created({ kind: "youtube", tileX: 0, tileY: 0, url: raw });
      if (video.effect.kind !== "youtube") throw new Error("유튜브가 아님");
      expect(video.effect.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
    const notYoutube = createTileEffect({ kind: "youtube", tileX: 0, tileY: 0, url: "https://example.com/watch?v=dQw4w9WgXcQ" });
    expect(notYoutube.ok).toBe(false);
    if (!notYoutube.ok) expect(notYoutube.errors[0]?.code).toBe("invalid-youtube-url");
    const missing = createTileEffect({ kind: "youtube", tileX: 0, tileY: 0 });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]?.code).toBe("missing-url");
  });

  it("웹링크는 http(s)만 허용하고 나머지는 스킴 오류로 구분한다", () => {
    const link = created({ kind: "weblink", tileX: 0, tileY: 0, url: "https://toon.example/board " });
    if (link.effect.kind !== "weblink") throw new Error("웹링크가 아님");
    expect(link.effect.url).toBe("https://toon.example/board");
    const ftp = createTileEffect({ kind: "weblink", tileX: 0, tileY: 0, url: "ftp://files.example/x" });
    expect(ftp.ok).toBe(false);
    if (!ftp.ok) expect(ftp.errors[0]?.code).toBe("unsupported-url-scheme");
    const garbage = createTileEffect({ kind: "weblink", tileX: 0, tileY: 0, url: "not a url" });
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.errors[0]?.code).toBe("invalid-url");
  });

  it("BGM은 반경·볼륨 기본값과 보정 경고를 제공하고 사이트 상대 경로를 허용한다", () => {
    const bgm = created({ kind: "bgm", tileX: 0, tileY: 0, url: "/assets/virtual-studio/ambient-audio/gentle-window-rain.ogg" });
    if (bgm.effect.kind !== "bgm") throw new Error("BGM이 아님");
    expect(bgm.effect.radius).toBe(3);
    expect(bgm.effect.volume).toBe(0.6);
    expect(bgm.warnings).toHaveLength(0);
    const clamped = created({ kind: "bgm", tileX: 0, tileY: 0, url: "https://cdn.example/bgm.mp3", radius: 100, volume: 2 });
    if (clamped.effect.kind !== "bgm") throw new Error("BGM이 아님");
    expect(clamped.effect.radius).toBe(24);
    expect(clamped.effect.volume).toBe(1);
    expect(clamped.warnings).toHaveLength(2);
    const badRadius = createTileEffect({ kind: "bgm", tileX: 0, tileY: 0, url: "https://cdn.example/bgm.mp3", radius: "near" });
    expect(badRadius.ok).toBe(false);
    if (!badRadius.ok) expect(badRadius.errors[0]?.code).toBe("invalid-radius");
  });

  it("같은 입력은 항상 같은 결과를 낸다 (순수성)", () => {
    const input = { kind: "portal", tileX: 2, tileY: 3, destinationRoom: "recording-booth" } as const;
    expect(createTileEffect(input)).toEqual(createTileEffect(input));
  });
});

describe("resolveTileEffectTrigger 발동 판정", () => {
  const effects: readonly StudioTileEffectDefinition[] = [
    created({ kind: "spawn", id: "spawn-a", tileX: 0, tileY: 0 }).effect,
    created({ kind: "blocked", id: "wall-a", tileX: 4, tileY: 4 }).effect,
    created({ kind: "portal", id: "portal-a", tileX: 8, tileY: 8, destinationRoom: "recording-booth", destinationTileX: 6, destinationTileY: 4 }).effect,
    created({ kind: "zone", id: "zone-a", tileX: 12, tileY: 12, zoneTag: "silent" }).effect,
    created({ kind: "youtube", id: "video-a", tileX: 16, tileY: 16, url: "https://youtu.be/dQw4w9WgXcQ" }).effect,
    created({ kind: "weblink", id: "link-a", tileX: 20, tileY: 20, url: "https://toon.example/board" }).effect,
    created({ kind: "bgm", id: "bgm-a", tileX: 24, tileY: 24, url: "/assets/bgm.ogg", radius: 2, volume: 0.5 }).effect,
  ];

  it("빈 타일에서는 null을 반환한다", () => {
    expect(resolveTileEffectTrigger(effects, { x: 2 * 16 + 8, y: 2 * 16 + 8 }, TILE)).toBeNull();
    expect(resolveTileEffectTrigger([], { x: 8, y: 8 }, TILE)).toBeNull();
  });

  it("각 종류의 발동 결과를 반환한다", () => {
    const center = (tile: number) => tile * 16 + 8;
    const spawn = resolveTileEffectTrigger(effects, { x: center(0), y: center(0) }, TILE);
    expect(spawn).toMatchObject({ kind: "spawn", tileX: 0, tileY: 0 });
    const blocked = resolveTileEffectTrigger(effects, { x: center(4), y: center(4) }, TILE);
    expect(blocked?.kind).toBe("blocked");
    const portal = resolveTileEffectTrigger(effects, { x: center(8), y: center(8) }, TILE);
    expect(portal).toMatchObject({ kind: "portal", room: "recording-booth", tileX: 6, tileY: 4 });
    const zone = resolveTileEffectTrigger(effects, { x: center(12), y: center(12) }, TILE);
    expect(zone).toMatchObject({ kind: "zone", tag: "silent" });
    const youtube = resolveTileEffectTrigger(effects, { x: center(16), y: center(16) }, TILE);
    expect(youtube).toMatchObject({ kind: "youtube", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ" });
    const weblink = resolveTileEffectTrigger(effects, { x: center(20), y: center(20) }, TILE);
    expect(weblink).toMatchObject({ kind: "weblink", url: "https://toon.example/board" });
  });

  it("BGM은 타일 반경 범위에서 발동하고 벗어나면 발동하지 않는다", () => {
    // bgm-a는 (24,24) 타일, 반경 2타일. 중심에서 2타일 떨어진 지점은 범위 안.
    const inside = resolveTileEffectTrigger(effects, { x: 24 * 16 + 8, y: (24 + 2) * 16 }, TILE);
    expect(inside).toMatchObject({ kind: "bgm", radius: 2, volume: 0.5, url: "/assets/bgm.ogg" });
    // 3타일 이상 떨어지면 범위 밖.
    const outside = resolveTileEffectTrigger(effects, { x: 24 * 16 + 8, y: (24 + 4) * 16 }, TILE);
    expect(outside).toBeNull();
  });

  it("겹치는 이펙트는 우선순위(blocked > portal > … > spawn)로 하나만 반환한다", () => {
    const overlapped: readonly StudioTileEffectDefinition[] = [
      created({ kind: "spawn", id: "s", tileX: 1, tileY: 1 }).effect,
      created({ kind: "portal", id: "p", tileX: 1, tileY: 1, destinationRoom: "recording-booth" }).effect,
      created({ kind: "blocked", id: "b", tileX: 1, tileY: 1 }).effect,
    ];
    const trigger = resolveTileEffectTrigger(overlapped, { x: 24, y: 24 }, TILE);
    expect(trigger?.kind).toBe("blocked");
  });

  it("잘못된 탐침·타일 크기는 발동하지 않는다", () => {
    const probe = { x: 8, y: 8 };
    expect(resolveTileEffectTrigger(effects, { x: NaN, y: 8 }, TILE)).toBeNull();
    expect(resolveTileEffectTrigger(effects, probe, { width: 0, height: 16 })).toBeNull();
  });
});

describe("스포트라이트 타일 이펙트", () => {
  it("추가 파라미터 없이 생성된다", () => {
    const result = created({ kind: "spotlight", id: "stage-a", tileX: 28, tileY: 28, width: 4, height: 2 });
    expect(result.effect).toMatchObject({ kind: "spotlight", id: "stage-a", tileX: 28, tileY: 28 });
    expect(result.warnings).toEqual([]);
  });

  it("무대에 진입하면 스포트라이트 발동 결과를 반환한다", () => {
    const effects: readonly StudioTileEffectDefinition[] = [
      created({ kind: "spotlight", id: "stage-a", tileX: 28, tileY: 28, width: 4, height: 2 }).effect,
    ];
    const trigger = resolveTileEffectTrigger(effects, { x: 30 * 16 + 8, y: 29 * 16 + 8 }, TILE);
    expect(trigger).toMatchObject({ kind: "spotlight", tileX: 28, tileY: 28 });
    const outside = resolveTileEffectTrigger(effects, { x: 8, y: 8 }, TILE);
    expect(outside).toBeNull();
  });

  it("우선순위는 zone 다음, youtube 이전이다", () => {
    const overlapped: readonly StudioTileEffectDefinition[] = [
      created({ kind: "youtube", id: "v", tileX: 1, tileY: 1, url: "https://youtu.be/dQw4w9WgXcQ" }).effect,
      created({ kind: "spotlight", id: "s", tileX: 1, tileY: 1 }).effect,
    ];
    expect(resolveTileEffectTrigger(overlapped, { x: 24, y: 24 }, TILE)?.kind).toBe("spotlight");
    const withZone: readonly StudioTileEffectDefinition[] = [
      created({ kind: "spotlight", id: "s", tileX: 1, tileY: 1 }).effect,
      created({ kind: "zone", id: "z", tileX: 1, tileY: 1, zoneTag: "private" }).effect,
    ];
    expect(resolveTileEffectTrigger(withZone, { x: 24, y: 24 }, TILE)?.kind).toBe("zone");
  });
});

describe("타일 포함·BGM 범위 헬퍼", () => {
  it("타일 사각형 경계는 왼쪽/위 포함, 오른쪽/아래 제외다", () => {
    const effect = created({ kind: "zone", tileX: 2, tileY: 3, width: 2, height: 1 }).effect;
    expect(studioTileEffectContains(effect, { x: 32, y: 48 }, TILE)).toBe(true);
    expect(studioTileEffectContains(effect, { x: 64, y: 48 }, TILE)).toBe(false);
    expect(studioTileEffectContains(effect, { x: 63.9, y: 63.9 }, TILE)).toBe(true);
  });

  it("BGM 범위는 사각형 밖에서도 반경 안이면 재생 의도다", () => {
    const bgm = created({ kind: "bgm", tileX: 10, tileY: 10, url: "/b.ogg", radius: 1 }).effect;
    if (bgm.kind !== "bgm") throw new Error("BGM이 아님");
    expect(studioTileBgmCovers(bgm, { x: 10 * 16 + 8, y: 10 * 16 + 8 }, TILE)).toBe(true);
    expect(studioTileBgmCovers(bgm, { x: 10 * 16 + 8, y: 12 * 16 }, TILE)).toBe(true);
    expect(studioTileBgmCovers(bgm, { x: 10 * 16 + 8, y: 13 * 16 }, TILE)).toBe(false);
  });
});

describe("양방향 포털 쌍", () => {
  it("A→B, B→A 목적지가 서로를 가리킨다", () => {
    const result = createStudioTilePortalPair({
      endpointA: { room: "conti-room", tileX: 6, tileY: 4 },
      endpointB: { room: "recording-booth", tileX: 6, tileY: 4 },
      nameA: "콘티룸 → 녹음부스",
      nameB: "녹음부스 → 콘티룸",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("쌍 생성 실패");
    const [a, b] = result.effects;
    expect(a.kind).toBe("portal"); expect(b.kind).toBe("portal");
    if (a.kind !== "portal" || b.kind !== "portal") throw new Error("포털이 아님");
    expect(a.destinationRoom).toBe("recording-booth");
    expect(a.destinationTileX).toBe(6); expect(a.destinationTileY).toBe(4);
    expect(b.destinationRoom).toBe("conti-room");
    expect(b.name).toBe("녹음부스 → 콘티룸");
    expect(a.id).not.toBe(b.id);
  });

  it("한쪽 구역이 비어 있으면 쌍 전체가 실패한다", () => {
    const result = createStudioTilePortalPair({
      endpointA: { room: "conti-room", tileX: 6, tileY: 4 },
      endpointB: { room: "  ", tileX: 6, tileY: 4 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("missing-destination-room");
  });

  it("콘티룸↔녹음부스 프리셋으로 쌍을 만들고 좌표를 덮어쓸 수 있다", () => {
    expect(STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH.roomA).toBe("conti-room");
    expect(STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH.roomB).toBe("recording-booth");
    const result = createStudioTilePortalPairFromPreset(
      STUDIO_TILE_PORTAL_PRESET_CONTI_ROOM_RECORDING_BOOTH,
      { nameA: "콘티룸 → 녹음부스", nameB: "녹음부스 → 콘티룸", tileA: { tileX: 1, tileY: 1 } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("프리셋 실패");
    const [a, b] = result.effects;
    expect(a.tileX).toBe(1); expect(a.tileY).toBe(1);
    if (a.kind !== "portal" || b.kind !== "portal") throw new Error("포털이 아님");
    expect(a.destinationRoom).toBe("recording-booth");
    expect(b.destinationRoom).toBe("conti-room");
  });
});

describe("오피스 존 입장 파티클 (Track D)", () => {
  it("10개 존 종류 모두에 파티클 스펙이 정의된다", () => {
    expect(Object.keys(STUDIO_ZONE_ENTRY_PARTICLES)).toHaveLength(10);
    for (const spec of Object.values(STUDIO_ZONE_ENTRY_PARTICLES)) {
      expect(spec.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(spec.count).toBeGreaterThan(0);
      expect(spec.durationMs).toBeGreaterThan(0);
    }
  });

  it("일반 모드에서는 파티클 스펙을 반환한다", () => {
    const spec = zoneEntryParticles("event-hall", { reducedMotion: false });
    expect(spec?.shape).toBe("star");
    expect(spec?.count).toBe(12);
  });

  it("reducedMotion이면 파티클이 꺼진다", () => {
    expect(zoneEntryParticles("lobby", { reducedMotion: true })).toBeNull();
  });
});

describe("인월드 앱 타일 (T4-lite)", () => {
  it("https URL과 allowApi·title을 살균해 보관한다", () => {
    const { effect } = created({ kind: "app", tileX: 1, tileY: 1, url: " https://example.com/tool ", allowApi: true, title: "회의 타이머" });
    expect(effect.kind).toBe("app");
    if (effect.kind === "app") {
      expect(effect.url).toBe("https://example.com/tool");
      expect(effect.allowApi).toBe(true);
      expect(effect.title).toBe("회의 타이머");
    }
  });

  it("내장 앱 주소(toonstudio://timer)를 허용한다", () => {
    const { effect } = created({ kind: "app", tileX: 0, tileY: 0, url: "toonstudio://timer" });
    expect(effect.kind).toBe("app");
    if (effect.kind === "app") expect(effect.url).toBe("toonstudio://timer");
  });

  it("allowApi 기본값은 false이고 title이 비면 이펙트 이름으로 대체한다", () => {
    const { effect } = created({ kind: "app", tileX: 0, tileY: 0, url: "https://example.com", name: "포커스 존" });
    if (effect.kind === "app") {
      expect(effect.allowApi).toBe(false);
      expect(effect.title).toBe("포커스 존");
    }
  });

  it("http(s)도 내장 주소도 아닌 URL은 거부한다", () => {
    const ftp = createTileEffect({ kind: "app", tileX: 0, tileY: 0, url: "ftp://example.com/x" });
    expect(ftp.ok).toBe(false);
    if (!ftp.ok) expect(ftp.errors[0]?.code).toBe("unsupported-url-scheme");
    const junk = createTileEffect({ kind: "app", tileX: 0, tileY: 0, url: "그냥 텍스트" });
    expect(junk.ok).toBe(false);
    const missing = createTileEffect({ kind: "app", tileX: 0, tileY: 0 });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]?.code).toBe("missing-url");
  });

  it("앱 타일 위에 서면 app 트리거가 발동한다", () => {
    const { effect } = created({ kind: "app", tileX: 2, tileY: 3, url: "toonstudio://timer", allowApi: true });
    const trigger = resolveTileEffectTrigger([effect], { x: 40, y: 56 }, TILE);
    expect(trigger?.kind).toBe("app");
    if (trigger?.kind === "app") {
      expect(trigger.url).toBe("toonstudio://timer");
      expect(trigger.allowApi).toBe(true);
    }
    expect(resolveTileEffectTrigger([effect], { x: 4, y: 4 }, TILE)).toBeNull();
  });
});
