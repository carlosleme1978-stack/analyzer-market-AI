export default function Page() {
  return (
    <main className="grid">
      <section className="hero" style={{ padding: 18 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>Privacidade</h1>
        <p className="muted">Como tratamos dados do pedido e metadados técnicos.</p>
      </section>

      <section className="card">
        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
          Este produto pode processar informações do seu pedido (ex.: tipo de negócio e localização) e metadados técnicos (ex.: IP para proteção anti-abuso).
          Mantemos retenção mínima e apagamos dados após o período configurado.
        </p>
        <div className="hr" />
        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
          Fornecedores podem incluir Stripe (pagamentos), Google (Places) e OpenAI (geração do relatório), conforme chaves e configurações do operador. Dados do Google Places podem ser armazenados apenas como cache temporário e minimizado (ex.: place_id, nome e sinais agregados), com expiração.
        </p>
      </section>
    </main>
  )
}
