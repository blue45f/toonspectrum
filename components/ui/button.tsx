import { cn } from "@/lib/utils";
import { Slot } from "./slot";

type Variant = "solid" | "ghost" | "quiet" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[0.7rem] font-medium transition-[background,color,border-color,transform,box-shadow] duration-150 ease-out-expo select-none disabled:opacity-45 disabled:pointer-events-none active:scale-[0.985]";

const variants: Record<Variant, string> = {
  solid:
    "bg-accent text-on-accent shadow-[0_1px_0_0_oklch(1_0_0/0.12)_inset] hover:bg-accent-2 hover:shadow-[0_1px_0_0_oklch(1_0_0/0.12)_inset,0_8px_24px_-8px_oklch(0.72_0.185_42/0.55)]",
  outline: "border border-line-strong text-fg hover:bg-raised hover:border-fg-3",
  ghost: "text-fg hover:bg-raised",
  quiet: "text-fg-2 hover:text-fg hover:bg-raised/60",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-9 w-9",
};

export function buttonClass(opts: { variant?: Variant; size?: Size; className?: string } = {}) {
  const { variant = "solid", size = "md", className } = opts;
  return cn(base, variants[variant], sizes[size], className);
}

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
