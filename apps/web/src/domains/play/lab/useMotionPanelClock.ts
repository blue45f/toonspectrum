import { useEffect, useRef, useState } from "react";
import { useMotionEnvironment } from "@/shared/components/comic/useMotionEnvironment";
import { MOTION_DURATION, motionProgress } from "./motion-panel-model";

export function useMotionPanelClock() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const position = useRef(0);
  const environment = useMotionEnvironment();
  useEffect(() => { if (!environment.canAnimate) setPlaying(false); }, [environment.canAnimate]);
  useEffect(() => {
    if (!playing || !environment.canAnimate) return;
    const origin = position.current; const start = performance.now(); let frame = 0;
    const tick = (now: number) => {
      const next = motionProgress(origin + (now - start) / MOTION_DURATION);
      position.current = next; setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick); else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, environment.canAnimate]);
  const seek = (next: number) => { setPlaying(false); position.current = motionProgress(next); setProgress(position.current); };
  const play = () => {
    if (!environment.canAnimate) return;
    if (position.current >= 1) { position.current = 0; setProgress(0); }
    setPlaying(true);
  };
  return { progress, playing, play, pause: () => setPlaying(false), seek, ...environment };
}
