export default function Page() {
  return (
    <main className="grid">
      <section className="hero" style={{ padding: 18 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>Termos</h1>
        <p className="muted">Regras de uso e responsabilidade do relatório.</p>
      </section>

      <section className="card">
        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
          Os relatórios do Analyzer Market AI são gerados automaticamente e representam estimativas baseadas em dados públicos e modelos de IA.
          Não oferecemos garantias de resultados comerciais.
        </p>
        <div className="hr" />
        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
          O acesso é feito por token com expiração e limite de visualizações. Não compartilhe seu token.
        </p>
      </section>
    </main>
  )
}
