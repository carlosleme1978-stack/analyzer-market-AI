'use client'

import { useEffect, useMemo, useState } from 'react'

type Stats = {
  window: { since24h: string }
  counts: { analyses24h: number; jobsQueued: number; jobsProcessing: number; jobsDead: number }
  latestJobs: any[]
  latestEvents: any[]
}

function fmt(n: any) {
  const x = Number(n || 0)
  return new Intl.NumberFormat('pt-PT').format(x)
}

export default function OpsPage() {
  const [secret, setSecret] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const s = sessionStorage.getItem('am_admin_secret') || ''
      if (s) setSecret(s)
    } catch {}
  }, [])

  const headers = useMemo(() => ({ 'x-admin-secret': secret }), [secret])

  async function load() {
    setErr('')
    setLoading(true)
    try {
      if (!secret) throw new Error('missing_secret')
      try { sessionStorage.setItem('am_admin_secret', secret) } catch {}
      const res = await fetch('/api/admin/stats', { headers, cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'stats_failed')
      setStats(data)
    } catch (e: any) {
      setStats(null)
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  async function cleanup() {
    setErr('')
    setLoading(true)
    try {
      if (!secret) throw new Error('missing_secret')
      const res = await fetch('/api/admin/cleanup', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'cleanup_failed')
      await load()
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>Ops</h1>
        <span style={{ opacity: 0.7 }}>admin</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? 'Carregando…' : 'Atualizar'}
        </button>
        <button onClick={cleanup} disabled={loading || !secret}>
          Rodar cleanup
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 520 }}>
        <label style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>ADMIN_SECRET (fica só no browser)</label>
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Cole o ADMIN_SECRET (não vai para URL)"
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Dica: em produção, use allowlist de IP + secret forte.
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #f3c', borderRadius: 8 }}>
          Erro: <span style={{ fontFamily: 'monospace' }}>{err}</span>
        </div>
      ) : null}

      {!stats ? (
        <div style={{ marginTop: 16, opacity: 0.75 }}>
          Clique em <b>Atualizar</b> para carregar métricas.
        </div>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
            <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ opacity: 0.7 }}>Analyses (24h)</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(stats.counts.analyses24h)}</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ opacity: 0.7 }}>Jobs queued</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(stats.counts.jobsQueued)}</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ opacity: 0.7 }}>Jobs processing</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(stats.counts.jobsProcessing)}</div>
            </div>
            <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ opacity: 0.7 }}>Jobs dead</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(stats.counts.jobsDead)}</div>
            </div>
          </section>

          <h3 style={{ marginTop: 20 }}>Últimos jobs</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['id','analysis_id','status','attempts','run_at','locked_until','owner','error','created_at'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6, fontSize: 12, opacity: 0.7 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.latestJobs.map((j: any) => (
                  <tr key={j.id}>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{j.id}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{j.analysis_id}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5' }}>{j.status}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5' }}>{j.attempt_count}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{j.run_at}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{j.locked_until}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5' }}>{j.lock_owner}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.last_error || ''}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{j.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: 20 }}>Últimos eventos</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['id','analysis_id','event','created_at'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6, fontSize: 12, opacity: 0.7 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.latestEvents.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{e.id}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{e.analysis_id}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5' }}>{e.event}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f5f5f5', fontFamily: 'monospace', fontSize: 12 }}>{e.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
