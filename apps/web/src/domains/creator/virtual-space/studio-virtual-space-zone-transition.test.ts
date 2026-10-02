import { describe, expect, it } from "vitest";
import {
  STUDIO_ZONE_FADE_IN_MS,
  STUDIO_ZONE_FADE_OUT_MS,
  STUDIO_ZONE_HOLD_MS,
  STUDIO_ZONE_SPAWN_FADE_IN_MS,
  beginStudioZoneDepartureTransition,
  beginStudioZonePortalTransition,
  beginStudioZoneSpawnTransition,
  createStudioZoneTransitionState,
  markStudioZoneTransitionReady,
  revealStudioZoneTransition,
  stepStudioZoneTransition,
  studioZoneSplashEligible,
} from "./studio-virtual-space-zone-transition";
import { STUDIO_VIRTUAL_CAMPUS_COMMONS_ID } from "./studio-virtual-space-campus-world";

const T0 = 1_000;

describe("구역 전환 상태 머신 — 포털 순간이동", () => {
  it("fade-out → hold → 텔레포트 1회 → fade-in → idle 순서로 진행된다", () => {
    let state = beginStudioZonePortalTransition(createStudioZoneTransitionState(), {
      zoneId: "meeting-room",
      now: T0,
      reducedMotion: false,
    });

    // 페이드아웃 중간: 베일이 절반쯤 차오르고 입력이 막힌다.
    let stepped = stepStudioZoneTransition(state, T0 + STUDIO_ZONE_FADE_OUT_MS / 2);
    state = stepped.state;
    expect(stepped.frame.phase).toBe("fade-out");
    expect(stepped.frame.veilAlpha).toBeGreaterThan(0);
    expect(stepped.frame.veilAlpha).toBeLessThan(1);
    expect(stepped.frame.blocksInput).toBe(true);
    expect(stepped.frame.teleportDue).toBe(false);

    // 페이드아웃 종료 직후는 hold — 아직 텔레포트 전이다.
    stepped = stepStudioZoneTransition(state, T0 + STUDIO_ZONE_FADE_OUT_MS);
    state = stepped.state;
    expect(stepped.frame.phase).toBe("hold");
    expect(stepped.frame.veilAlpha).toBe(1);
    expect(stepped.frame.teleportDue).toBe(false);

    // hold가 끝나면 텔레포트가 정확히 한 번만 신호된다.
    const teleportAt = T0 + STUDIO_ZONE_FADE_OUT_MS + STUDIO_ZONE_HOLD_MS;
    stepped = stepStudioZoneTransition(state, teleportAt);
    state = stepped.state;
    expect(stepped.frame.teleportDue).toBe(true);
    expect(stepped.frame.phase).toBe("fade-in");
    expect(stepped.frame.blocksInput).toBe(false);

    stepped = stepStudioZoneTransition(state, teleportAt + 40);
    state = stepped.state;
    expect(stepped.frame.teleportDue).toBe(false);
    expect(stepped.frame.fadeInProgress).not.toBeNull();

    // 페이드인이 끝나면 idle로 돌아오고 베일은 완전히 사라진다.
    stepped = stepStudioZoneTransition(state, teleportAt + STUDIO_ZONE_FADE_IN_MS);
    expect(stepped.state.phase).toBe("idle");
    expect(stepped.frame.veilAlpha).toBe(0);
    expect(stepped.frame.active).toBe(false);
    expect(stepped.frame.fadeInProgress).toBe(1);
  });

  it("베일 알파는 페이드아웃에서 단조 증가, 페이드인에서 단조 감소한다", () => {
    let state = beginStudioZonePortalTransition(createStudioZoneTransitionState(), {
      zoneId: null,
      now: T0,
      reducedMotion: false,
    });
    let previous = -1;
    for (let t = T0; t <= T0 + STUDIO_ZONE_FADE_OUT_MS; t += 20) {
      const stepped = stepStudioZoneTransition(state, t);
      state = stepped.state;
      expect(stepped.frame.veilAlpha).toBeGreaterThanOrEqual(previous);
      previous = stepped.frame.veilAlpha;
    }
    const teleportAt = T0 + STUDIO_ZONE_FADE_OUT_MS + STUDIO_ZONE_HOLD_MS;
    state = stepStudioZoneTransition(state, teleportAt).state;
    previous = Number.POSITIVE_INFINITY;
    for (let t = teleportAt; t <= teleportAt + STUDIO_ZONE_FADE_IN_MS; t += 20) {
      const stepped = stepStudioZoneTransition(state, t);
      state = stepped.state;
      expect(stepped.frame.veilAlpha).toBeLessThanOrEqual(previous);
      previous = stepped.frame.veilAlpha;
    }
    expect(previous).toBe(0);
  });

  it("reduced-motion이면 베일 없이 즉시 텔레포트하고 끝난다", () => {
    const state = beginStudioZonePortalTransition(createStudioZoneTransitionState(), {
      zoneId: "studio",
      now: T0,
      reducedMotion: true,
    });
    const stepped = stepStudioZoneTransition(state, T0);
    expect(stepped.frame.teleportDue).toBe(true);
    expect(stepped.frame.veilAlpha).toBe(0);
    expect(stepped.frame.blocksInput).toBe(false);
    expect(stepped.state.phase).toBe("idle");
  });

  it("진행 중에는 새 시퀀스를 시작하지 않는다", () => {
    const state = beginStudioZonePortalTransition(createStudioZoneTransitionState(), {
      zoneId: "a",
      now: T0,
      reducedMotion: false,
    });
    const again = beginStudioZoneSpawnTransition(state, {
      zoneId: "b",
      now: T0 + 10,
      reducedMotion: false,
    });
    expect(again).toBe(state);
  });
});

