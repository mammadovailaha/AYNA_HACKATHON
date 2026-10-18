import React, { useEffect, useState } from 'react'
import Icon from './Icon'
import { api } from '../services/api'
import { fmt } from './Infrastructure'

const FIELD_LABELS = { address: 'Ünvan', coordinates: 'Koordinat', metro: 'Yaxın metro' }
const STATUS_LABELS = { proposed: 'Təklif edilən hub', candidate: 'Hub namizədi', existing: 'Mövcud hub' }
const STATION_LABELS = { connected: 'şəbəkəyə bağlı', newly_connected: 'yeni qoşulan', disconnected: 'əlaqəsiz' }

// Hub məlumatı /api/hubs/{id} endpoint-indən oxunur; data versiyası dəyişəndə yenidən yüklənir.
export default function HubDetails({ hubId, version, members, radiusM, onClose }) {
  const [state, setState] = useState({ hub: null, loading: false, error: '' })

  useEffect(() => {
    if (!hubId) return undefined
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    api.hub(hubId)
      .then(({ data }) => { if (!cancelled) setState({ hub: data, loading: false, error: '' }) })
      .catch((error) => { if (!cancelled) setState({ hub: null, loading: false, error: error.message }) })
    return () => { cancelled = true }
  }, [hubId, version])

  if (!hubId) return <div className="hub-details empty"><Icon name="pin" size={26} /><b>Hub seçin</b><p>Xəritədəki istənilən hub markerinə klik edin — ünvan, koordinat, nəqliyyat əlaqələri və prioritet burada görünəcək.</p></div>
  if (state.loading && !state.hub) return <div className="hub-details empty"><div className="loader" /><p>Hub məlumatı yüklənir…</p></div>
  if (state.error) return <div className="hub-details empty error"><Icon name="alert" size={24} /><b>Hub yüklənmədi</b><p>{state.error}</p></div>
  const hub = state.hub
  if (!hub) return null
  const near = hub.nearby_infrastructure

  return <div className="hub-details">
    <div className="hub-details-head">
      <div><span className={`hub-status-chip ${hub.status}`}>{STATUS_LABELS[hub.status] ?? hub.status}{hub.priority.rank ? ` · #${hub.priority.rank}` : ''}</span><h3>{hub.name}</h3><small>{hub.id} · {hub.kind}</small></div>
      <button type="button" className="icon-close" onClick={onClose} aria-label="Bağla"><Icon name="close" size={16} /></button>
    </div>
    <dl className="hub-facts">
      <div><dt>Ünvan</dt><dd>{hub.address ?? <span className="missing">Datasetdə yoxdur</span>}</dd></div>
      <div><dt>Latitude / Longitude</dt><dd className="mono">{hub.coordinates ? `${hub.coordinates.lat.toFixed(5)}, ${hub.coordinates.lng.toFixed(5)}` : <span className="missing">Yoxlanılmalıdır</span>}</dd></div>
      <div><dt>Koordinat mənbəyi</dt><dd>{hub.coordinate_source ?? '—'}</dd></div>
      <div><dt>Yerləşmə sahəsi</dt><dd>{hub.site ? `${hub.site.type} · ${fmt(hub.site.area_m2)} m² · ${fmt(hub.site.distance_m)} m` : '—'}</dd></div>
    </dl>
    {members && <div className="hub-block hub-members">
      <h4><Icon name="layers" size={15} /> Hub-a aid elementlər ({fmt(radiusM)} m radius)</h4>
      <ul>
        <li><i className="lg-dot selected" /> Mikromobillik məntəqəsi: <b>{members.stations.length}</b></li>
        <li><i className="lg-line existing" /> Mövcud zolaq seqmenti: <b>{members.existing_lanes.length}</b></li>
        <li><i className="lg-line planned" /> Planlaşdırılan seqment: <b>{members.planned_lanes.length}</b>{members.planned_lanes.length > 0 && <small> ({members.planned_lanes.join(', ')})</small>}</li>
        <li><i className="lg-line backbone" /> Şəbəkə əlaqəsi: <b>{members.links.length}</b></li>
        <li><i className="lg-overlap" /> Ortaq əhatə: <b>{members.overlaps_with.length ? members.overlaps_with.join(', ') : 'yoxdur'}</b></li>
      </ul>
      <small className="muted-text">Qayda: koordinatı radius daxilində olan məntəqələr və radiusu kəsən seqmentlər. Xəritədə sarı ilə vurğulanır.</small>
    </div>}
    <div className="hub-block">
      <h4><Icon name="bike" size={15} /> Yaxın velosiped infrastrukturu</h4>
      {near ? <ul>
        <li>Mövcud zolaq: <b>{near.nearest_existing_lane ? `${fmt(near.nearest_existing_lane.distance_m)} m` : '—'}</b></li>
        <li>Planlaşdırılan seqment: <b>{near.nearest_planned_segment ? `${near.nearest_planned_segment.id} · ${fmt(near.nearest_planned_segment.distance_m)} m` : '—'}</b></li>
        <li>300 m-də məntəqə: <b>{near.stations_within_300m}</b>{near.stations_within_300m > 0 && <small> ({Object.entries(near.stations_within_300m_by_status).map(([k, v]) => `${v} ${STATION_LABELS[k] ?? k}`).join(', ')})</small>}</li>
      </ul> : <p className="muted-text">Koordinat olmadığı üçün hesablanmadı.</p>}
    </div>
    <div className="hub-block">
      <h4><Icon name="route" size={15} /> Nəqliyyat əlaqələri</h4>
      <ul>
        <li>Metro: <b>{hub.transit.metro ? `${hub.transit.metro.name} · ${fmt(hub.transit.metro.distance_m)} m` : '—'}</b></li>
        <li>Avtobus xətti (300 m): <b>{hub.transit.bus_line_count}</b></li>
      </ul>
      {hub.transit.bus_lines.length > 0 && <div className="line-chips">{hub.transit.bus_lines.slice(0, 24).map((line) => <span key={line}>{line}</span>)}{hub.transit.bus_lines.length > 24 && <span>+{hub.transit.bus_lines.length - 24}</span>}</div>}
    </div>
    <div className="hub-block">
      <h4><Icon name="chart" size={15} /> Seçilmə səbəbi və prioritet</h4>
      <p className="hub-reason">{hub.selection_reason ?? '—'}</p>
      <div className="priority-meter"><div><span>Prioritet indeksi</span><b>{hub.priority.index}/100</b></div><div className="priority-track"><i style={{ width: `${hub.priority.index}%` }} /></div><small>{hub.priority.index_formula}</small></div>
    </div>
    {hub.missing_fields.length > 0 && <div className="hub-missing"><Icon name="alert" size={14} /> Çatışmayan məlumat: {hub.missing_fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}</div>}
  </div>
}
