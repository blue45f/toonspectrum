import { ArrowLeft } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type StudioEditorReturnButtonVariant = "lane" | "immersive" | "canvas-only";

export function StudioEditorReturnButton({
  className,
  onReturn,
  variant,
}: {
  readonly className?: string;
  readonly onReturn: () => void;
  readonly variant: StudioEditorReturnButtonVariant;
}) {
  const canvasOnly = variant === "canvas-only";
  return (
    <button
      type="button"
      aria-label="이전 화면으로 돌아가기"
      data-studio-editor-return={variant}
      title="이전 화면으로 돌아가기"
      onClick={onReturn}
      className={cn(
        buttonClass({ size: "sm", variant: "quiet" }),
        "min-h-11 min-w-11 shrink-0 gap-1.5",
        variant === "lane" &&
          "border border-line/70 bg-panel/95 px-2.5",
        variant === "immersive" &&
          "rounded-full border border-line/70 bg-raised/80 px-2.5 max-[429px]:size-11 max-[429px]:px-0",
        canvasOnly && "rounded-full border border-line bg-panel/95 px-3 shadow-lg backdrop-blur",
        className,
      )}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      <span
        className={canvasOnly ? undefined : variant === "lane" ? "hidden lg:inline" : "sr-only"}
      >
        {canvasOnly ? "이전 화면" : "이전"}
      </span>
    </button>
  );
}
