'use client'

import { useEffect, useMemo, useState } from 'react'

export default function Page() {
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('am_token') || ''
      if (t) setToken(t)
    } catch {}
  }, [])

  const statusHref = useMemo(() => (token ? `/status/${encodeURIComponent(token)}` : '/status'), [token])

  return (
    <main className="grid">
      <section className="hero center" style={{ padding: 22 }}>
        <div className="badge ready" style={{ marginBottom: 10 }}>Pagamento confirmado</div>
        <h1 style={{ margin: 0, fontSize: 30 }}>Tudo certo ✅</h1>
        <p className="muted" style={{ textAlign: 'center', maxWidth: 60 + 'ch' }}>
          Sua análise foi registrada e está sendo processada. Guarde seu token para acompanhar e abrir o relatório.
        </p>
      </section>

      <section className="card">
        <div className="cardHeader">
          <div>
            <div className="cardTitle">Seu token</div>
            <p className="cardDesc">Acesso seguro ao status e ao relatório.</p>
          </div>
          <span className="pill"><b>Expira</b> (config)</span>
        </div>

        {token ? (
          <>
            <div className="mono" style={{ wordBreak: 'break-all', fontSize: 14 }}>{token}</div>
            <div className="heroRow" style={{ marginTop: 14 }}>
              <a className="btn primary" href={statusHref}>Acompanhar status</a>
              <a className="btn" href="/">Voltar ao início</a>
            </div>
            <div className="notice" style={{ marginTop: 12 }}>
              Dica: copie e guarde seu token. Ele não fica salvo no servidor sem o pagamento e pode expirar.
            </div>
          </>
        ) : (
          <>
            <div className="notice">
              Não encontramos token salvo neste navegador. Se você copiou o token antes, cole abaixo para acompanhar:
            </div>
            <form action="/status" method="GET" className="grid" style={{ gap: 10 }}>
              <input name="token" className="input mono" placeholder="Cole aqui o token" />
              <button className="btn primary" type="submit">Ver status</button>
            </form>
            <div className="heroRow" style={{ marginTop: 14 }}>
              <a className="btn" href="/">Voltar ao início</a>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
