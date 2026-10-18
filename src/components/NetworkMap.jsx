import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import HubDetails from './HubDetails'
import { useLiveDashboard } from '../hooks/useLiveDashboard'

// MapLibre böyük kitabxanadır — yalnız xəritə açılanda yüklənir
const GisMap = lazy(() => import('./GisMap'))

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('az-AZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })

const LEGEND = {
  existing: [['lg-line existing', 'Mövcud velo zolağı']],
  stations: [['lg-dot station-connected', 'Şəbəkəyə bağlı məntəqə'], ['lg-dot station-disconnected', 'Əlaqəsiz məntəqə']],
  planned: [['lg-line planned', 'Planlaşdırılan zolaq']],
  hubs: [['lg-dot proposed', 'Mərkəzi (təklif edilən) hub'], ['lg-dot candidate', 'Hub namizədi']],
  radius: [['lg-ring', 'Hub əhatə radiusu'], ['lg-overlap', 'Ortaq əhatə zonası']],
  links: [['lg-line backbone', 'Magistral əlaqə (MST)'], ['lg-line spoke', 'Hub → mərkəz əlaqəsi']],
  heatmap: [['lg-heat', 'Sıxlıq: aşağı → yüksək']]
}

/**
 * Vahid interaktiv şəbəkə xəritəsi: checkbox-larla idarə olunan qatlar, peyk/küçə baza xəritəsi,
 * genişləndirmə rejimi və hub detalları. Bütün data LiveDataProvider-dən gəlir (təkrar yüklənmir).
 * toggles: [{ key, label, value? , group? }] — key LAYER_GROUPS açarıdır.
 */
export default function NetworkMap({ toggles, defaults, heatMetricSwitch = false, scenarioKey = 'planned', footer, title }) {
  const live = useLiveDashboard().data
  const { cycling, hubs, heatmap, hubNetwork } = live
  const [layers, setLayers] = useState(defaults)
  const [basemap, setBasemap] = useState('satellite')
  const [heatMetric, setHeatMetric] = useState('hubs')
  const [selectedHub, setSelectedHub] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const toggle = (key) => setLayers((current) => ({ ...current, [key]: !current[key] }))
  const close = useCallback(() => setExpanded(false), [])

  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (event) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('map-expanded-lock')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('map-expanded-lock') }
  }, [expanded, close])

  const data = useMemo(() => ({
    existing: cycling.existing.geojson,
    planned: cycling.planned.geojson,
    hubs: hubs.geojson,
    heatmap: heatmap[heatMetric].geojson,
    stations: heatmap.stations.geojson,
    network: hubNetwork
  }), [cycling, hubs, heatmap, heatMetric, hubNetwork])

  const members = selectedHub ? hubNetwork.members[selectedHub] : null
  const activeLegend = Object.entries(LEGEND).filter(([key]) => layers[key]).flatMap(([, items]) => items)
  if (layers.stations && layers[scenarioKey]) activeLegend.splice(3, 0, ['lg-dot station-newly', 'Yeni ssenari ilə qoşulan məntəqə'])

  return <section className={`network-workspace panel ${expanded ? 'is-expanded' : ''}`} aria-label={title}>
    <div className="map-toolbar network-toolbar">
      <div className="map-legend">{toggles.map((t) => <label key={t.key} className={`map-layer-toggle ${layers[t.key] ? 'active' : 'inactive'} ${t.group ?? ''}`}>
        <input type="checkbox" checked={Boolean(layers[t.key])} onChange={() => toggle(t.key)} />
        <span className="layer-check" aria-hidden="true">{layers[t.key] ? <Icon name="check" size={14} /> : <span />}</span>
        <span>{t.label}</span>{t.value && <em>{t.value}</em>}
      </label>)}</div>
      <div className="map-tools">
        {heatMetricSwitch && layers.heatmap && <div className="heat-metric" role="group" aria-label="Heatmap göstəricisi"><button type="button" className={heatMetric === 'hubs' ? 'active' : ''} onClick={() => setHeatMetric('hubs')}>Hub sıxlığı</button><button type="button" className={heatMetric === 'stations' ? 'active' : ''} onClick={() => setHeatMetric('stations')}>Məntəqə sıxlığı</button></div>}
        <div className="heat-metric" role="group" aria-label="Baza xəritə"><button type="button" className={basemap === 'satellite' ? 'active' : ''} onClick={() => setBasemap('satellite')}>Peyk</button><button type="button" className={basemap === 'streets' ? 'active' : ''} onClick={() => setBasemap('streets')}>Küçə</button></div>
        <button type="button" className="secondary-button expand-button" onClick={() => setExpanded((v) => !v)} aria-pressed={expanded}><Icon name={expanded ? 'close' : 'external'} size={15} /> {expanded ? 'Kiçilt' : 'Genişləndir'}</button>
      </div>
    </div>
    <div className="gis-layout">
      <div className="gis-map-wrap">
        <Suspense fallback={<div className="gis-map-overlay"><div className="loader" /><span>Xəritə yüklənir…</span></div>}>
          <GisMap data={data} layers={layers} basemap={basemap} scenarioActive={Boolean(layers[scenarioKey])} selectedHubId={selectedHub} selectedMembers={members} onSelectHub={setSelectedHub} />
        </Suspense>
        {activeLegend.length > 0 && <div className="gis-legend"><b>Leqend</b>{activeLegend.map(([cls, label]) => <span key={label}><i className={cls} /> {label}</span>)}{selectedHub && <span><i className="lg-dot selected" /> Seçilmiş hub-a aid</span>}</div>}
      </div>
      <aside className="gis-side">
        <HubDetails hubId={selectedHub} version={live.version} members={members} radiusM={hubNetwork.config.coverage_radius_m} onClose={() => setSelectedHub(null)} />
      </aside>
    </div>
    {footer && <div className="map-footer">{footer}</div>}
    <div className="map-footer network-meta">
      <span><b>{hubNetwork.counts.central}</b> mərkəzi hub</span>
      <span><b>{hubNetwork.counts.satellites_linked}</b> bağlı hub</span>
      <span><b>{hubNetwork.counts.overlaps}</b> ortaq əhatə zonası</span>
      <span><b>{fmt(hubNetwork.counts.stations_covered)}</b>/{fmt(hubNetwork.counts.stations_total)} məntəqə radius daxilində</span>
      <span className="map-note">Radius {hubNetwork.config.coverage_radius_m} m · əlaqə ≤ {fmt(hubNetwork.config.link_max_m / 1000, 1)} km · düz xətt məsafələri, real koordinatlar</span>
    </div>
  </section>
}
