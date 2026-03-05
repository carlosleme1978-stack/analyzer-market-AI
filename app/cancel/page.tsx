'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('am_token') || ''
      if (t) setToken(t)
    } catch {}
  }, [])

  return (
    <main className="grid">
      <section className="hero" style={{ padding: 18 }}>
        <div className="badge failed">Pagamento cancelado</div>
        <h1 style={{ margin: '10px 0 0 0', fontSize: 30 }}>Sem problema.</h1>
        <p className="muted">Se quiser tentar novamente, você pode iniciar um novo checkout a qualquer momento.</p>
        {token ? (
          <div className="notice">Token (não pago): <span className="mono">{token}</span></div>
        ) : null}
        <div className="heroRow" style={{ marginTop: 10 }}>
          <a className="btn primary" href="/">Iniciar novo checkout</a>
          <a className="btn" href="/">Voltar</a>
        </div>
      </section>
    </main>
  )
}
