import "./studio-document-chrome.css";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { useStudioChromePortalTarget } from "./use-studio-chrome-portal-target";

export function StudioDocumentChromeSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current?.closest<HTMLElement>('[data-studio-app-menubar="true"]');
    const editor = menu?.closest<HTMLElement>('[data-studio-editor="true"]');
    if (!menu || !editor) return;
    const property = "--studio-immersive-menubar-block";
    const previous = editor.style.getPropertyValue(property);
    const measure = () => editor.style.setProperty(property, `${Math.ceil(menu.getBoundingClientRect().height) + 12}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(menu);
    return () => {
      observer?.disconnect();
      if (previous) editor.style.setProperty(property, previous);
      else editor.style.removeProperty(property);
    };
  }, []);
  return <div ref={ref} id="studio-document-chrome-slot" data-studio-document-chrome-slot="true" />;
}

export function StudioChromePortal({ targetId, children }: { targetId: string; children: ReactNode }) {
  const target = useStudioChromePortalTarget(targetId);
  return target ? createPortal(children, target) : children;
}
