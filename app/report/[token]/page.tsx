import { Gauge, SparkBars } from '@/app/components/Charts'

async function getReport(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/report/${token}`, { cache: 'no-store' })
  return { ok: res.ok, status: res.status, data: await res.json() }
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="cardHeader" style={{ marginBottom: 8 }}>
        <div className="cardTitle">{title}</div>
      </div>
      {children}
    </section>
  )
}

function List({ items }: { items: any }) {
  const arr = Array.isArray(items) ? items : []
  if (!arr.length) return <div className="muted">—</div>
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {arr.map((it, idx) => (
        <li key={idx} style={{ marginBottom: 6 }}>
          {typeof it === 'string' ? it : it?.task ? (
            <span>
              <b>{it.task}</b>
              <span className="muted"> — ETA {it?.eta_minutes ?? '?'} min · impacto {it?.impact ?? '?'}</span>
            </span>
          ) : (
            JSON.stringify(it)
          )}
        </li>
      ))}
    </ul>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: any[] }) {
  const arr = Array.isArray(rows) ? rows : []
  if (!arr.length) return <div className="muted">—</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {arr.map((r: any, idx: number) => (
            <tr key={idx}>
              {headers.map((h, i) => (
                <td key={i} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {String(r?.[h] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function Page({ params }: { params: { token: string } }) {
  const r = await getReport(params.token)
  if (!r.ok) {
    return (
      <main className="grid">
        <section className="hero" style={{ padding: 18 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Relatório</h1>
          <p className="muted">Não foi possível abrir o relatório com este token.</p>
        </section>
        <Box title="Erro">
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(r.data, null, 2)}</pre>
        </Box>
      </main>
    )
  }

  const d = r.data || {}
  const competitors = Array.isArray(d.competitors) ? d.competitors : []
  const report = d.report_json || {}

  const score = Number.isFinite(d.score) ? Number(d.score) : Number(report?.score_total || 0)
  const scoreBreakdown = report?.score_breakdown || {}
  const benchmarks = report?.benchmarks || {}

  const localCompetitors = Array.isArray(report?.local_competitors) ? report.local_competitors : competitors.slice(0, 8)
  const opportunityMap = report?.opportunity_map || {}
  const competitiveGap = report?.competitive_gap || {}
  const acquisition = report?.acquisition_strategy || {}
  const investment = report?.investment_estimate || {}

  const paidRegions = Array.isArray(report?.ideal_regions) ? report.ideal_regions : []
  const googleKeywords = Array.isArray(report?.google_ads_keywords) ? report.google_ads_keywords : []
  const instaHashtags = Array.isArray(report?.instagram_hashtags) ? report.instagram_hashtags : []
  const campaign = report?.campaign_structure_google_ads || {}
  const budgetDaily = report?.budget_daily_eur || null


  const reviewCounts = competitors.slice(0, 10).map((c: any) => Number(c?.user_ratings_total || 0))

  return (
    <main className="grid">
      <section className="hero" style={{ padding: 18 }}>
        <div className="heroRow" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Relatório</div>
            <h1 style={{ margin: 0, fontSize: 30 }}>Relatório de Tráfego Pago Local</h1>
          </div>
          <a className="btn ghost" href={`/status/${encodeURIComponent(params.token)}`}>Ver status</a>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Concorrência, oportunidades e um plano completo de tráfego pago (Google Ads + Instagram) — sem login.
        </p>
      </section>

      <section className="grid2">
        <Box title="Score geral">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Gauge value={score} />
            <div>
              <div className="mono" style={{ fontSize: 34, fontWeight: 900 }}>{Math.round(score)}/100</div>
              <div className="muted">Visão rápida do potencial e competitividade local.</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }} className="grid" >
            <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Score detalhado</div>
            <div className="grid2">
              <div className="notice">Competição: <b>{Math.round(Number(scoreBreakdown?.competition || 0))}/100</b></div>
              <div className="notice">Demanda: <b>{Math.round(Number(scoreBreakdown?.demand || 0))}/100</b></div>
              <div className="notice">Reputação: <b>{Math.round(Number(scoreBreakdown?.reputation || 0))}/100</b></div>
              <div className="notice">Visibilidade: <b>{Math.round(Number(scoreBreakdown?.visibility || 0))}/100</b></div>
            </div>
          </div>
        </Box>

        <Box title="Benchmarks locais (Google Places)">
          <div className="grid" style={{ gap: 10 }}>
            <div className="notice">Concorrentes encontrados: <b>{benchmarks?.competitors_found ?? 0}</b></div>
            <div className="notice">Média de rating: <b>{benchmarks?.avg_rating ?? 0}⭐</b></div>
            <div className="notice">Média de reviews: <b>{benchmarks?.avg_reviews ?? 0}</b></div>

            <div className="muted2" style={{ fontSize: 12, fontWeight: 900, marginTop: 6 }}>Distribuição (top 10 concorrentes)</div>
            <SparkBars values={reviewCounts} />
          </div>
        </Box>
      </section>

      <section className="grid2">
        <Box title="Insights objetivos">
          <List items={report?.insights} />
        </Box>
        <Box title="Concorrentes locais (top)">
          <SimpleTable
            headers={["name", "rating", "user_ratings_total"]}
            rows={(Array.isArray(localCompetitors) ? localCompetitors : []).map((c: any) => ({
              name: c?.name ?? '—',
              rating: (c?.rating ?? '—') + (c?.rating ? '⭐' : ''),
              user_ratings_total: c?.user_ratings_total ?? '—'
            }))}
          />
        </Box>
      </section>

      <section className="grid2">
        <Box title="Mapa de oportunidade local">
          <SimpleTable
            headers={["region", "competitors", "avg_rating", "avg_reviews", "opportunity"]}
            rows={Array.isArray(opportunityMap?.rows) ? opportunityMap.rows : []}
          />
          {opportunityMap?.insight ? <div className="muted" style={{ marginTop: 10 }}><b>Insight:</b> {opportunityMap.insight}</div> : null}
        </Box>
        <Box title="Gap competitivo">
          <SimpleTable
            headers={["metric", "market_avg", "top_competitors"]}
            rows={Array.isArray(competitiveGap?.table) ? competitiveGap.table : []}
          />
          {competitiveGap?.insight ? <div className="muted" style={{ marginTop: 10 }}><b>Insight:</b> {competitiveGap.insight}</div> : null}
        </Box>
      </section>

      
<section className="grid2">
  <Box title="Regiões ideais para anunciar">
    {Array.isArray(paidRegions) && paidRegions.length ? (
      <SimpleTable
        headers={["region", "reason", "budget_share_pct"]}
        rows={paidRegions.map((r: any) => ({
          region: r?.region ?? '—',
          reason: r?.reason ?? '—',
          budget_share_pct: (r?.budget_share_pct ?? '—') + (r?.budget_share_pct ? '%' : '')
        }))}
      />
    ) : (
      <div className="muted">—</div>
    )}
    <div className="muted" style={{ marginTop: 10 }}>
      Se não houver regiões detalhadas, use o “Mapa de oportunidade” como guia inicial.
    </div>
  </Box>

  <Box title="Keywords e Hashtags sugeridas">
    <div className="grid" style={{ gap: 12 }}>
      <div>
        <div className="muted2" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>Google Ads — palavras‑chave</div>
        {googleKeywords.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {googleKeywords.slice(0, 18).map((k: string, i: number) => <li key={i}>{k}</li>)}
          </ul>
        ) : (
          <div className="muted">—</div>
        )}
      </div>

      <div>
        <div className="muted2" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>Instagram — hashtags</div>
        {instaHashtags.length ? (
          <div className="notice" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {instaHashtags.slice(0, 24).map((h: string, i: number) => (
              <span key={i} className="pill mono" style={{ fontSize: 12, padding: '6px 10px' }}>{h}</span>
            ))}
          </div>
        ) : (
          <div className="muted">—</div>
        )}
      </div>
    </div>
  </Box>
</section>

<section className="grid2">
  <Box title="Estrutura de campanha — Google Ads">
    {Array.isArray(campaign?.campaigns) && campaign.campaigns.length ? (
      <div className="grid" style={{ gap: 10 }}>
        {campaign.campaigns.slice(0, 4).map((c: any, idx: number) => (
          <div key={idx} className="notice" style={{ display: 'grid', gap: 6 }}>
            <div><b>{c?.name ?? `Campanha ${idx + 1}`}</b></div>
            {Array.isArray(c?.ad_groups) && c.ad_groups.length ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Ad groups: {c.ad_groups.map((g: any) => g?.name).filter(Boolean).join(' · ') || '—'}
              </div>
            ) : null}
            {Array.isArray(c?.keywords) && c.keywords.length ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Keywords: {c.keywords.slice(0, 8).join(', ')}{c.keywords.length > 8 ? '…' : ''}
              </div>
            ) : null}
            {c?.landing_page_angle ? <div className="muted" style={{ fontSize: 13 }}><b>Ângulo:</b> {c.landing_page_angle}</div> : null}
          </div>
        ))}
      </div>
    ) : (
      <div className="muted">—</div>
    )}
    <div className="muted" style={{ marginTop: 10 }}>
      Estrutura sugerida para acelerar o setup inicial. Ajuste com base no seu site/landing.
    </div>
  </Box>

  <Box title="Orçamento diário recomendado">
    <div className="grid" style={{ gap: 10 }}>
      {budgetDaily?.min != null ? (
        <div className="notice">
          Orçamento diário sugerido: <b>€{budgetDaily.min}–€{budgetDaily.max}/dia</b>
        </div>
      ) : (
        <div className="notice">
          Orçamento diário (derivado): <b>
            €{Math.round((Number(investment?.marketing_budget_eur_month?.min || 0) / 30) * 10) / 10}–
            €{Math.round((Number(investment?.marketing_budget_eur_month?.max || 0) / 30) * 10) / 10}/dia
          </b>
        </div>
      )}

      {budgetDaily?.split ? (
        <div className="notice">
          Split sugerido: <b>Google Ads {budgetDaily.split.google_ads_pct}%</b> · <b>Instagram {budgetDaily.split.instagram_ads_pct}%</b>
        </div>
      ) : (
        <div className="muted">Split sugerido disponível no relatório quando aplicável.</div>
      )}

      <div className="muted">
        Estimativa heurística; não é promessa de resultado.
      </div>
    </div>
  </Box>
</section>

<section className="grid2">
        <Box title="Estratégia de tráfego pago">
          <SimpleTable
            headers={["channel", "priority", "reason"]}
            rows={Array.isArray(acquisition?.rows) ? acquisition.rows : []}
          />
        </Box>
        <Box title="Orçamento recomendado (tráfego pago)">
          <div className="grid" style={{ gap: 10 }}>
            <div className="notice">Reviews alvo: <b>{investment?.reviews_target ?? '—'}+</b></div>
            <div className="notice">Investimento marketing estimado: <b>€{investment?.marketing_budget_eur_month?.min ?? '—'}–€{investment?.marketing_budget_eur_month?.max ?? '—'}/mês</b></div>
            <div className="notice">Tempo estimado para competir: <b>{investment?.time_to_compete_months?.min ?? '—'}–{investment?.time_to_compete_months?.max ?? '—'} meses</b></div>
            <div className="muted">{investment?.disclaimer ?? 'Estimativa heurística; não é promessa de resultado.'}</div>
          </div>
        </Box>
      </section>

      <section className="grid2">
        <Box title="Oportunidades">
          <List items={report?.opportunities} />
        </Box>
        <Box title="Riscos">
          <List items={report?.risks} />
        </Box>
      </section>

      <section className="grid2">
        <Box title="Plano de ação — 7 dias">
          <List items={report?.actions_7_days} />
        </Box>
        <Box title="Plano de ação — 30 dias">
          <List items={report?.actions_30_days} />
        </Box>
      </section>

      {/* <section className="grid2">
        <Box title="Próximos passos">
          <List items={report?.next_steps} />
        </Box>
        <Box title="(Extra) Dados brutos">
          <div className="muted">Campos determinísticos para auditoria e debugging.</div>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, marginTop: 8 }}>{JSON.stringify({ opportunityMap, competitiveGap, acquisition, investment }, null, 2)}</pre>
        </Box>
      </section> */}

      <Box title="Metadados">
        <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(d.meta, null, 2)}</pre>
      </Box>

      <Box title="Relatório (Markdown)">
        <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{String(d.report_md || '')}</pre>
      </Box>
    </main>
  )
}
