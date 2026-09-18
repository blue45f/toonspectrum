import "../styles.css";

export function AdminApp() {
  return (
    <main className="admin-shell">
      <section className="admin-card" aria-labelledby="admin-title">
        <p className="admin-eyebrow">ToonSpectrum operations</p>
        <h1 id="admin-title">Admin application boundary</h1>
        <p>
          Administrator capabilities will move into this independently deployable
          surface incrementally. Existing product behavior stays in place until each
          capability has its own migration and verification.
        </p>
      </section>
    </main>
  );
}
