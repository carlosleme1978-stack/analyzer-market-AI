async function getStatus(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/status/${token}`, { cache: 'no-store' })
  return { ok: res.ok, status: res.status, data: await res.json() }
}

export default async function Page({ params }: { params: { token: string } }) {
  const r = await getStatus(params.token)
  const s = r.data?.status || 'unknown'
  const paid = !!r.data?.paid

  const badgeClass = s === 'ready' ? 'ready' : s === 'failed' ? 'failed' : s === 'queued' ? 'queued' : 'processing'

  return (
    <main className="grid">
      <div className="hero" style={{ padding: 18 }}>
        <div className="heroRow" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>Status</div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Acompanhe sua análise</h1>
          </div>
          <span className={`badge ${badgeClass}`}>{s}</span>
        </div>

        <div className="split">
          <div className="card soft">
            <div className="cardTitle">Token</div>
            <div className="hr" />
            <div className="mono" style={{ wordBreak: 'break-all' }}>{params.token}</div>
            <div className="notice" style={{ marginTop: 10 }}>Guarde este token. Ele dá acesso ao relatório.</div>
          </div>

          <div className="card">
            <div className="kpiGrid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div className="kpi">
                <div className="kpiLabel">Status</div>
                <div className="kpiValue">{s}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Pago</div>
                <div className="kpiValue">{paid ? 'sim' : 'não'}</div>
              </div>
            </div>

            <div className="hr" />

            <div className="muted" style={{ lineHeight: 1.7 }}>
              {s === 'ready' ? (
                <>
                  Seu relatório está pronto.
                  <div style={{ marginTop: 10 }}>
                    <a className="btn primary" href={`/report/${encodeURIComponent(params.token)}`}>Abrir relatório</a>
                  </div>
                </>
              ) : s === 'failed' ? (
                <>Houve uma falha ao gerar o relatório. Tente novamente mais tarde.</>
              ) : (
                <>Estamos processando sua análise. Atualize esta página em alguns segundos.</>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
