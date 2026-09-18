import * as Dialog from "@radix-ui/react-dialog";
import { Palette, X } from "lucide-react";

import { AppearanceSettings } from "./AppearanceSettings";

import { useI18n } from "@/shared/lib/i18n";
import type { AppearanceScope } from "@/shared/lib/theme-presets";

export function AppearanceDialog({ scope, onClose, returnFocusElement }: {
  scope: AppearanceScope;
  onClose: () => void;
  returnFocusElement: HTMLButtonElement | null;
}) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="appearance-overlay" />
        <Dialog.Content className="appearance-dialog"
          onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocusElement?.isConnected) returnFocusElement.focus(); }}>
          <header className="appearance-dialog-header">
            <div>
              <Dialog.Title><Palette size={20} aria-hidden />{korean ? "디자인 테마" : "Design themes"}</Dialog.Title>
              <Dialog.Description>{korean ? "나에게 맞는 작업실 분위기를 선택하세요." : "Choose an appearance for your workspace."}</Dialog.Description>
            </div>
            <Dialog.Close className="appearance-close" aria-label={korean ? "테마 설정 닫기" : "Close theme settings"}><X size={20} aria-hidden /></Dialog.Close>
          </header>
          <AppearanceSettings initialScope={scope} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
