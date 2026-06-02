import { Container } from "@/components/section";

export function AdminPage() {
  return (
    <Container size="wide" className="py-10">
      <section className="rounded-2xl border border-line bg-card p-6">
        <p className="eyebrow text-accent">ADMIN</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">관리자 콘솔</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-3">
          Vite 전환 후 공개 앱은 React Router로 동작합니다. 관리자 기능은 Nest API(`/api/admin/*`)에
          유지되어 있으며, 인증 플로우를 Nest 기반으로 옮긴 뒤 콘솔을 다시 연결할 수 있습니다.
        </p>
      </section>
    </Container>
  );
}
