import { useUi } from "@/shared/lib/ui-store";

export function OpenSearchButton({
  children,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const openCommandPalette = useUi((s) => s.openCommandPalette);
  return (
    <button type="button" aria-label={ariaLabel} className={className} onClick={openCommandPalette}>
      {children}
    </button>
  );
}
