// API yoxlaması: bütün GET endpoint-lər, JSON formatı, hesablamalar, validation,
// koordinatlar və real-time (fayl dəyişikliyi → SSE push → yenilənmiş cavab).
// İstifadə: server işləyərkən  npm run test:api  (BASE_URL=http://127.0.0.1:5173 default)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const infraPath = resolve(root, 'server/data/infrastructure.json')
const hubMap = JSON.parse(readFileSync(resolve(root, 'server/data/hub-coordinates.json'), 'utf8')).hubs

let passed = 0
let failed = 0
const check = (name, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`) } else { failed += 1; console.log(`  ✗ ${name} ${detail}`) }
}
const getJson = async (path) => {
  const res = await fetch(`${BASE}/api${path}`)
  const type = res.headers.get('content-type') ?? ''
  return { status: res.status, type, body: type.includes('application/json') ? await res.json() : null }
}

console.log(`\nAPI: ${BASE}\n\n1. Endpoint-lər və JSON formatı`)
const endpoints = ['/dashboard/summary', '/cycling/existing', '/cycling/planned', '/cycling/total', '/hubs', '/hubs/H19', '/hubs/heatmap', '/dashboard/analytics', '/dashboard/comparison']
for (const path of endpoints) {
  const r = await getJson(path)
  check(`GET ${path} → 200 JSON {success, data, meta}`, r.status === 200 && r.type.includes('json') && r.body?.success === true && r.body.data && r.body.meta?.version, `(status ${r.status})`)
}

console.log('\n2. Hesablamalar')
const total = (await getJson('/cycling/total')).body.data
check('67.8 + 11.4 = 79.2 km', total.existing_km === 67.8 && total.planned_addition_km === 11.4 && total.projected_total_km === 79.2, JSON.stringify(total))
check('Artım 16.81%', total.growth_pct === 16.81, `(${total.growth_pct})`)
const planned = (await getJson('/cycling/planned')).body.data
check('Planlaşdırılan hissə tikilmiş kimi göstərilmir', planned.status === 'planned' && planned.is_built === false && planned.geojson.features.every((f) => f.properties.is_built === false))
const comparison = (await getJson('/dashboard/comparison')).body.data
check('Comparison eyni rəqəmləri qaytarır', comparison.infrastructure.before_km === 67.8 && comparison.infrastructure.projected_total_km === 79.2)

console.log('\n3. Validation və xətalar')
const cases = [['/hubs/abc', 400], ['/hubs/H999', 404], ['/hubs?status=wrong', 400], ['/hubs?has_coordinates=maybe', 400], ['/hubs/heatmap?metric=x', 400], ['/nope', 404]]
for (const [path, expected] of cases) {
  const r = await getJson(path)
  check(`GET ${path} → ${expected} {success:false, error}`, r.status === expected && r.body?.success === false && r.body.error?.code, `(status ${r.status})`)
}

console.log('\n4. Hub koordinatları və heatmap')
const hubs = (await getJson('/hubs')).body.data
for (const source of hubMap) {
  const hub = hubs.hubs.find((h) => h.name === source.name)
  check(`${source.name}: koordinat mənbə xəritə ilə eynidir`, hub?.coordinates?.lat === source.lat && hub?.coordinates?.lng === source.lng && hub.status === 'proposed')
}
const inBaku = hubs.geojson.features.every(({ geometry: { coordinates: [lng, lat] } }) => lat > 40.2 && lat < 40.7 && lng > 49.6 && lng < 50.2)
check(`Bütün ${hubs.geojson.features.length} marker Bakı ərazisindədir`, inBaku)
check('Koordinatsız hablar markersiz və "needs_verification"', hubs.hubs.filter((h) => !h.coordinates).every((h) => h.coordinate_status === 'needs_verification' && h.missing_fields.includes('coordinates')))
const heat = (await getJson('/hubs/heatmap?metric=hubs')).body.data
const located = new Map(hubs.hubs.filter((h) => h.coordinates).map((h) => [h.id, h]))
check('Heatmap nöqtələri yalnız real hub koordinatlarıdır', heat.point_count === located.size && heat.geojson.features.every((f) => {
  const hub = located.get(f.properties.id)
  return hub && hub.coordinates.lng === f.geometry.coordinates[0] && hub.coordinates.lat === f.geometry.coordinates[1]
}))
const stationsHeat = (await getJson('/hubs/heatmap?metric=stations')).body.data
check('Məntəqə heatmap-ı 831 məntəqədən qurulur', stationsHeat.point_count === 831, `(${stationsHeat.point_count})`)

console.log('\n5. Real-time: data faylı dəyişir → SSE push → API yenilənir')
const original = readFileSync(infraPath, 'utf8')
const controller = new AbortController()
try {
  const stream = await fetch(`${BASE}/api/stream`, { signal: controller.signal })
  const reader = stream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const waitFor = async (event, ms = 5000) => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if (buffer.includes(`event: ${event}`)) return true
      const chunk = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ timeout: true }), deadline - Date.now()))])
      if (chunk.timeout || chunk.done) break
      buffer += decoder.decode(chunk.value)
    }
    return buffer.includes(`event: ${event}`)
  }
  check('SSE bağlantısı açılır (hello)', await waitFor('hello'))
  buffer = ''
  writeFileSync(infraPath, original.replace('"planned_addition_km": 11.4', '"planned_addition_km": 12.6'))
  check('Fayl dəyişəndə "data-updated" push gəlir', await waitFor('data-updated'))
  const updated = (await getJson('/cycling/total')).body.data
  check('Yenilənmiş cəm avtomatik hesablanır (67.8 + 12.6 = 80.4, 18.58%)', updated.projected_total_km === 80.4 && updated.growth_pct === 18.58, JSON.stringify(updated))
  buffer = ''
  writeFileSync(infraPath, original.replace('"existing_km": 67.8', '"existing_km": "abc"'))
  check('Səhv data → "data-error" push, köhnə snapshot saxlanır', await waitFor('data-error') && (await getJson('/cycling/total')).body.data.projected_total_km === 80.4)
} finally {
  writeFileSync(infraPath, original)
  await new Promise((r) => setTimeout(r, 800))
  controller.abort()
}
const restored = (await getJson('/cycling/total')).body.data
check('Orijinal data bərpa olundu (79.2 km)', restored.projected_total_km === 79.2)

console.log('\n6. Velo şəbəkəsinin yoxlanılması (xam KMZ → Python → API)')
const report = JSON.parse(readFileSync(resolve(root, 'server/data/lane-recalculation.json'), 'utf8'))
const existing = (await getJson('/cycling/existing')).body.data
const v = existing.verification
check('API geometriyadan dinamik ölçür və Python nəticəsi ilə üst-üstə düşür (±0.01 km)', Math.abs(v.existing.measured_km - report.verification.measured_km) <= 0.01, `(${v.existing.measured_km} vs ${report.verification.measured_km})`)
check('Xəritədəki seqmentlərin cəmi ölçülən uzunluğa bərabərdir', Math.abs(existing.geojson.features.reduce((s, f) => s + f.properties.length_km, 0) - v.existing.measured_km) <= 0.01)
check('Bəyan edilmiş 67.8 km geometriya ilə təsdiqlənmir (status=not_verified)', v.existing.declared_km === 67.8 && v.existing.status === 'not_verified')
check('Heç bir yenidən hesablama ssenarisi 67.8 km-ə ±0.1 km yaxın deyil', Object.values(report.scenarios_km).every((value) => Math.abs(value - 67.8) > 0.1), JSON.stringify(report.scenarios_km))
check('Planlaşdırılan 11.4 km geometriya ilə təsdiqlənir', v.planned.status === 'verified')
check('Hər xəritə seqmentinin küçə adı var və koordinatı Bakıdadır', existing.geojson.features.every((f) => f.properties.name && f.geometry.coordinates.every(([lng, lat]) => lat > 40.2 && lat < 40.7 && lng > 49.6 && lng < 50.2)))
check('Boş/tək nöqtəli placemark xəritəyə düşmür', existing.geojson.features.every((f) => f.geometry.coordinates.length >= 2))
check('QA qeydli seqment (düz xətt) API-də işarələnir', existing.qa_flagged_segments.some((s) => s.qa.some((q) => q.includes('düz xətt'))))

const before = readFileSync(infraPath, 'utf8')
try {
  writeFileSync(infraPath, before.replace('"baseline_source": "declared"', '"baseline_source": "measured"'))
  await new Promise((r) => setTimeout(r, 900))
  const measured = (await getJson('/cycling/total')).body.data
  const m = v.existing.measured_km
  check(`baseline_source=measured → ${m} + 11.4 km dinamik hesablanır`, measured.baseline_source === 'measured' && measured.existing_km === m && measured.projected_total_km === Math.round((m + 11.4) * 100) / 100 && measured.growth_pct === Math.round((11.4 / m) * 10000) / 100, JSON.stringify({ e: measured.existing_km, t: measured.projected_total_km, g: measured.growth_pct }))
} finally {
  writeFileSync(infraPath, before)
  await new Promise((r) => setTimeout(r, 900))
}
check('Bəyan edilmiş baza bərpa olundu', (await getJson('/cycling/total')).body.data.baseline_source === 'declared')

console.log(`\nNəticə: ${passed} keçdi, ${failed} uğursuz\n`)
process.exit(failed ? 1 : 0)
