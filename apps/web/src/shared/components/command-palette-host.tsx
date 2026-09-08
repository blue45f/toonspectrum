import { lazy, Suspense, useEffect } from "react";

import {
  requestStudioCommandSearchFromAppShell,
} from "@/shared/lib/studio-command-search-bridge";
import { useUi } from "@/shared/lib/ui-store";

const CommandPalette = lazy(() => import("./command-palette").then((mod) => ({ default: mod.CommandPalette })));

function isStudioPathname(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

export function CommandPaletteHost() {
  const open = useUi((s) => s.commandPaletteOpen);
  const toggle = useUi((s) => s.toggleCommandPalette);
  const setOpen = useUi((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 1. Cmd+K / Ctrl+K: use Studio's registry-backed command hub while editing.
      // If the Studio host is not mounted yet, retain the global palette as a reliable fallback.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (
          isStudioPathname(window.location.pathname)
          && requestStudioCommandSearchFromAppShell({ scope: "all" })
        ) {
          setOpen(false);
          return;
        }
        toggle();
        return;
      }

      // 2. '/' shortcut outside of editable fields and studio canvas
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/studio")
      ) {
        const target = e.target as HTMLElement | null;
        const tagName = target?.tagName;
        const isEditable =
          Boolean(target?.isContentEditable) ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT";

        if (!isEditable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle, setOpen]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}