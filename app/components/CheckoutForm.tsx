'use client'

import { useEffect, useMemo, useState } from 'react'

type State = 'idle' | 'loading' | 'error'

export function CheckoutForm() {
  const [business, setBusiness] = useState('')
  const [location, setLocation] = useState('')
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState('')
  const [state, setState] = useState<State>('idle')
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    // If user ran a preview, we prefill checkout to reduce friction (no-login flow).
    try {
      const raw = sessionStorage.getItem('am_prefill')
      if (!raw) return
      const j = JSON.parse(raw)
      if (!business && typeof j.business === 'string') setBusiness(j.business)
      if (!location && typeof j.location === 'string') setLocation(j.location)
      if (!keywords && typeof j.keywords === 'string') setKeywords(j.keywords)
      if (!query && typeof j.query === 'string') setQuery(j.query)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disabled = useMemo(() => state === 'loading', [state])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setErr('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ business, location, query, keywords })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'checkout_failed')
      if (data?.token) {
        try { sessionStorage.setItem('am_token', String(data.token)) } catch {}
      }
      if (data?.checkout_url) window.location.href = data.checkout_url
      else throw new Error('missing_checkout_url')
    } catch (e: any) {
      setErr(String(e?.message || e))
      setState('error')
    } finally {
      setState('idle')
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid" style={{ gap: 10 }}>
      <div className="split">
        <div className="grid" style={{ gap: 8 }}>
          <label className="muted2" style={{ fontSize: 12, fontWeight: 800 }}>Negócio</label>
          <input className="input" placeholder="Ex.: Barbearia do Centro" value={business} onChange={(e) => setBusiness(e.target.value)} />
        </div>
        <div className="grid" style={{ gap: 8 }}>
          <label className="muted2" style={{ fontSize: 12, fontWeight: 800 }}>Local</label>
          <input className="input" placeholder="Ex.: Lisboa, PT" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>
      <div className="grid" style={{ gap: 8 }}>
        <label className="muted2" style={{ fontSize: 12, fontWeight: 800 }}>O que você vende</label>
        <input className="input" placeholder="Ex.: corte masculino, barba, pacotes" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="grid" style={{ gap: 8 }}>
        <label className="muted2" style={{ fontSize: 12, fontWeight: 800 }}>Palavras-chave (opcional)</label>
        <textarea className="textarea" placeholder="Ex.: barbearia premium, fade, navalha, perto de mim" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </div>

      <div className="heroRow">
        <button className="btn primary" disabled={disabled} type="submit">
          {disabled ? 'Criando checkout…' : 'Comprar análise — 39€'}
        </button>
        <span className="pill"><b>Entrega:</b> em minutos</span>
        <span className="pill"><b>Token:</b> acesso seguro</span>
      </div>

      {err ? (
        <div className="notice">Erro: <span className="mono">{err}</span></div>
      ) : (
        <div className="notice">Após o pagamento, você recebe um token e acompanha o status em tempo real.</div>
      )}
    </form>
  )
}
