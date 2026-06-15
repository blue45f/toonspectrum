"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const CommandPalette = lazy(() => import("./command-palette").then((mod) => ({ default: mod.CommandPalette })));

export function CommandPaletteHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    globalThis.addEventListener("keydown", onKey);
    globalThis.addEventListener("toonspectrum:search", onOpen);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
      globalThis.removeEventListener("toonspectrum:search", onOpen);
    };
  }, []);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
