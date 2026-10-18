import React from 'react'
import Icon from './Icon'
import { Mark, searchClass, useSearchMatch } from './Search'

export function StatusBadge({ children, tone = 'purple' }) { return <span className={`status-badge ${tone}`}>{children}</span> }

export function SectionHeader({ eyebrow, title, description, action }) {
  return <div className="section-header"><div><span className="eyebrow">{eyebrow}</span><h2><Mark text={title} /></h2>{description && <p>{description}</p>}</div>{action}</div>
}

// Panelin axtarış başlığı: açıq searchTitle və ya daxilindəki PanelHeader-in title-ı
const panelTitle = (children, searchTitle) => searchTitle ?? React.Children.toArray(children).find((child) => child?.type === PanelHeader)?.props.title

export function Panel({ children, className = '', searchTitle }) {
  const match = useSearchMatch(panelTitle(children, searchTitle))
  return <section className={`panel ${className} ${searchClass(match)}`}>{children}</section>
}

export function PanelHeader({ title, subtitle, action }) { return <div className="panel-header"><div><h3><Mark text={title} /></h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div> }

export function MetricCard({ label, value, change, changeLabel, icon, tone = 'purple', sparkline }) {
  const match = useSearchMatch(label)
  return <article className={`metric-card tone-${tone} ${searchClass(match)}`}><div className="metric-top"><span className="metric-label"><Mark text={label} /></span><span className="metric-icon"><Icon name={icon} size={20} /></span></div><div className="metric-value">{value}</div><div className="metric-bottom">{change && <span className={`metric-change ${change.startsWith('-') ? 'negative' : ''}`}><Icon name={change.startsWith('-') ? 'arrowDown' : 'arrowUp'} size={13} /> {change}</span>}<span className="metric-change-label">{changeLabel}</span>{sparkline && <span className="metric-spark"><img alt="" src={sparkline} /></span>}</div></article>
}

export function EmptyState({ message }) { return <div className="empty-state"><Icon name="grid" size={24} /><p>{message}</p></div> }
