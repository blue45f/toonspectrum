import { buttonClass, type Size, type Variant } from "./button-utils";
import { Slot } from "./slot";

// StudioPage.tsx 등 다른 에이전트 소유 파일이 이 경로에서 buttonClass를 import하므로 재노출 유지.
// eslint-disable-next-line react-refresh/only-export-components -- back-compat re-export for files that import buttonClass from "@/components/ui/button"
export { buttonClass } from "./button-utils";

export function Button({
  variant = "solid",
  size = "md",
  className,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={buttonClass({ variant, size, className })} {...props} />;
}
