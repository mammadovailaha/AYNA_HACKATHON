import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

// Açar tələb etməyən açıq (light) vektor baza xəritəsi
const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const BAKU_CENTER = [49.85, 40.395]

const MAP_COLORS = { existing: '#1d6fe8', planned: '#12a150', proposed: '#12a150', candidate: '#1d6fe8', existingHub: '#0b3d91' }

const LAYER_GROUPS = {
  existing: ['lanes-existing-casing', 'lanes-existing', 'lanes-existing-qa'],
  planned: ['lanes-planned-glow', 'lanes-planned'],
  hubs: ['hubs-halo', 'hubs-circle', 'hubs-label'],
  heatmap: ['hub-heat']
}

const emptyFc = { type: 'FeatureCollection', features: [] }

function boundsOf(collections) {
  const bounds = new maplibregl.LngLatBounds()
  collections.forEach((fc) => fc.features.forEach((f) => {
    const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates
    coords.forEach((c) => bounds.extend(c))
  }))
  return bounds.isEmpty() ? null : bounds
}

function addLayers(map) {
  map.addSource('lanes-existing', { type: 'geojson', data: emptyFc })
  map.addSource('lanes-planned', { type: 'geojson', data: emptyFc })
  map.addSource('hubs', { type: 'geojson', data: emptyFc, promoteId: 'id' })
  map.addSource('heat', { type: 'geojson', data: emptyFc })

  const firstSymbol = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id

  // Heatmap: radius və intensivlik zoom-a görə dəyişir, yaxın zoom-da tədricən sönür.
  map.addLayer({
    id: 'hub-heat', type: 'heatmap', source: 'heat',
    paint: {
      'heatmap-weight': ['coalesce', ['get', 'weight'], 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 13, 1.4, 16, 2.4],
      'heatmap-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 22, 12, 38, 14, 64, 16, 96],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(29,111,232,0)', 0.15, 'rgba(147,197,253,0.55)', 0.35, 'rgba(56,189,248,0.7)', 0.55, 'rgba(74,222,128,0.8)', 0.75, 'rgba(250,204,21,0.85)', 1, 'rgba(239,68,68,0.9)'],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.85, 16.5, 0.35]
    }
  }, firstSymbol)

  map.addLayer({ id: 'lanes-existing-casing', type: 'line', source: 'lanes-existing', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 8] } })
  map.addLayer({ id: 'lanes-existing', type: 'line', source: 'lanes-existing', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_COLORS.existing, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 15, 4.5], 'line-opacity': 0.9 } })
  // Keyfiyyət qeydi olan seqmentlər (məs. yol boyu izlənməmiş düz xətt) narıncı ştrixlə işarələnir
  map.addLayer({ id: 'lanes-existing-qa', type: 'line', source: 'lanes-existing', filter: ['>', ['coalesce', ['get', 'qa_count'], 0], 0], paint: { 'line-color': '#f59e0b', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 5], 'line-dasharray': [1.5, 1.5] } })
  map.addLayer({ id: 'lanes-planned-glow', type: 'line', source: 'lanes-planned', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_COLORS.planned, 'line-opacity': 0.18, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 15, 16] } })
  map.addLayer({ id: 'lanes-planned', type: 'line', source: 'lanes-planned', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_COLORS.planned, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 5], 'line-dasharray': [2, 1.4] } })

  const statusColor = ['match', ['get', 'status'], 'proposed', MAP_COLORS.proposed, 'existing', MAP_COLORS.existingHub, MAP_COLORS.candidate]
  map.addLayer({ id: 'hubs-halo', type: 'circle', source: 'hubs', paint: { 'circle-color': statusColor, 'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.3, 0.12], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'status'], 'proposed', 14, 9], 15, ['match', ['get', 'status'], 'proposed', 30, 20]] } })
  map.addLayer({ id: 'hubs-circle', type: 'circle', source: 'hubs', paint: {
    'circle-color': statusColor,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'status'], 'proposed', 7, 4.5], 15, ['match', ['get', 'status'], 'proposed', 13, 8]],
    'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0f172a', '#ffffff'],
    'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2]
  } })
  map.addLayer({ id: 'hubs-label', type: 'symbol', source: 'hubs', filter: ['==', ['get', 'status'], 'proposed'], layout: {
    'text-field': ['to-string', ['get', 'rank']], 'text-size': 11, 'text-font': ['Open Sans Bold', 'Noto Sans Bold'], 'text-allow-overlap': true
  }, paint: { 'text-color': '#ffffff' } })
}

