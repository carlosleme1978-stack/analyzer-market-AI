'use client'

import { useState } from 'react'
import { Gauge } from './Charts'
import { MiniMap } from './MiniMap'

export function PreviewForm() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    setData(null)
    setLoading(true)
    try {
      const fd = new FormData(e.currentTarget)
      const payload = {
        business: String(fd.get('business') || ''),
        location: String(fd.get('location') || ''),
        keywords: String(fd.get('keywords') || ''),
        query: String(fd.get('query') || '')
      }
      const r = await fetch('/api/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'preview_failed')
      setData(j)
      // Share context with checkout (no login): improves conversion by reducing friction.
      try { sessionStorage.setItem('am_prefill', JSON.stringify(payload)) } catch {}
    } catch (e: any) {
      setErr(e?.message || 'preview_failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid" style={{ gap: 10 }}>
      <form className="grid" style={{ gap: 10 }} onSubmit={onSubmit}>
        <input name="business" className="input" placeholder="Seu negócio (ex.: Clínica Sorriso)" />
        <div className="grid2" style={{ gap: 10 }}>
          <input name="location" className="input" placeholder="Cidade/bairro (ex.: Lisboa, Benfica)" />
          <input name="keywords" className="input" placeholder="Palavras-chave (ex.: dentista, implante)" />
        </div>
        <input name="query" className="input" placeholder="(Opcional) Query pronta (ex.: dentista implante Lisboa)" />
        <button className="btn" type="submit" disabled={loading}>{loading ? 'Analisando…' : 'Ver prévia grátis'}</button>
      </form>

      {err ? <div className="notice danger">Erro: {err}</div> : null}

      {data?.ok ? (
        <div className="notice" style={{ display: 'grid', gap: 8 }}>
          <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Prévia (sem pagamento)</div>

<Gauge value={Number(data.score_estimate || 0)} />
<div className="grid" style={{ gap: 10 }}>
  <div className="grid2" style={{ gap: 10 }}>
    <div className="pill" style={{ display: 'grid', gap: 4 }}>
      <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Concorrência de anúncios</div>
      <div><b>{data.benchmarks?.competitors_found ?? 0}</b> concorrentes ativos no recorte</div>
    </div>

    <div className="pill" style={{ display: 'grid', gap: 4 }}>
      <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Saturação do mercado</div>
      <div>
        <b>{(data.entry_risk?.level === 'Alto' ? 'Alta' : data.entry_risk?.level === 'Médio' ? 'Média' : 'Baixa')}</b>
        <span className="muted"> — {data.entry_risk?.level ? `risco ${data.entry_risk.level}` : '—'}</span>
      </div>
    </div>
  </div>

  <div className="pill" style={{ display: 'grid', gap: 6 }}>
    <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Oportunidades de tráfego</div>
    <div>
      {(() => {
        const opp = data.blocks?.opportunity_map?.rows?.[0]?.opportunity
        const n = opp === 'Alta' ? 3 : opp === 'Média' ? 2 : 1
        const region = data.blocks?.opportunity_map?.rows?.[0]?.region || (data?.input?.location || 'Área analisada')
        return (
          <span>
            Detectamos <b>{n}</b> oportunidade(s) com base nos sinais locais — foco inicial em <b>{region}</b>.
          </span>
        )
      })()}
    </div>
    <div className="muted" style={{ fontSize: 12 }}>
      Dica: use o relatório completo para receber keywords/hashtags e um plano de campanha (Google Ads + Instagram).
    </div>
  </div>

  {Array.isArray(data?.map_preview?.points) && data.map_preview.points.length ? (
    <MiniMap bbox={data.map_preview.bbox} points={data.map_preview.points} />
  ) : null}

  <div className="grid2" style={{ gap: 10 }}>
    <div className="pill"><b>Média rating:</b> {data.benchmarks?.avg_rating ?? 0}⭐</div>
    <div className="pill"><b>Média reviews:</b> {data.benchmarks?.avg_reviews ?? 0}</div>
  </div>

  {data?.blocks?.investment_estimate?.marketing_budget_eur_month ? (
    <div className="pill" style={{ display: 'grid', gap: 4 }}>
      <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Investimento inicial (estimativa)</div>
      <div>
        €{Math.round((Number(data.blocks.investment_estimate.marketing_budget_eur_month.min || 0) / 30) * 10) / 10} –
        €{Math.round((Number(data.blocks.investment_estimate.marketing_budget_eur_month.max || 0) / 30) * 10) / 10} / dia
        <span className="muted"> (≈ €{data.blocks.investment_estimate.marketing_budget_eur_month.min}–€{data.blocks.investment_estimate.marketing_budget_eur_month.max}/mês)</span>
      </div>
    </div>
  ) : null}

  <div className="muted">Quer o plano completo de tráfego pago (keywords + hashtags + orçamento + plano 7/30 dias)? Compre abaixo.</div>
</div>

        </div>
      ) : null}
    </div>
  )
}