describe("구역 전환 상태 머신 — 월드 전환 출발", () => {
  it("페이드아웃이 끝나면 departureDue를 한 번 알리고 도착 신호를 기다린다", () => {
    let state = beginStudioZoneDepartureTransition(createStudioZoneTransitionState(), {
      now: T0,
      reducedMotion: false,
    });
    let stepped = stepStudioZoneTransition(state, T0 + STUDIO_ZONE_FADE_OUT_MS);
    state = stepped.state;
    expect(stepped.frame.departureDue).toBe(true);
    expect(stepped.frame.phase).toBe("awaiting-arrival");
    expect(stepped.frame.veilAlpha).toBe(1);
    expect(stepped.frame.blocksInput).toBe(true);

    // 신호가 없으면 아무리 시간이 지나도 화면은 열리지 않는다 (타이머 복귀 없음).
    stepped = stepStudioZoneTransition(state, T0 + 60_000);
    state = stepped.state;
    expect(stepped.frame.departureDue).toBe(false);
    expect(stepped.frame.phase).toBe("awaiting-arrival");
    expect(stepped.frame.veilAlpha).toBe(1);

    // 같은 장소로 확정 신호가 오면 페이드인으로 화면을 연다.
    state = revealStudioZoneTransition(state, T0 + 60_000);
    stepped = stepStudioZoneTransition(state, T0 + 60_000 + STUDIO_ZONE_FADE_IN_MS);
    expect(stepped.state.phase).toBe("idle");
    expect(stepped.frame.veilAlpha).toBe(0);
  });

  it("reduced-motion 출발은 베일 없이 바로 콜백을 알린다", () => {
    const state = beginStudioZoneDepartureTransition(createStudioZoneTransitionState(), {
      now: T0,
      reducedMotion: true,
    });
    const stepped = stepStudioZoneTransition(state, T0);
    expect(stepped.frame.departureDue).toBe(true);
    expect(stepped.frame.veilAlpha).toBe(0);
    const revealed = revealStudioZoneTransition(stepped.state, T0);
    expect(stepStudioZoneTransition(revealed, T0).state.phase).toBe("idle");
  });
});

describe("구역 전환 상태 머신 — 스폰 도착", () => {
  it("준비 완료 신호 전에는 화면이 열리지 않고, 신호 후 스폰 페이드인으로 열린다", () => {
    let state = beginStudioZoneSpawnTransition(createStudioZoneTransitionState(), {
      zoneId: "lobby",
      now: T0,
      reducedMotion: false,
    });
    // 시간이 흘러도 준비 신호가 없으면 hold가 유지된다.
    let stepped = stepStudioZoneTransition(state, T0 + 10_000);
    state = stepped.state;
    expect(stepped.frame.phase).toBe("hold");
    expect(stepped.frame.veilAlpha).toBe(1);
    expect(stepped.frame.blocksInput).toBe(true);

    state = markStudioZoneTransitionReady(state, T0 + 10_000);
    stepped = stepStudioZoneTransition(state, T0 + 10_000 + STUDIO_ZONE_SPAWN_FADE_IN_MS / 2);
    state = stepped.state;
    expect(stepped.frame.phase).toBe("fade-in");
    expect(stepped.frame.veilAlpha).toBeGreaterThan(0);
    expect(stepped.frame.veilAlpha).toBeLessThan(1);
    expect(stepped.frame.fadeInProgress).toBeCloseTo(0.5, 1);
    expect(stepped.frame.blocksInput).toBe(false);

    stepped = stepStudioZoneTransition(state, T0 + 10_000 + STUDIO_ZONE_SPAWN_FADE_IN_MS);
    expect(stepped.state.phase).toBe("idle");
    expect(stepped.frame.veilAlpha).toBe(0);
  });

  it("reduced-motion 스폰은 신호 즉시 열린다", () => {
    let state = beginStudioZoneSpawnTransition(createStudioZoneTransitionState(), {
      zoneId: "lobby",
      now: T0,
      reducedMotion: true,
    });
    expect(stepStudioZoneTransition(state, T0).frame.veilAlpha).toBe(0);
    state = markStudioZoneTransitionReady(state, T0);
    expect(stepStudioZoneTransition(state, T0).state.phase).toBe("idle");
  });

  it("준비 신호·복귀 신호는 해당 상태가 아니면 무시된다", () => {
    const idle = createStudioZoneTransitionState();
    expect(markStudioZoneTransitionReady(idle, T0)).toBe(idle);
    expect(revealStudioZoneTransition(idle, T0)).toBe(idle);
    const portal = beginStudioZonePortalTransition(idle, {
      zoneId: null,
      now: T0,
      reducedMotion: false,
    });
    expect(markStudioZoneTransitionReady(portal, T0)).toBe(portal);
    expect(revealStudioZoneTransition(portal, T0)).toBe(portal);
  });
});

describe("구역 스플래시 적격 판정", () => {
  it("첫 진입과 구역 이동 모두 적격이고, 공용 구역·미확정은 제외한다", () => {
    expect(studioZoneSplashEligible({ roomId: "meeting-room" })).toBe(true);
    expect(studioZoneSplashEligible({ roomId: STUDIO_VIRTUAL_CAMPUS_COMMONS_ID })).toBe(false);
    expect(studioZoneSplashEligible({ roomId: null })).toBe(false);
  });
});
