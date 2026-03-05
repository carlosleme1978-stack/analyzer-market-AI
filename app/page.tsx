import { CheckoutForm } from './components/CheckoutForm'
import { PreviewForm } from './components/PreviewForm'

export default function Page() {
  return (
    <main className="grid">
      <section className="hero">
        <div className="heroRow">
          <span className="pill"><b>Preço fixo:</b> 39€</span>
          <span className="pill"><b>Google Places:</b> concorrentes reais</span>
          <span className="pill"><b>IA:</b> estratégia de Ads</span>
        </div>
        <h1>Planeje seu Tráfego Pago Local com dados reais — em minutos</h1>
        <p>
          Gere uma estratégia prática para anunciar na sua cidade: onde investir, quais palavras‑chave usar, quais regiões priorizar e um plano de anúncios de 7/30 dias.
        </p>

        
        <div className="heroPoints">
          <div className="pill"><b>Onde anunciar:</b> regiões com melhor oportunidade</div>
          <div className="pill"><b>O que anunciar:</b> keywords + hashtags sugeridas</div>
          <div className="pill"><b>Quanto gastar:</b> orçamento diário recomendado</div>
        </div>
<div className="grid2">
          <div className="card">
            <div className="cardHeader">
              <div>
                <div className="cardTitle">Prévia grátis + plano de Ads</div>
                <p className="cardDesc">Informe o básico do seu negócio e vá para o checkout.</p>
              </div>
              <span className="badge processing">Checkout seguro</span>
            </div>
            <div className="notice" style={{ marginBottom: 10 }}>Faça uma prévia gratuita para ver concorrência, saturação e oportunidades de tráfego. Depois, compre o plano completo de tráfego pago.</div>
            <PreviewForm />
            <div style={{ height: 12 }} />
            <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Checkout</div>
            <CheckoutForm />
          </div>

          <div className="card soft">
            <div className="cardHeader">
              <div>
                <div className="cardTitle">Já tem um token?</div>
                <p className="cardDesc">Cole o token para acompanhar status ou abrir o relatório.</p>
              </div>
              <span className="badge">Sem login</span>
            </div>
            <form action="/status" method="GET" className="grid" style={{ gap: 10 }}>
              <input name="token" className="input mono" placeholder="Cole aqui o token" />
              <button className="btn" type="submit">Ver status</button>
            </form>
            <div className="notice" style={{ marginTop: 10 }}>
              Seu token é a chave de acesso: tem expiração e limite de visualizações.
            </div>
          </div>
        </div>
      </section>

      <section className="featureGrid">
        <div className="feature">
          <div className="featureTitle">Score + leitura rápida</div>
          <p className="featureText">Entenda em segundos se há oportunidade real no local, com resumo executivo.</p>
        </div>
        <div className="feature">
          <div className="featureTitle">Concorrentes (Places)</div>
          <p className="featureText">Lista e sinais de pressão competitiva: rating, reviews, densidade e padrões.</p>
        </div>
        <div className="feature">
          <div className="featureTitle">Ações recomendadas</div>
          <p className="featureText">Plano objetivo para marketing e oferta: próximos passos práticos.</p>
        </div>
      </section>

      <section className="card soft">
        <div className="cardTitle">Como funciona</div>
        <div className="hr" />
        <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Você compra uma análise (39€).</li>
          <li>Geramos um token seguro com expiração e limite de visualizações.</li>
          <li>Um worker busca sinais (Places) e produz o relatório (IA) com controle de custo.</li>
          <li>Você acompanha o status e acessa o relatório final.</li>
        </ol>
      </section>
    </main>
  )
}
