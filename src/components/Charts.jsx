import React from 'react'

const palette = ['#1d6fe8', '#12a150', '#f5b84b', '#ef6f88', '#36b7d8', '#9a8cff', '#65708b']

export function Sparkline({ values, color = '#1d6fe8', width = 120, height = 44 }) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - 7 - ((value - min) / range) * (height - 14)
    return `${x},${y}`
  }).join(' ')
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx={width} cy={Number(points.split(' ').at(-1).split(',')[1])} r="3" fill={color} /></svg>
}

export function AreaChart({ values, labels, color = '#1d6fe8', suffix = '%' }) {
  const width = 620
  const height = 230
  const pad = { top: 16, right: 12, bottom: 38, left: 34 }
  const max = Math.ceil(Math.max(...values) / 5) * 5
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom
  const points = values.map((value, index) => {
    const x = pad.left + (index / Math.max(values.length - 1, 1)) * chartW
    const y = pad.top + chartH - (value / max) * chartH
    return { x, y, value }
  })
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${pad.left},${pad.top + chartH} ${line} ${pad.left + chartW},${pad.top + chartH}`
  return <svg className="area-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Əhatə trendi">
    {[0, 1, 2, 3, 4].map((step) => { const y = pad.top + (chartH / 4) * step; return <g key={step}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="chart-grid" /><text x="4" y={y + 4} className="chart-axis">{Math.round(max - (max / 4) * step)}{suffix}</text></g> })}
    <polygon points={area} fill={`url(#areaGradient-${color.slice(1)})`} />
    <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <defs><linearGradient id={`areaGradient-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".26" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    {points.map((point, index) => <g key={labels[index]}><circle cx={point.x} cy={point.y} r="4" fill="#ffffff" stroke={color} strokeWidth="2" /><text x={point.x} y={height - 12} textAnchor="middle" className="chart-label">{labels[index]}</text><text x={point.x} y={point.y - 12} textAnchor="middle" className="chart-value">{point.value}{suffix}</text></g>)}
  </svg>
}

export function DonutChart({ segments, centerLabel, centerValue, className = '' }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1
  let cursor = 0
  const gradient = segments.map((segment, index) => { const start = cursor / total * 100; cursor += segment.value; const end = cursor / total * 100; return `${palette[index % palette.length]} ${start}% ${end}%` }).join(', ')
  return <div className={`donut-wrap ${className}`.trim()}><div className="donut" role="img" aria-label={`${centerLabel}: ${centerValue}`} style={{ background: `conic-gradient(${gradient})` }}><div className="donut-hole"><strong>{centerValue}</strong><span>{centerLabel}</span></div></div><div className="legend-list">{segments.map((segment, index) => <div className="legend-row" key={segment.label}><span className="legend-dot" style={{ background: palette[index % palette.length] }} /><span className="legend-label">{segment.label}</span><b>{segment.value.toLocaleString('az-AZ')} ₼</b></div>)}</div></div>
}

export function Bars({ items, valueKey = 'value', color = '#1d6fe8', formatter = (value) => value.toLocaleString('az-AZ') }) {
  const max = Math.max(...items.map((item) => item[valueKey]), 1)
  return <div className="bar-list">{items.map((item) => <div className="bar-item" key={item.label}><div className="bar-meta"><span>{item.label}</span><b>{formatter(item[valueKey])}</b></div><div className="bar-track"><span style={{ width: `${(item[valueKey] / max) * 100}%`, background: item.color ?? color }} /></div></div>)}</div>
}
