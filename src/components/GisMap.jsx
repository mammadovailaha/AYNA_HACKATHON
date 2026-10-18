import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

const BAKU_CENTER = [49.85, 40.395]
const GLYPHS = 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf'

// Peyk: Esri World Imagery + yol və yer adları qatları (açar tələb etmir). Küçə: CARTO Positron.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const STYLES = {
  satellite: {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      imagery: { type: 'raster', tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
      roads: { type: 'raster', tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
      places: { type: 'raster', tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: 'Labels © Esri' }
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'imagery' },
      { id: 'roads-ref', type: 'raster', source: 'roads', paint: { 'raster-opacity': 0.6 } },
      { id: 'places-ref', type: 'raster', source: 'places' }
    ]
  },
  streets: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
}

const C = { existing: '#3b82f6', planned: '#22c55e', central: '#16a34a', satellite: '#2563eb', overlap: '#f59e0b', highlight: '#facc15', disconnected: '#f97316', connected: '#e0f2fe', newly: '#4ade80' }

// Hər checkbox-a uyğun MapLibre qatları
const LAYER_GROUPS = {
  existing: ['lanes-existing-casing', 'lanes-existing', 'lanes-existing-qa'],
  stations: ['stations'],
  planned: ['lanes-planned-glow', 'lanes-planned'],
  hubs: ['hubs-halo', 'hubs-circle', 'hubs-label'],
  radius: ['hub-radius-fill', 'hub-radius-line', 'hub-overlap-fill', 'hub-overlap-line'],
  links: ['hub-links-backbone', 'hub-links-spoke'],
  heatmap: ['hub-heat']
}

const emptyFc = { type: 'FeatureCollection', features: [] }
const SOURCES = ['lanes-existing', 'lanes-planned', 'hubs', 'heat', 'stations', 'hub-circles', 'hub-overlaps', 'hub-links']

function boundsOf(collections) {
  const bounds = new maplibregl.LngLatBounds()
  collections.forEach((fc) => fc?.features.forEach((f) => {
    const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates
    coords.forEach((c) => bounds.extend(c))
  }))
  return bounds.isEmpty() ? null : bounds
}

const none = ['literal', ['__none__']]

function addLayers(map) {
  SOURCES.forEach((id) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: emptyFc, ...(id === 'hubs' ? { promoteId: 'id' } : {}) }) })
  const width = (lo, hi) => ['interpolate', ['linear'], ['zoom'], 10, lo, 15, hi]

  map.addLayer({ id: 'hub-heat', type: 'heatmap', source: 'heat', paint: {
    'heatmap-weight': ['coalesce', ['get', 'weight'], 1],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 13, 1.4, 16, 2.4],
    'heatmap-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 22, 12, 38, 14, 64, 16, 96],
    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(59,130,246,0)', 0.15, 'rgba(147,197,253,0.55)', 0.35, 'rgba(56,189,248,0.7)', 0.55, 'rgba(74,222,128,0.8)', 0.75, 'rgba(250,204,21,0.85)', 1, 'rgba(239,68,68,0.9)'],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.85, 16.5, 0.35]
  } })

  map.addLayer({ id: 'hub-radius-fill', type: 'fill', source: 'hub-circles', paint: { 'fill-color': ['match', ['get', 'role'], 'central', C.central, C.satellite], 'fill-opacity': 0.14 } })
  map.addLayer({ id: 'hub-radius-line', type: 'line', source: 'hub-circles', paint: { 'line-color': ['match', ['get', 'role'], 'central', C.central, C.satellite], 'line-width': 1.4, 'line-opacity': 0.85 } })
  map.addLayer({ id: 'hub-overlap-fill', type: 'fill', source: 'hub-overlaps', paint: { 'fill-color': C.overlap, 'fill-opacity': 0.38 } })
  map.addLayer({ id: 'hub-overlap-line', type: 'line', source: 'hub-overlaps', paint: { 'line-color': C.overlap, 'line-width': 1 } })
  map.addLayer({ id: 'sel-radius-fill', type: 'fill', source: 'hub-circles', filter: ['in', ['get', 'id'], none], paint: { 'fill-color': C.highlight, 'fill-opacity': 0.18 } })
  map.addLayer({ id: 'sel-radius-line', type: 'line', source: 'hub-circles', filter: ['in', ['get', 'id'], none], paint: { 'line-color': C.highlight, 'line-width': 3 } })

  map.addLayer({ id: 'lanes-existing-casing', type: 'line', source: 'lanes-existing', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': width(2.5, 8) } })
  map.addLayer({ id: 'lanes-existing', type: 'line', source: 'lanes-existing', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.existing, 'line-width': width(1.4, 4.5) } })
  map.addLayer({ id: 'lanes-existing-qa', type: 'line', source: 'lanes-existing', filter: ['>', ['coalesce', ['get', 'qa_count'], 0], 0], paint: { 'line-color': '#f59e0b', 'line-width': width(2, 5), 'line-dasharray': [1.5, 1.5] } })
  map.addLayer({ id: 'lanes-planned-glow', type: 'line', source: 'lanes-planned', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.planned, 'line-opacity': 0.25, 'line-width': width(6, 16) } })
  map.addLayer({ id: 'lanes-planned', type: 'line', source: 'lanes-planned', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.planned, 'line-width': width(2, 5), 'line-dasharray': [2, 1.4] } })
  map.addLayer({ id: 'sel-lanes', type: 'line', source: 'lanes-existing', filter: ['in', ['get', 'id'], none], layout: { 'line-cap': 'round' }, paint: { 'line-color': C.highlight, 'line-width': width(3, 7) } })
  map.addLayer({ id: 'sel-lanes-planned', type: 'line', source: 'lanes-planned', filter: ['in', ['get', 'id'], none], layout: { 'line-cap': 'round' }, paint: { 'line-color': C.highlight, 'line-width': width(3, 7), 'line-dasharray': [2, 1.2] } })

  map.addLayer({ id: 'hub-links-spoke', type: 'line', source: 'hub-links', filter: ['==', ['get', 'type'], 'spoke'], paint: { 'line-color': '#bae6fd', 'line-width': width(1.2, 2.5), 'line-dasharray': [2, 2], 'line-opacity': 0.9 } })
  map.addLayer({ id: 'hub-links-backbone', type: 'line', source: 'hub-links', filter: ['==', ['get', 'type'], 'backbone'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': width(2.5, 5), 'line-opacity': 0.95 } })
  map.addLayer({ id: 'sel-links', type: 'line', source: 'hub-links', filter: ['in', ['get', 'id'], none], layout: { 'line-cap': 'round' }, paint: { 'line-color': C.highlight, 'line-width': width(2.5, 5) } })

  map.addLayer({ id: 'stations', type: 'circle', source: 'stations', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.8, 15, 5],
    'circle-color': C.connected, 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 0.6
  } })
  map.addLayer({ id: 'sel-stations', type: 'circle', source: 'stations', filter: ['in', ['get', 'id'], none], paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 8], 'circle-color': C.highlight, 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 1.2
  } })

  const role = ['match', ['get', 'status'], 'proposed', C.central, C.satellite]
  map.addLayer({ id: 'hubs-halo', type: 'circle', source: 'hubs', paint: { 'circle-color': role, 'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.4, 0.18], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'status'], 'proposed', 15, 9], 15, ['match', ['get', 'status'], 'proposed', 32, 20]] } })
  map.addLayer({ id: 'hubs-circle', type: 'circle', source: 'hubs', paint: {
    'circle-color': role,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'status'], 'proposed', 8, 4.5], 15, ['match', ['get', 'status'], 'proposed', 14, 8]],
    'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], C.highlight, '#ffffff'],
    'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, 2]
  } })
  map.addLayer({ id: 'hubs-label', type: 'symbol', source: 'hubs', filter: ['==', ['get', 'status'], 'proposed'], layout: { 'text-field': ['to-string', ['get', 'rank']], 'text-size': 11, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } })
}

