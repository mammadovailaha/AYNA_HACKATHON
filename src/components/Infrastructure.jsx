import React from 'react'
import Icon from './Icon'
import { useLiveDashboard } from '../hooks/useLiveDashboard'
import { Mark, SearchCard } from './Search'

export const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('az-AZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const km = (value) => `${fmt(value, 1)} km`
const time = (iso) => iso ? new Date(iso).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

export function VerificationBadge({ check, label }) {
  if (!check) return null
  const ok = check.status === 'verified'
  return <div className={`verify-badge ${ok ? 'ok' : 'warn'}`} title={`${label}: bəyan edilmiş ${fmt(check.declared_km, 1)} km · geometriya ${fmt(check.measured_km, 2)} km`}>
    <Icon name={ok ? 'check' : 'alert'} size={13} />
    {ok ? `Geometriya ilə təsdiqlənib (${fmt(check.measured_km, 2)} km)` : `Təsdiqlənməyib · xəritə geometriyası ${fmt(check.measured_km, 2)} km (fərq ${check.difference_km > 0 ? '+' : ''}${fmt(check.difference_km, 2)} km)`}
  </div>
}

export function InfrastructureCards({ infra }) {
  const sourceLabel = infra.baseline_source === 'measured' ? 'ölçülmüş' : 'bəyan edilmiş'
  return <div className="infra-cards">
    <SearchCard className="infra-card total" title="Mövcud velosiped infrastrukturu">
      <div className="infra-card-top"><span className="infra-icon blue"><Icon name="route" size={20} /></span><span className="infra-tag built">Tikilib</span></div>
      <span className="infra-label"><Mark text="Mövcud velosiped infrastrukturu" /> <small>({sourceLabel})</small></span>
      <strong className="infra-value">{km(infra.existing_km)}</strong>
      <VerificationBadge check={infra.verification?.existing} label="Mövcud" />
      <div className="infra-split">
        <div><span>Planlaşdırılan ümumi uzunluq</span><b>{km(infra.projected_total_km)}</b></div>
        <div><span>Hesablama</span><b>{fmt(infra.existing_km, 1)} + {fmt(infra.planned_addition_km, 1)}</b></div>
      </div>
    </SearchCard>
    <SearchCard className="infra-card growth" title="Yeni əlavə ediləcək hissə">
      <div className="infra-card-top"><span className="infra-icon green"><Icon name="arrowUp" size={20} /></span><span className="infra-tag planned">Planlaşdırılır</span></div>
      <span className="infra-label"><Mark text="Yeni əlavə ediləcək hissə" /></span>
      <strong className="infra-value green">+{km(infra.planned_addition_km)}</strong>
      <VerificationBadge check={infra.verification?.planned} label="Planlaşdırılan" />
      <div className="infra-split">
        <div><span>İnfrastruktur artımı</span><b className="green">{fmt(infra.growth_pct, 2)}%</b></div>
        <div><span>Hesablama</span><b>{fmt(infra.planned_addition_km, 1)} / {fmt(infra.existing_km, 1)} × 100</b></div>
      </div>
    </SearchCard>
  </div>
}

// Waterfall: BEFORE → +ADDITION → PROJECTED TOTAL
export function InfrastructureGrowthChart({ infra }) {
  const max = infra.projected_total_km * 1.08
  const h = 210
  const y = (v) => h - (v / max) * h
  const bars = [
    { key: 'before', label: 'BEFORE', sub: 'Mövcud', from: 0, to: infra.existing_km, value: km(infra.existing_km) },
    { key: 'addition', label: 'ADDITION', sub: 'Planlaşdırılır', from: infra.existing_km, to: infra.projected_total_km, value: `+${km(infra.planned_addition_km)}` },
    { key: 'projected', label: 'PROJECTED TOTAL', sub: 'Proqnoz', from: 0, to: infra.projected_total_km, value: km(infra.projected_total_km), split: infra.existing_km }
  ]
  const ticks = [0, 20, 40, 60, 80].filter((t) => t <= max)
  return <div className="growth-chart" role="img" aria-label={`Mövcud ${km(infra.existing_km)}, əlavə ${km(infra.planned_addition_km)}, ümumi ${km(infra.projected_total_km)}`}>
    <svg viewBox={`0 0 520 ${h + 54}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="planned-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#dcfce7" /><line x1="0" y1="0" x2="0" y2="8" stroke="#12a150" strokeWidth="3" /></pattern>
      </defs>
      {ticks.map((t) => <g key={t}><line x1="44" x2="510" y1={y(t) + 10} y2={y(t) + 10} className="grid-line" /><text x="36" y={y(t) + 14} className="axis-label" textAnchor="end">{t}</text></g>)}
      {bars.map((bar, i) => {
        const x = 70 + i * 150
        const w = 96
        return <g key={bar.key} className={`growth-bar ${bar.key}`} style={{ animationDelay: `${i * 120}ms` }}>
          {bar.split ? <>
            <rect x={x} y={y(bar.split) + 10} width={w} height={(bar.split / max) * h} rx="6" className="fill-existing" />
            <rect x={x} y={y(bar.to) + 10} width={w} height={((bar.to - bar.split) / max) * h} rx="6" fill="url(#planned-hatch)" className="stroke-planned" />
          </> : <rect x={x} y={y(bar.to) + 10} width={w} height={((bar.to - bar.from) / max) * h} rx="6" className={bar.key === 'addition' ? 'stroke-planned' : 'fill-existing'} fill={bar.key === 'addition' ? 'url(#planned-hatch)' : undefined} />}
          {i < 2 && <line x1={x + w} x2={x + 150} y1={y(bar.to) + 10} y2={y(bar.to) + 10} className="connector" />}
          <text x={x + w / 2} y={y(bar.to) + 1} textAnchor="middle" className="bar-value">{bar.value}</text>
          <text x={x + w / 2} y={h + 30} textAnchor="middle" className="bar-label">{bar.label}</text>
          <text x={x + w / 2} y={h + 46} textAnchor="middle" className="bar-sub">{bar.sub}</text>
        </g>
      })}
    </svg>
    <div className="growth-legend"><span><i className="legend-swatch existing" /> Mövcud (tikilib)</span><span><i className="legend-swatch planned" /> Planlaşdırılan (tikilməyib)</span></div>
  </div>
}

export function ComparisonTable({ comparison }) {
  const { infrastructure: infra, network } = comparison
  const rows = [
    { label: 'Velosiped infrastrukturu', before: km(infra.before_km), after: km(infra.projected_total_km), change: `+${km(infra.addition_km)}`, good: true },
    { label: 'Multimodal əhatə', before: `${fmt(network.coverage_pct.before, 1)}%`, after: `${fmt(network.coverage_pct.after, 1)}%`, change: `+${fmt(network.coverage_pct.change, 1)} pp`, good: true },
    { label: '300 m-də sakin', before: fmt(network.coverage_population.before), after: fmt(network.coverage_population.after), change: `+${fmt(network.coverage_population.change)}`, good: true },
    { label: 'Əlaqəsiz məntəqə', before: fmt(network.disconnected_stations.before), after: fmt(network.disconnected_stations.after), change: fmt(network.disconnected_stations.change), good: network.disconnected_stations.change <= 0 },
    { label: 'Şəbəkə hissələri', before: network.network_parts.before, after: network.network_parts.after, change: fmt(network.network_parts.change), good: network.network_parts.change <= 0 }
  ]
  return <div className="compare-table">
    <div className="compare-table-head"><span>GÖSTƏRİCİ</span><span>MÖVCUD</span><span>PLAN SONRASI</span><span>DƏYİŞİKLİK</span></div>
    {rows.map((row) => <div className="compare-table-row" key={row.label}><span>{row.label}</span><b>{row.before}</b><b className="after">{row.after}</b><span className={`delta ${row.good ? 'good' : 'bad'}`}>{row.change}</span></div>)}
    <p className="compare-note"><Icon name="check" size={13} /> {infra.note}</p>
  </div>
}

const SCENARIO_LABELS = {
  A_2025_raw_sum: '2025 versiyası (KMZ)',
  B_2026_raw_sum: '2026 versiyası (KMZ) — kanonik şəbəkə',
  C_2025_plus_2026_raw_sum: '2025 + 2026 sadə cəm (təkrarlarla)',
  D_unique_segments_sum: 'Əvvəlki emal: ≤5 m təkrarlar silinib',
  G_dissolved_union_all: 'Bütün xətlərin həndəsi birləşməsi',
  J_2026_minus_internal_double_drawn: '2026, daxili ikiqat çəkilişlər çıxılmaqla'
}

// Bəyan edilmiş uzunluğun xam GIS mənbələri ilə yoxlanılması (scripts/gis/recalculate_lanes.py nəticəsi)
export function LaneRecalculation({ existing }) {
  const check = existing.verification.existing
  const report = existing.verification.report
  if (!report) return <p className="muted-text">Yenidən hesablama hesabatı tapılmadı (npm run gis:recalc).</p>
  const emptyLines = (report.qa_by_line ?? []).filter((line) => line.issues.some((issue) => issue.startsWith('tək nöqtəli')))
  const rows = Object.entries(SCENARIO_LABELS).filter(([key]) => report.scenarios_km?.[key] !== undefined)
  return <div>
    <table className="recalc-table">
      <thead><tr><th>SSENARİ</th><th style={{ textAlign: 'right' }}>UZUNLUQ</th></tr></thead>
      <tbody>
        <tr className="declared"><td>Bəyan edilmiş göstərici</td><td className="num">{fmt(check.declared_km, 2)} km</td></tr>
        {rows.map(([key, label]) => <tr key={key} className={key === 'B_2026_raw_sum' ? 'canonical' : ''}><td>{label}</td><td className="num">{fmt(report.scenarios_km[key], 2)} km</td></tr>)}
        <tr><td>Server tərəfində dinamik ölçü (xəritədəki şəbəkə)</td><td className="num">{fmt(check.measured_km, 2)} km</td></tr>
      </tbody>
    </table>
    <ul className="dq-list" style={{ marginTop: 14 }}>
      <li>Heç bir mənbə və hesablama üsulu <b>{fmt(check.declared_km, 1)} km</b> vermir. Fərq: <b>{fmt(check.difference_km, 2)} km ({fmt(check.difference_pct, 1)}%)</b>.</li>
      <li>Əvvəlki {fmt(report.previous_pipeline_km, 1)} km rəqəmi 2026-da yenidən çəkilmiş köhnə (2025) seqmentləri ikinci dəfə sayırdı: <b>+{fmt(report.previous_pipeline_overcount_km, 2)} km</b>.</li>
      <li>2026 faylı daxilində qovşaqlarda ikiqat çəkilmiş hissə: <b>{fmt(report.internal_double_drawn_km, 2)} km</b> (xəritədə saxlanılıb, aşağı sərhəd kimi göstərilir).</li>
      {existing.qa_flagged_segments.map((s) => <li key={s.id}><b>{s.name}</b> ({s.id}): {s.qa.join('; ')}</li>)}
      {emptyLines.length > 0 && <li>Koordinatsız (boş) placemark: <b>{[...new Set(emptyLines.map((l) => l.name))].join(', ')}</b> — {emptyLines.length} ədəd, uzunluğu bərpa etmək mümkün deyil.</li>}
    </ul>
  </div>
}

const STATUS_TEXT = { live: 'Canlı bağlantı', connecting: 'Qoşulur…', reconnecting: 'Yenidən qoşulur…' }

export function RealtimeStatus({ compact = false }) {
  const { data, connection, refreshing, error } = useLiveDashboard()
  const tone = connection.status === 'live' ? (connection.dataError || error ? 'warn' : 'live') : connection.status === 'connecting' ? 'warn' : 'down'
  const retry = connection.info?.retryInMs ? ` · ${Math.round(connection.info.retryInMs / 1000)} s sonra` : ''
  if (compact) return <div className={`rt-pill ${tone}`} title="Server-Sent Events bağlantısı"><span className="rt-dot" />{STATUS_TEXT[connection.status]}{refreshing && ' · yenilənir'}</div>
  return <div className={`rt-card ${tone}`}>
    <div className="rt-head"><span className="rt-dot" /><b>{STATUS_TEXT[connection.status]}{retry}</b>{refreshing && <span className="rt-sync">yenilənir…</span>}</div>
    <dl>
      <div><dt>Data versiyası</dt><dd>{data?.version ?? '—'}</dd></div>
      <div><dt>Data yükləndi</dt><dd>{time(data?.dataLoadedAt)}</dd></div>
      <div><dt>Son push yeniləmə</dt><dd>{time(connection.lastUpdateAt)}</dd></div>
      <div><dt>Yeniləmə sayı</dt><dd>{connection.updates}</dd></div>
    </dl>
    {connection.dataError && <p className="rt-error">Data faylında xəta: {connection.dataError.message}. Son düzgün versiya göstərilir.</p>}
    {error && data && <p className="rt-error">Son sorğu alınmadı: {error}</p>}
    <p className="rt-note">{connection.info?.live_file_updates === false
      ? 'Mənbə: Vercel serverless API (SSE). Data faylları yalnız yeni deploy ilə dəyişir — hər deploydan sonra açıq səhifələr yeni versiyanı avtomatik yükləyir.'
      : 'Mənbə: server data store (SSE ilə push). Hakaton dataseti statikdir — dəyişiklik yalnız data faylları yeniləndikdə baş verir.'}</p>
  </div>
}
