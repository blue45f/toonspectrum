import { Container } from "@/components/section";

export default function Loading() {
  return (
    <Container size="wide" className="py-10">
      <div className="skeleton mb-3 h-4 w-28" />
      <div className="skeleton mb-8 h-9 w-64" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="skeleton aspect-[3/4] w-full" />
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    </Container>
  );
}
