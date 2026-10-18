import React, { useMemo, useState } from 'react'
import Icon from './Icon'
import { fold } from './Search'

/**
 * Xəritənin sol panelində hub siyahısı. Hər hub ayrıca checkbox ilə idarə olunur:
 * işarələnmiş hub-lar (və onların radiusu, əlaqələri, heatmap nöqtələri) xəritədə görünür.
 * Siyahı /api/hubs cavabından gəlir — statik deyil.
 */
export default function HubList({ hubs, loading, error, visible, onToggle, onSetAll, selectedHub, onSelect }) {
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => {
    const term = fold(filter.trim())
    const list = (hubs ?? []).filter((hub) => !term || fold(`${hub.name} ${hub.id}`).includes(term))
    const byRank = (a, b) => (a.priority.rank ?? 99) - (b.priority.rank ?? 99) || b.priority.index - a.priority.index
    return [
      { key: 'central', title: 'Mərkəzi hub-lar', items: list.filter((hub) => hub.status === 'proposed').sort(byRank) },
      { key: 'existing', title: 'Mövcud hub-lar', items: list.filter((hub) => hub.status === 'existing').sort(byRank) },
      { key: 'candidate', title: 'Hub namizədləri', items: list.filter((hub) => hub.status === 'candidate').sort(byRank) }
    ].filter((group) => group.items.length)
  }, [hubs, filter])

  if (loading) return <div className="hub-list-panel state"><div className="loader" /><span>Hub-lar yüklənir…</span></div>
  if (error) return <div className="hub-list-panel state error"><Icon name="alert" size={20} /><span>Hub siyahısı yüklənmədi: {error}</span></div>
  if (!hubs?.length) return <div className="hub-list-panel state"><Icon name="pin" size={20} /><span>Datasetdə hub tapılmadı.</span></div>

  const located = hubs.filter((hub) => hub.coordinates)
  return <div className="hub-list-panel">
    <div className="hub-list-head">
      <b>Hub-lar <span>{visible.size}/{located.length}</span></b>
      <div className="hub-list-actions"><button type="button" onClick={() => onSetAll(true)}>Hamısı</button><button type="button" onClick={() => onSetAll(false)}>Heç biri</button></div>
    </div>
    <input className="hub-list-filter" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Hub axtar…" aria-label="Hub siyahısında axtar" />
    <div className="hub-list-scroll">
      {groups.length === 0 && <p className="hub-list-empty">Uyğun hub yoxdur.</p>}
      {groups.map((group) => <div key={group.key} className="hub-list-group">
        <small>{group.title} · {group.items.length}</small>
        {group.items.map((hub) => {
          const disabled = !hub.coordinates
          return <div key={hub.id} className={`hub-list-item ${selectedHub === hub.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
            <label title={disabled ? 'Koordinat yoxdur — xəritədə göstərilə bilməz' : `${hub.name} — xəritədə göstər/gizlət`}>
              <input type="checkbox" checked={visible.has(hub.id)} disabled={disabled} onChange={() => onToggle(hub.id)} />
              <span className={`hub-dot ${hub.status}`} aria-hidden="true">{hub.priority.rank ?? ''}</span>
            </label>
            <button type="button" className="hub-list-name" disabled={disabled} onClick={() => onSelect(hub.id)} title="Xəritədə fokusla və detallara bax">
              <span>{hub.name}</span><small>{hub.id}{disabled ? ' · koordinat yoxdur' : ''}</small>
            </button>
          </div>
        })}
      </div>)}
    </div>
  </div>
}
