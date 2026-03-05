import React from 'react'

type Point = {
  lat: number
  lng: number
  rating?: number
  reviews?: number
  name?: string
}

export function MiniMap({
  bbox,
  points,
  title = 'Mapa (densidade de concorrentes)'
}: {
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  points: Point[]
  title?: string
}) {
  const w = 360
  const h = 180
  const pad = 14

  const minLat = bbox?.minLat ?? 0
  const maxLat = bbox?.maxLat ?? 1
  const minLng = bbox?.minLng ?? 0
  const maxLng = bbox?.maxLng ?? 1

  function nx(lng: number) {
    const d = Math.max(1e-9, maxLng - minLng)
    return pad + ((lng - minLng) / d) * (w - pad * 2)
  }
  function ny(lat: number) {
    const d = Math.max(1e-9, maxLat - minLat)
    // invert Y: north is up
    return pad + (1 - (lat - minLat) / d) * (h - pad * 2)
  }

  return (
    <div className="grid" style={{ gap: 6 }}>
      <div className="muted2" style={{ fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{
        borderRadius: 14,
        background: 'rgba(0,0,0,.18)',
        border: '1px solid rgba(255,255,255,.10)',
        padding: 10,
        overflow: 'hidden'
      }}>
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
          <defs>
            <radialGradient id="dot" cx="50%" cy="50%" r="60%">
              <stop offset="0" stopColor="rgba(34,211,238,.95)" />
              <stop offset="1" stopColor="rgba(167,139,250,.55)" />
            </radialGradient>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="rgba(96,165,250,.10)" />
              <stop offset="1" stopColor="rgba(167,139,250,.08)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} rx="14" fill="url(#bg)" />
          {/* grid */}
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={i} x1={(w / 6) * i} y1={0} x2={(w / 6) * i} y2={h} stroke="rgba(255,255,255,.06)" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={i} x1={0} y1={(h / 4) * i} x2={w} y2={(h / 4) * i} stroke="rgba(255,255,255,.06)" />
          ))}

          {points.map((p, i) => {
            const cx = nx(p.lng)
            const cy = ny(p.lat)
            const reviews = Number(p.reviews || 0)
            const r = Math.max(4, Math.min(10, 4 + Math.log10(Math.max(1, reviews)) * 2.2))
            const title = `${p.name || 'Concorrente'} — ${p.rating || '—'}⭐ · ${reviews} reviews`
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r + 6} fill="rgba(0,0,0,.18)" />
                <circle cx={cx} cy={cy} r={r} fill="url(#dot)" stroke="rgba(255,255,255,.10)">
                  <title>{title}</title>
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Pontos representam concorrentes retornados pelo Google Places (prévia limitada). Quanto maior o ponto, maior o volume de reviews.
      </div>
    </div>
  )
}