export default function GisMap({ data, layers, basemap = 'satellite', scenarioActive = true, selectedHubId, selectedMembers, onSelectHub }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(0) // hər stil yüklənməsində artır → data və qatlar yenidən tətbiq olunur
  const [mapError, setMapError] = useState('')
  const selectedRef = useRef(null)
  const fitted = useRef(false)
  const basemapRef = useRef(basemap)
  const onSelectRef = useRef(onSelectHub)
  onSelectRef.current = onSelectHub

  useEffect(() => {
    const map = new maplibregl.Map({ container: container.current, style: STYLES[basemap], center: BAKU_CENTER, zoom: 11.3, attributionControl: { compact: true }, maxZoom: 18.5 })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('style.load', () => { addLayers(map); setReady((n) => n + 1) })
    map.on('error', (event) => { if (!map.isStyleLoaded()) setMapError(event.error?.message ?? 'Baza xəritə yüklənmədi') })

    const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'gis-tooltip', offset: 10 })
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const hover = (layer, html) => {
      map.on('mousemove', layer, (event) => { map.getCanvas().style.cursor = 'pointer'; tooltip.setLngLat(event.lngLat).setHTML(html(event.features[0].properties)).addTo(map) })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; tooltip.remove() })
    }
    hover('lanes-planned', (p) => `<b>${esc(p.id)} · ${esc(p.name)}</b><span>Planlaşdırılır · ${Number(p.length_km).toFixed(2)} km</span>`)
    hover('lanes-existing', (p) => {
      const qa = typeof p.qa === 'string' ? JSON.parse(p.qa) : (p.qa ?? [])
      const origin = String(p.also_in_2025) === 'true' ? '2025-dən mövcud' : '2026-da əlavə'
      return `<b>${esc(p.name ?? 'Mövcud velo zolaq')}</b><span>Mövcud · ${Number(p.length_km).toFixed(2)} km · ${origin}</span>${qa.length ? `<span class="qa-note">⚠ ${esc(qa.join('; '))}</span>` : ''}`
    })
    hover('hubs-circle', (p) => `<b>${esc(p.id)} · ${esc(p.name)}</b><span>${p.status === 'proposed' ? `Mərkəzi hub #${p.rank}` : 'Hub namizədi'} · klik edin</span>`)
    hover('hub-links-backbone', (p) => `<b>Magistral əlaqə ${esc(p.from)} ↔ ${esc(p.to)}</b><span>${(p.distance_m / 1000).toFixed(2)} km düz xətt məsafəsi</span>`)
    hover('hub-links-spoke', (p) => `<b>Əlaqə ${esc(p.from)} → ${esc(p.to)}</b><span>${(p.distance_m / 1000).toFixed(2)} km düz xətt məsafəsi</span>`)
    hover('hub-overlap-fill', (p) => `<b>Ortaq əhatə: ${esc(JSON.parse(p.hubs).join(' ∩ '))}</b><span>${(p.overlap_area_m2 / 10000).toFixed(1)} ha · mərkəzlər arası ${p.distance_m} m</span>`)
    hover('stations', (p) => `<b>Mikromobillik məntəqəsi ${esc(p.id)}</b><span>${{ connected: 'Şəbəkəyə bağlı', newly_connected: 'Yeni ssenari ilə qoşulur', disconnected: 'Əlaqəsiz (zolaqdan >100 m)' }[p.status] ?? p.status}</span>`)
    map.on('click', 'hubs-circle', (event) => onSelectRef.current?.(event.features[0].properties.id))

    // Konteyner ölçüsü dəyişəndə (genişləndirmə, sidebar) xəritə yenidən hesablanır; mərkəz və zoom qorunur
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => { observer.disconnect(); tooltip.remove(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || basemapRef.current === basemap) return
    basemapRef.current = basemap
    map.setStyle(STYLES[basemap])
  }, [basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const set = (id, fc) => map.getSource(id)?.setData(fc ?? emptyFc)
    set('lanes-existing', data.existing)
    set('lanes-planned', data.planned)
    set('hubs', data.hubs)
    set('heat', data.heatmap)
    set('stations', data.stations)
    set('hub-circles', data.network?.circles)
    set('hub-overlaps', data.network?.overlaps)
    set('hub-links', data.network?.links)
    if (!fitted.current && data.existing?.features.length) {
      const bounds = boundsOf([data.existing, data.planned])
      if (bounds) map.fitBounds(bounds, { padding: 50, duration: 0, maxZoom: 14 })
      fitted.current = true
    }
  }, [ready, data])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    Object.entries(LAYER_GROUPS).forEach(([group, ids]) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', layers[group] ? 'visible' : 'none')))
  }, [ready, layers])

  // Əlaqə xətləri peyk üzərində açıq, küçə xəritəsində tünd rəngdə — hər iki fonda oxunaqlı
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('hub-links-backbone')) return
    const satellite = basemap === 'satellite'
    map.setPaintProperty('hub-links-backbone', 'line-color', satellite ? '#ffffff' : '#0f172a')
    map.setPaintProperty('hub-links-spoke', 'line-color', satellite ? '#bae6fd' : '#0284c7')
  }, [ready, basemap])

  // Default (əvvəlki) vəziyyətdə yeni qoşulan məntəqələr hələ əlaqəsizdir; yeni ssenari aktiv olanda yaşıl görünür
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('stations')) return
    map.setPaintProperty('stations', 'circle-color', ['match', ['get', 'status'], 'connected', C.connected, 'newly_connected', scenarioActive ? C.newly : C.disconnected, C.disconnected])
  }, [ready, scenarioActive])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('sel-stations')) return
    if (selectedRef.current) map.setFeatureState({ source: 'hubs', id: selectedRef.current }, { selected: false })
    selectedRef.current = null
    const ids = (list) => ['literal', list?.length ? list : ['__none__']]
    map.setFilter('sel-radius-fill', ['in', ['get', 'id'], ids(selectedHubId ? [selectedHubId] : [])])
    map.setFilter('sel-radius-line', ['in', ['get', 'id'], ids(selectedHubId ? [selectedHubId] : [])])
    map.setFilter('sel-stations', ['in', ['get', 'id'], ids(selectedMembers?.stations)])
    map.setFilter('sel-lanes', ['in', ['get', 'id'], ids(selectedMembers?.existing_lanes)])
    map.setFilter('sel-lanes-planned', ['in', ['get', 'id'], ids(selectedMembers?.planned_lanes)])
    map.setFilter('sel-links', ['in', ['get', 'id'], ids(selectedMembers?.links)])
    const feature = data.hubs?.features.find((f) => f.properties.id === selectedHubId)
    if (feature) {
      selectedRef.current = selectedHubId
      map.setFeatureState({ source: 'hubs', id: selectedHubId }, { selected: true })
      map.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 14.5), duration: 700 })
    }
  }, [ready, selectedHubId, selectedMembers, data.hubs])

  return <div className="gis-map">
    <div ref={container} className="gis-map-canvas" />
    {!ready && !mapError && <div className="gis-map-overlay"><div className="loader" /><span>Xəritə yüklənir…</span></div>}
    {mapError && <div className="gis-map-overlay error"><b>Xəritə yüklənmədi</b><span>{mapError}</span></div>}
  </div>
}
