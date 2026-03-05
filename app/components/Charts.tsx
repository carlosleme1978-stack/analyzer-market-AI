import React from 'react'

export function Gauge({ value }: { value: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  const r = 52
  const c = 2 * Math.PI * r
  const dash = (c * v) / 100
  const gap = c - dash

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label={`Score ${v}`}
        style={{ filter: 'drop-shadow(0 18px 32px rgba(0,0,0,.45))' }}>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(34,211,238,.95)" />
            <stop offset="1" stopColor="rgba(167,139,250,.95)" />
          </linearGradient>
        </defs>
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="12" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke="url(#g1)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform="rotate(-90 65 65)"
        />
        <circle cx="65" cy="65" r="40" fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.08)" />
        <text x="65" y="70" textAnchor="middle" fontSize="26" fontWeight="900" fill="white">{v}</text>
      </svg>
      <div>
        <div className="muted2" style={{ fontSize: 12, fontWeight: 900, letterSpacing: .3 }}>Score de oportunidade</div>
        <div className="muted" style={{ lineHeight: 1.65, maxWidth: 44 + 'ch' }}>
          Quanto maior, mais chance de capturar demanda com boa oferta e execução.
        </div>
      </div>
    </div>
  )
}

export function SparkBars({ values }: { values: number[] }) {
  const v = values.slice(0, 10).map((x) => (Number.isFinite(x) ? Math.max(0, x) : 0))
  const max = Math.max(1, ...v)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 44 }} aria-hidden="true">
      {v.map((x, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: Math.max(6, Math.round((x / max) * 44)),
            borderRadius: 8,
            background: 'linear-gradient(180deg, rgba(96,165,250,.9), rgba(167,139,250,.65))',
            boxShadow: '0 14px 22px rgba(0,0,0,.35)'
          }}
        />
      ))}
    </div>
  )
}
