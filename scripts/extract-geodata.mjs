// Mövcud Folium xəritəsindən (public/processed/xerite_after.html) real koordinatları
// çıxarıb server/data qovluğuna GeoJSON kimi yazır. Heç bir koordinat uydurulmur:
// yalnız mənbə xəritədə olan nöqtə və xətlər götürülür.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(resolve(root, 'public/processed/xerite_after.html'), 'utf8')
const outDir = resolve(root, 'server/data')
mkdirSync(outDir, { recursive: true })

// Layer adları -> feature group dəyişənləri
const overlays = {}
const overlayBlock = html.match(/overlays\s*:\s*\{([\s\S]*?)\}/)[1]
for (const m of overlayBlock.matchAll(/"([^"]+)"\s*:\s*(feature_group_\w+)/g)) {
  overlays[JSON.parse(`"${m[1]}"`)] = m[2]
}
const groupOf = (prefix) => Object.entries(overlays).find(([name]) => name.startsWith(prefix))?.[1]

const tooltips = {}
for (const m of html.matchAll(/(\w+)\.bindTooltip\(\s*`<div>\s*([\s\S]*?)\s*<\/div>`/g)) tooltips[m[1]] = m[2].trim()
const popups = {}
for (const m of html.matchAll(/(\w+)\.bindPopup\((popup_\w+)\)/g)) popups[m[1]] = m[2]
const popupHtml = {}
for (const m of html.matchAll(/(popup_\w+)\.setContent\((html_\w+)\)/g)) {
  const content = html.match(new RegExp(`var ${m[2]} = \\$\\(\`([\\s\\S]*?)\`\\)`))?.[1]
  popupHtml[m[1]] = content
}

const items = []
for (const m of html.matchAll(/var (\w+) = L\.(polyline|circleMarker)\(\s*(\[[\s\S]*?\]),\s*(\{[^}]*\})\s*\)\.addTo\((feature_group_\w+)\)/g)) {
  items.push({ id: m[1], type: m[2], coords: JSON.parse(m[3]), options: JSON.parse(m[4]), group: m[5] })
}

const toLngLat = ([lat, lng]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]
const haversineKm = (a, b) => {
  const R = 6371.0088
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const lineKm = (coords) => coords.slice(1).reduce((sum, point, i) => sum + haversineKm(coords[i], point), 0)
const stripTags = (value) => value?.replace(/<br\s*\/?>/g, ' · ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const fc = (features, meta) => ({ type: 'FeatureCollection', meta, features })
const write = (name, data) => writeFileSync(resolve(outDir, name), `${JSON.stringify(data, null, 1)}\n`)

// 1. Mövcud velo zolaqları
const existing = items.filter((i) => i.group === groupOf('Mövcud velo')).map((item, index) => ({
  type: 'Feature',
  properties: { id: `E${String(index + 1).padStart(3, '0')}`, status: 'existing', length_km: Number(lineKm(item.coords).toFixed(3)) },
  geometry: { type: 'LineString', coordinates: item.coords.map(toLngLat) }
}))

// 2. Planlaşdırılan dəhliz/küçələr (K1..K4, S1..S5)
const planned = items.filter((i) => i.group === groupOf('Yeni bağlantılar')).map((item) => {
  const label = tooltips[item.id] ?? ''
  const [id, name, length] = label.split(' · ')
  return {
    type: 'Feature',
    properties: { id, name, status: 'planned', declared_length_km: Number.parseFloat(length), geometry_length_km: Number(lineKm(item.coords).toFixed(3)) },
    geometry: { type: 'LineString', coordinates: item.coords.map(toLngLat) }
  }
})

// 3. Mikromobillik məntəqələri (velo parkinqlər)
const stationGroups = [
  ['Şəbəkəyə bağlı', 'connected'],
  ['Yeni qoşulan', 'newly_connected'],
  ['Hələ əlaqəsiz', 'disconnected']
]
const stations = stationGroups.flatMap(([prefix, status]) => items
  .filter((i) => i.type === 'circleMarker' && i.group === groupOf(prefix))
  .map((item) => ({ type: 'Feature', properties: { status }, geometry: { type: 'Point', coordinates: toLngLat(item.coords) } })))
stations.forEach((feature, index) => { feature.properties.id = `M${String(index + 1).padStart(4, '0')}` })

// 4. Optimal hablar — koordinat və ad mənbə xəritənin popup-ından
const hubPoints = items.filter((i) => i.type === 'circleMarker' && i.group === groupOf('Optimal hablar')).map((item) => {
  const title = tooltips[item.id] ?? ''
  const match = title.match(/Hab (\d+):\s*(.+)/)
  return { rank: Number(match?.[1]), name: match?.[2]?.trim(), lat: item.coords[0], lng: item.coords[1], popup: stripTags(popupHtml[popups[item.id]]) }
})

write('lanes-existing.geojson', fc(existing, { source: 'public/processed/xerite_after.html · "Mövcud velo zolaqları"' }))
write('lanes-planned.geojson', fc(planned, { source: 'public/processed/xerite_after.html · "Yeni bağlantılar (optimal ssenari)"' }))
write('stations.geojson', fc(stations, { source: 'public/processed/xerite_after.html · məntəqə qatları' }))
write('hub-coordinates.json', { source: 'public/processed/xerite_after.html · "Optimal hablar"', hubs: hubPoints })

const sum = (list, key) => list.reduce((acc, f) => acc + f.properties[key], 0)
console.log(JSON.stringify({
  existing_segments: existing.length,
  existing_geometry_km: Number(sum(existing, 'length_km').toFixed(2)),
  planned_segments: planned.length,
  planned_declared_km: Number(sum(planned, 'declared_length_km').toFixed(2)),
  planned_geometry_km: Number(sum(planned, 'geometry_length_km').toFixed(2)),
  stations: Object.fromEntries(stationGroups.map(([, s]) => [s, stations.filter((f) => f.properties.status === s).length])),
  hubs: hubPoints.map((h) => `${h.rank}:${h.name}`)
}, null, 1))
