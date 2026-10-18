// Kiçik GIS köməkçiləri. Koordinatlar GeoJSON qaydasındadır: [lng, lat].
const EARTH_RADIUS_M = 6371008.8
const RAD = Math.PI / 180

export function haversineM([lng1, lat1], [lng2, lat2]) {
  const dLat = (lat2 - lat1) * RAD
  const dLng = (lng2 - lng1) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Nöqtədən xəttə ən qısa məsafə (m). Şəhər miqyasında lokal ekvidistant proyeksiya kifayətdir.
export function pointToLineM(point, line) {
  const kx = Math.cos(point[1] * RAD) * RAD * EARTH_RADIUS_M
  const ky = RAD * EARTH_RADIUS_M
  const px = point[0] * kx
  const py = point[1] * ky
  let best = Infinity
  for (let i = 1; i < line.length; i += 1) {
    const ax = line[i - 1][0] * kx
    const ay = line[i - 1][1] * ky
    const dx = line[i][0] * kx - ax
    const dy = line[i][1] * ky - ay
    const lengthSq = dx * dx + dy * dy
    const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
  }
  return best
}

export const lineLengthKm = (line) => line.slice(1).reduce((sum, point, i) => sum + haversineM(line[i], point), 0) / 1000

// WGS84 ellipsoidi üzrə uzunluq: hər qısa seqment üçün meridian (M) və birinci şaquli (N) radiusları.
// Şəhər seqmentlərində (< 2 km) pyproj.Geod ilə fərq millimetrlərlədir — Python yoxlaması ilə eyni nəticə.
const WGS84_A = 6378137
const WGS84_E2 = 6.69437999014e-3
export function geodesicLineKm(line) {
  let total = 0
  for (let i = 1; i < line.length; i += 1) {
    const [lng1, lat1] = line[i - 1]
    const [lng2, lat2] = line[i]
    const phi = ((lat1 + lat2) / 2) * RAD
    const w = 1 - WGS84_E2 * Math.sin(phi) ** 2
    const M = (WGS84_A * (1 - WGS84_E2)) / w ** 1.5
    const N = WGS84_A / Math.sqrt(w)
    total += Math.hypot((lat2 - lat1) * RAD * M, (lng2 - lng1) * RAD * N * Math.cos(phi))
  }
  return total / 1000
}

export const round = (value, digits = 2) => {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}