export default function GisMap({ existing, planned, hubs, heatmap, layers, selectedHubId, onSelectHub }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const selectedRef = useRef(null)
  const fitted = useRef(false)
  const onSelectRef = useRef(onSelectHub)
  onSelectRef.current = onSelectHub

  useEffect(() => {
    const map = new maplibregl.Map({ container: container.current, style: BASEMAP, center: BAKU_CENTER, zoom: 11.3, attributionControl: { compact: true }, cooperativeGestures: false })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.on('load', () => { addLayers(map); setReady(true) })
    map.on('error', (event) => { if (!map.isStyleLoaded()) setMapError(event.error?.message ?? 'Baza xəritə yüklənmədi') })

    const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'gis-tooltip', offset: 10 })
    const hover = (layer, html) => {
      map.on('mousemove', layer, (event) => { map.getCanvas().style.cursor = 'pointer'; tooltip.setLngLat(event.lngLat).setHTML(html(event.features[0].properties)).addTo(map) })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; tooltip.remove() })
    }
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    hover('lanes-planned', (p) => `<b>${esc(p.id)} · ${esc(p.name)}</b><span>Planlaşdırılır · ${Number(p.length_km).toFixed(2)} km</span>`)
    hover('lanes-existing', (p) => {
      // MapLibre massiv xassələri JSON sətri kimi qaytarır
      const qa = typeof p.qa === 'string' ? JSON.parse(p.qa) : (p.qa ?? [])
      const origin = String(p.also_in_2025) === 'true' ? '2025-dən mövcud' : '2026-da əlavə'
      return `<b>${esc(p.name ?? 'Mövcud velo zolaq')}</b><span>Mövcud · ${Number(p.length_km).toFixed(2)} km · ${origin}</span>${qa.length ? `<span class="qa-note">⚠ ${esc(qa.join('; '))}</span>` : ''}`
    })
    hover('hubs-circle', (p) => `<b>${esc(p.id)} · ${esc(p.name)}</b><span>${p.status === 'proposed' ? `Təklif edilən hub #${p.rank}` : 'Hub namizədi'} · klik edin</span>`)
    map.on('click', 'hubs-circle', (event) => onSelectRef.current?.(event.features[0].properties.id))

    return () => { tooltip.remove(); map.remove(); mapRef.current = null }
  }, [])

  // Data dəyişəndə (real-time yeniləmə daxil) mənbələr yenilənir
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('lanes-existing').setData(existing ?? emptyFc)
    map.getSource('lanes-planned').setData(planned ?? emptyFc)
    map.getSource('hubs').setData(hubs ?? emptyFc)
    map.getSource('heat').setData(heatmap ?? emptyFc)
    if (!fitted.current && existing?.features.length) {
      const bounds = boundsOf([existing, planned ?? emptyFc])
      if (bounds) map.fitBounds(bounds, { padding: 50, duration: 0, maxZoom: 14 })
      fitted.current = true
    }
  }, [ready, existing, planned, hubs, heatmap])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    Object.entries(LAYER_GROUPS).forEach(([group, ids]) => ids.forEach((id) => map.setLayoutProperty(id, 'visibility', layers[group] ? 'visible' : 'none')))
  }, [ready, layers])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (selectedRef.current) map.setFeatureState({ source: 'hubs', id: selectedRef.current }, { selected: false })
    selectedRef.current = null
    const feature = hubs?.features.find((f) => f.properties.id === selectedHubId)
    if (feature) {
      selectedRef.current = selectedHubId
      map.setFeatureState({ source: 'hubs', id: selectedHubId }, { selected: true })
      map.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 14), duration: 700 })
    }
  }, [ready, selectedHubId, hubs])

  return <div className="gis-map">
    <div ref={container} className="gis-map-canvas" />
    {!ready && !mapError && <div className="gis-map-overlay"><div className="loader" /><span>Xəritə yüklənir…</span></div>}
    {mapError && <div className="gis-map-overlay error"><b>Xəritə yüklənmədi</b><span>{mapError}</span></div>}
  </div>
}
