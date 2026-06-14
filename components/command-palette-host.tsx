"use client";

import { lazy, Suspense, useEffect } from "react";

import { useUi } from "@/lib/ui-store";

const CommandPalette = lazy(() => import("./command-palette").then((mod) => ({ default: mod.CommandPalette })));

export function CommandPaletteHost() {
  const open = useUi((s) => s.commandPaletteOpen);
  const toggle = useUi((s) => s.toggleCommandPalette);
  const setOpen = useUi((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
