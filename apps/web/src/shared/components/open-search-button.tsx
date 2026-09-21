import { useUi } from "@/shared/lib/ui-store";

export function OpenSearchButton({
  children,
  className,
  "aria-label": accessibleLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const openCommandPalette = useUi((s) => s.openCommandPalette);
  return (
    <button type="button" className={className} aria-label={accessibleLabel} onClick={openCommandPalette}>
      {children}
    </button>
  );
}
