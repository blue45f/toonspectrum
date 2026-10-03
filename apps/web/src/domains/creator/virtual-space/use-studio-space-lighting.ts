import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  setStudioLightFixtureDimmer,
  studioAmbientLightFor,
  toggleStudioLightFixture,
  type StudioLightFixture,
} from "./studio-virtual-space-lighting";
import {
  STUDIO_DAY_NIGHT_CYCLE_MS,
  studioDayNightTimeOfDay,
} from "./studio-virtual-space-day-night-cycle";
import {
  createStudioLightFixturesForPreset,
  type StudioLightingPresetKey,
} from "./studio-virtual-space-lighting-presets";
import {
  modulateStudioDayNightFixtures,
  studioDayNightLightingPhaseAt,
  studioLightingPresetForDayNightPhase,
  type StudioDayNightLightingPhase,
} from "./studio-virtual-space-day-night-lighting";

/**
 * 조명 기구와 주야 사이클 상태. 기구 상태는 브릿지로 캔버스 오브젝트 광원
 * 런타임에 전달하고, 사이클이 켜져 있으면 자동 모드가 시간대 프리셋을 적용한다.
 */
export function useStudioSpaceLighting(engineBridge: StudioVirtualSpaceEngineBridge) {
  const [lightFixtures, setLightFixtures] = useState<readonly StudioLightFixture[]>([]);
  const [lightHourOverride, setLightHourOverride] = useState<number | null>(null);
  const [dayNightEnabled, setDayNightEnabled] = useState(false);
  const [dayNightSpeedMs, setDayNightSpeedMs] = useState(STUDIO_DAY_NIGHT_CYCLE_MS);
  const [dayNightNowMs, setDayNightNowMs] = useState(0);
  const dayNightStartRef = useRef(0);
  const dayNightSpeedRef = useRef(STUDIO_DAY_NIGHT_CYCLE_MS);
  /** 주야 사이클 자동 조명 (시간대 프리셋 자동 적용) on/off. 수동 조작 시 꺼진다. */
  const [lightAutoMode, setLightAutoMode] = useState(true);
  const lastAutoLightingPhaseRef = useRef<StudioDayNightLightingPhase | null>(null);

  // 주야 사이클 가상 시계: 활성화 동안 1초마다 브릿지에 가상 시각을 갱신한다
  useEffect(() => {
    dayNightSpeedRef.current = dayNightSpeedMs;
  }, [dayNightSpeedMs]);
  useEffect(() => {
    if (!dayNightEnabled) {
      engineBridge.setDayNightCycle({ enabled: false, startMs: 0, now: 0 });
      return;
    }
    const tick = () => {
      const now = Date.now();
      engineBridge.setDayNightCycle({ enabled: true, startMs: dayNightStartRef.current, now, cycleMs: dayNightSpeedRef.current });
      setDayNightNowMs(now);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { clearInterval(id); };
  }, [dayNightEnabled, engineBridge]);
  // 사이클을 끄면 마지막 자동 적용 시간대를 잊어, 다시 켤 때 즉시 적용한다.
  useEffect(() => {
    if (!dayNightEnabled) lastAutoLightingPhaseRef.current = null;
  }, [dayNightEnabled]);

  // 조명 기구 상태를 캔버스의 오브젝트 광원 런타임으로 전달한다 (국소 글로우 렌더용).
  useEffect(() => {
    engineBridge.setLightFixtures(lightFixtures);
  }, [engineBridge, lightFixtures]);

  // 주야 자동 조명: 사이클이 켜져 있고 자동 모드면 시간대가 바뀔 때마다
  // 해당 시간대 프리셋을 창문·네온 국소 보정과 함께 자동 적용한다.
  useEffect(() => {
    if (!dayNightEnabled || !lightAutoMode) return;
    const fraction = studioDayNightTimeOfDay(dayNightNowMs, dayNightStartRef.current, dayNightSpeedMs);
    const phase = studioDayNightLightingPhaseAt(fraction);
    if (lastAutoLightingPhaseRef.current === phase) return;
    lastAutoLightingPhaseRef.current = phase;
    setLightFixtures(modulateStudioDayNightFixtures(
      createStudioLightFixturesForPreset(studioLightingPresetForDayNightPhase(phase)),
      fraction,
    ));
  }, [dayNightEnabled, lightAutoMode, dayNightNowMs, dayNightSpeedMs]);

  const toggleDayNight = useCallback(() => {
    setDayNightEnabled((current) => {
      if (!current) {
        // 켜는 순간 가상 시계는 실제 시간대에서 시작한다
        const now = Date.now();
        const date = new Date(now);
        const realFraction = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) / 86400;
        dayNightStartRef.current = now - realFraction * dayNightSpeedRef.current;
        setDayNightNowMs(now);
      }
      return !current;
    });
  }, []);
  const scrubDayNight = useCallback((timeOfDay: number) => {
    const now = Date.now();
    dayNightStartRef.current = now - timeOfDay * dayNightSpeedRef.current;
    engineBridge.setDayNightCycle({ enabled: true, startMs: dayNightStartRef.current, now, cycleMs: dayNightSpeedRef.current });
    setDayNightNowMs(now);
  }, [engineBridge]);
  const changeDayNightSpeed = useCallback((cycleMs: number) => {
    const now = Date.now();
    const fraction = studioDayNightTimeOfDay(now, dayNightStartRef.current, dayNightSpeedRef.current);
    dayNightStartRef.current = now - fraction * cycleMs;
    setDayNightSpeedMs(cycleMs);
    if (dayNightEnabled) {
      engineBridge.setDayNightCycle({ enabled: true, startMs: dayNightStartRef.current, now, cycleMs });
    }
  }, [dayNightEnabled, engineBridge]);

  const lightHour = new Date().getHours();
  const lightAmbient = studioAmbientLightFor(lightHourOverride ?? lightHour, null);
  const toggleLightFixture = useCallback((id: string) => {
    setLightAutoMode(false);
    setLightFixtures((current) => toggleStudioLightFixture(current, id));
  }, []);
  const changeLightDimmer = useCallback((id: string, dimmer: number) => {
    setLightAutoMode(false);
    setLightFixtures((current) => setStudioLightFixtureDimmer(current, id, dimmer));
  }, []);
  const applyLightPreset = useCallback((key: StudioLightingPresetKey) => {
    setLightAutoMode(false);
    setLightFixtures(createStudioLightFixturesForPreset(key));
  }, []);

  const cycleTimeOfDay = studioDayNightTimeOfDay(dayNightNowMs, dayNightStartRef.current, dayNightSpeedMs);

  return {
    lightFixtures,
    lightHourOverride,
    setLightHourOverride,
    lightAmbient,
    lightHour,
    toggleLightFixture,
    changeLightDimmer,
    applyLightPreset,
    dayNightEnabled,
    lightAutoMode,
    setLightAutoMode,
    cycleTimeOfDay,
    dayNightSpeedMs,
    toggleDayNight,
    scrubDayNight,
    changeDayNightSpeed,
  };
}
