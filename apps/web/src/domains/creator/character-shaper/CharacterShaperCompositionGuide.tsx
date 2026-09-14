import { useEffect, useRef, useState } from "react";

import { characterFrameRect } from "./character-shaper-framing";

import type { CharacterOutputFraming } from "./character-shaper-framing";

/** DOM-only annotations never enter a scene capture. */
export function CharacterShaperCompositionGuide({ framing }: { readonly framing: CharacterOutputFraming }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      setSize({ width: bounds.width, height: bounds.height });
    };
    update();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const enabled = framing.aspect !== "viewport" || framing.guide !== "none" || framing.safeArea;
  const rect = size.width > 0 && size.height > 0 ? characterFrameRect(size.width, size.height, framing.aspect) : null;
  const divisions = framing.guide === "thirds" ? [1 / 3, 2 / 3] : framing.guide === "center" ? [0.5] : [];
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden" data-character-composition-guide={framing.aspect}>
      {enabled && rect ? <div style={{
        position: "absolute", left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
        boxShadow: framing.aspect === "viewport" ? undefined : "0 0 0 100vmax rgb(0 0 0 / 0.42)",
      }} className="border border-white/80" data-character-output-frame="true">
        {divisions.map((fraction) => <div key={`v${fraction}`} className="absolute inset-y-0 border-l border-white/55" style={{ left: `${fraction * 100}%` }} />)}
        {divisions.map((fraction) => <div key={`h${fraction}`} className="absolute inset-x-0 border-t border-white/55" style={{ top: `${fraction * 100}%` }} />)}
        {framing.safeArea ? <div className="absolute inset-[5%] border border-dashed border-white/75" data-character-safe-area="true" /> : null}
      </div> : null}
    </div>
  );
}
