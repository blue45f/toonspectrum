import type { Clock } from "../engine/core/types";
import type { LaneEnvironment } from "../lanes/lane";

/**
 * 브라우저 전역을 레인 환경으로 포장한다. 엔진·레인은 전역을 직접 만지지 않으므로
 * `navigator.gpu`·캔버스 생성·시계를 여기서 한 번만 주입한다.
 */

export function performanceClock(): Clock {
  return { now: () => performance.now() };
}

export function createBrowserLaneEnvironment(): LaneEnvironment {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const env: LaneEnvironment = {
    gpu: nav && "gpu" in nav ? (nav.gpu ?? null) : null,
    createCanvas: (w, h) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      return canvas;
    },
    clock: performanceClock(),
  };
  if (nav) env.userAgent = nav.userAgent;
  return env;
}
