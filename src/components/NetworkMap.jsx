import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import HubDetails from './HubDetails'
import HubList from './HubList'
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
const ALL_OFF = Object.fromEntries(Object.keys(LEGEND).map((key) => [key, false]))

const byIds = (fc, keep) => fc && ({ ...fc, features: fc.features.filter(keep) })

/**
 * Vahid interaktiv şəbəkə xəritəsi (Hub xəritəsi və Şəbəkə ssenarisi üçün ortaq).
 * - toggles: qat checkbox-ları [{ key, label, value?, group? }]
 * - defaults: ilkin qat vəziyyəti; defaults.hubs hub siyahısında hamısının/heç birinin seçilməsini təyin edir
 * - preset: { key, nonce, layers, heatMetric?, focus, note } — banner kateqoriyasından gələn görünüş
 * Hub görünüşü tək mənbədən idarə olunur: sol siyahıdakı checkbox-lar (visible dəsti).
 */
export default function NetworkMap({ toggles, defaults, heatMetricSwitch = false, scenarioKey = 'planned', footer, title, preset, onClearPreset }) {
  const { data: live, error: liveError } = useLiveDashboard()
  const { cycling, hubs, heatmap, hubNetwork } = live
  const locatedIds = useMemo(() => hubs.hubs.filter((hub) => hub.coordinates).map((hub) => hub.id), [hubs])
  const [layers, setLayers] = useState(defaults)
  const [visible, setVisible] = useState(() => new Set(defaults.hubs ? locatedIds : []))
  const [basemap, setBasemap] = useState('satellite')
  const [heatMetric, setHeatMetric] = useState('hubs')
  const [selectedHub, setSelectedHub] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [focus, setFocus] = useState(null)

  // Hub qatının checkbox-u = siyahıda ən azı bir hub seçilib
  const effectiveLayers = useMemo(() => ({ ...layers, hubs: visible.size > 0 }), [layers, visible])

  const toggle = (key) => {
    if (key === 'hubs') setVisible(new Set(visible.size ? [] : locatedIds))
    else setLayers((current) => ({ ...current, [key]: !current[key] }))
  }
  const toggleHub = (id) => setVisible((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const selectHub = (id) => {
    setVisible((current) => (current.has(id) ? current : new Set([...current, id])))
    setSelectedHub(id)
  }
  const close = useCallback(() => setExpanded(false), [])

  useEffect(() => { if (selectedHub && !visible.has(selectedHub)) setSelectedHub(null) }, [visible, selectedHub])

  // Banner kateqoriyası: əvvəlki qatlar tam əvəzlənir ki, seçimlər bir-birinə qarışmasın
  useEffect(() => {
    if (!preset) return
    setLayers({ ...ALL_OFF, ...preset.layers })
    setVisible(new Set(preset.layers.hubs ? locatedIds : []))
    if (preset.heatMetric) setHeatMetric(preset.heatMetric)
    setSelectedHub(null)
    setFocus({ target: preset.focus, nonce: preset.nonce })
  }, [preset?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (event) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('map-expanded-lock')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('map-expanded-lock') }
  }, [expanded, close])

  // Yalnız seçilmiş hub-lar və onlara aid radius, əlaqə, kəsişmə və heatmap nöqtələri
  const data = useMemo(() => {
    const show = (id) => visible.has(id)
    return {
      existing: cycling.existing.geojson,
      planned: cycling.planned.geojson,
      hubs: byIds(hubs.geojson, (f) => show(f.properties.id)),
      heatmap: heatMetric === 'hubs' ? byIds(heatmap.hubs.geojson, (f) => show(f.properties.id)) : heatmap.stations.geojson,
      stations: heatmap.stations.geojson,
      network: {
        ...hubNetwork,
        circles: byIds(hubNetwork.circles, (f) => show(f.properties.id)),
        links: byIds(hubNetwork.links, (f) => show(f.properties.from) && show(f.properties.to)),
        overlaps: byIds(hubNetwork.overlaps, (f) => f.properties.hubs.every(show))
      }
    }
  }, [cycling, hubs, heatmap, heatMetric, hubNetwork, visible])

  const members = selectedHub ? hubNetwork.members[selectedHub] : null
  const activeLegend = Object.entries(LEGEND).filter(([key]) => effectiveLayers[key]).flatMap(([, items]) => items)
  if (layers.stations && layers[scenarioKey]) activeLegend.splice(3, 0, ['lg-dot station-newly', 'Yeni ssenari ilə qoşulan məntəqə'])

  return <section className={`network-workspace panel ${expanded ? 'is-expanded' : ''}`} aria-label={title}>
    <div className="map-toolbar network-toolbar">
      <div className="map-legend">{toggles.map((t) => <label key={t.key} className={`map-layer-toggle ${effectiveLayers[t.key] ? 'active' : 'inactive'} ${t.group ?? ''}`}>
        <input type="checkbox" checked={Boolean(effectiveLayers[t.key])} onChange={() => toggle(t.key)} />
        <span className="layer-check" aria-hidden="true">{effectiveLayers[t.key] ? <Icon name="check" size={14} /> : <span />}</span>
        <span>{t.label}</span>{t.key === 'hubs' ? <em>{visible.size}/{locatedIds.length} hub</em> : t.value && <em>{t.value}</em>}
      </label>)}</div>
      <div className="map-tools">
        {heatMetricSwitch && layers.heatmap && <div className="heat-metric" role="group" aria-label="Heatmap göstəricisi"><button type="button" className={heatMetric === 'hubs' ? 'active' : ''} onClick={() => setHeatMetric('hubs')}>Hub sıxlığı</button><button type="button" className={heatMetric === 'stations' ? 'active' : ''} onClick={() => setHeatMetric('stations')}>Məntəqə sıxlığı</button></div>}
        <div className="heat-metric" role="group" aria-label="Baza xəritə"><button type="button" className={basemap === 'satellite' ? 'active' : ''} onClick={() => setBasemap('satellite')}>Peyk</button><button type="button" className={basemap === 'streets' ? 'active' : ''} onClick={() => setBasemap('streets')}>Küçə</button></div>
        <button type="button" className="secondary-button expand-button" onClick={() => setExpanded((v) => !v)} aria-pressed={expanded}><Icon name={expanded ? 'close' : 'external'} size={15} /> {expanded ? 'Kiçilt' : 'Genişləndir'}</button>
      </div>
      {preset && <div className="preset-note"><Icon name="layers" size={14} /> {preset.note}{onClearPreset && <button type="button" onClick={onClearPreset}>Sıfırla</button>}</div>}
    </div>
    <div className="gis-layout with-list">
      <aside className="gis-hub-list">
        <HubList hubs={hubs?.hubs} loading={!hubs} error={hubs ? '' : liveError} visible={visible} onToggle={toggleHub} onSetAll={(all) => setVisible(new Set(all ? locatedIds : []))} selectedHub={selectedHub} onSelect={selectHub} />
      </aside>
      <div className="gis-map-wrap">
        <Suspense fallback={<div className="gis-map-overlay"><div className="loader" /><span>Xəritə yüklənir…</span></div>}>
          <GisMap data={data} layers={effectiveLayers} basemap={basemap} scenarioActive={Boolean(layers[scenarioKey])} selectedHubId={selectedHub} selectedMembers={members} onSelectHub={setSelectedHub} focus={focus} />
        </Suspense>
        {activeLegend.length > 0 && <div className="gis-legend"><b>Leqend</b>{activeLegend.map(([cls, label]) => <span key={label}><i className={cls} /> {label}</span>)}{selectedHub && <span><i className="lg-dot selected" /> Seçilmiş hub-a aid</span>}</div>}
        {selectedHub && <aside className="hub-drawer">
          <HubDetails hubId={selectedHub} version={live.version} members={members} radiusM={hubNetwork.config.coverage_radius_m} onClose={() => setSelectedHub(null)} />
        </aside>}
      </div>
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
