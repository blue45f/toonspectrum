"use client";

export function OpenSearchButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event("toonspectrum:search"))}
    >
      {children}
    </button>
  );
}
