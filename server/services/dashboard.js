// Biznes məntiqi: data store snapshot-ından API cavablarını hesablayır.
// Nəticələr snapshot versiyasına görə keşlənir; fayl dəyişən kimi yenidən hesablanır.
import { circleRing, geodesicLineKm, haversineM, pointToLineM, round } from '../lib/geo.js'
import { booleanValue, numberValue } from '../../src/lib/csv.js'

const STATION_RADIUS_M = 300
const COORDS_IN_NAME = /(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/

let cache = { version: null, model: null }

export function getModel(snapshot) {
  if (cache.version !== snapshot.version) cache = { version: snapshot.version, model: buildModel(snapshot.data) }
  return cache.model
}

// Mövcud uzunluq: bəyan edilmiş (infrastructure.json) və ya xəritə geometriyasından ölçülmüş.
// Hansının əsas götürüldüyünü infrastructure.json → baseline_source təyin edir; cəm və faiz hər dəfə hesablanır.
export function computeInfrastructure(infra, measured = {}) {
  const declared = infra.existing_km
  const baselineSource = infra.baseline_source === 'measured' && measured.existing_km ? 'measured' : 'declared'
  const existing = baselineSource === 'measured' ? measured.existing_km : declared
  const addition = infra.planned_addition_km
  const tolerance = infra.verification_tolerance_km ?? 0.1
  const check = (declaredKm, measuredKm) => measuredKm === undefined ? null : {
    declared_km: declaredKm,
    measured_km: measuredKm,
    difference_km: round(declaredKm - measuredKm, 2),
    difference_pct: round(((declaredKm - measuredKm) / measuredKm) * 100, 2),
    status: Math.abs(declaredKm - measuredKm) <= tolerance ? 'verified' : 'not_verified'
  }
  return {
    existing_km: existing,
    planned_addition_km: addition,
    projected_total_km: round(existing + addition, 2),
    growth_pct: round((addition / existing) * 100, 2),
    baseline_source: baselineSource,
    declared_existing_km: declared,
    measured_existing_km: measured.existing_km ?? null,
    existing_status: infra.existing_status ?? 'built',
    planned_status: infra.planned_status ?? 'planned',
    verification: {
      tolerance_km: tolerance,
      existing: check(declared, measured.existing_km),
      planned: check(addition, measured.planned_km),
      method: 'WGS84 ellipsoidal uzunluq, server tərəfində geometriyadan dinamik hesablanır',
      report: measured.report ?? null
    },
    formula: {
      projected_total: 'existing_km + planned_addition_km',
      growth_pct: 'planned_addition_km / existing_km × 100'
    },
    sources: { existing: infra.existing_source ?? null, planned: infra.planned_source ?? null },
    updated_at: infra.updated_at ?? null
  }
}

function buildModel(data) {
  const existingLanes = data.lanesExisting.features
    .filter((f) => f.geometry?.coordinates?.length >= 2)
    .map((f) => ({ ...f, properties: { ...f.properties, qa_count: f.properties.qa?.length ?? 0 } }))
  const plannedLanes = data.lanesPlanned.features
  const stations = data.stations.features
  const connections = new Map(data.connections.map((row) => [row.id, row]))

  const existingGeometryKm = round(existingLanes.reduce((sum, f) => sum + geodesicLineKm(f.geometry.coordinates), 0), 2)
  const plannedGeometryKm = round(plannedLanes.reduce((sum, f) => sum + geodesicLineKm(f.geometry.coordinates), 0), 2)
  const report = data.laneReport
  const infrastructure = computeInfrastructure(data.infrastructure, {
    existing_km: existingGeometryKm,
    planned_km: plannedGeometryKm,
    report: report ? {
      path: 'server/data/lane-recalculation.json',
      python_measured_km: report.verification?.measured_km ?? null,
      previous_pipeline_km: report.verification?.previous_pipeline_km ?? null,
      previous_pipeline_overcount_km: report.verification?.previous_pipeline_overcount_km ?? null,
      internal_double_drawn_km: report.verification?.internal_double_drawn_km ?? null,
      scenarios_km: report.scenarios_km,
      counts: report.counts,
      qa_by_line: report.qa_by_line
    } : null
  })

  const plannedFeatures = plannedLanes.map((feature) => {
    const row = connections.get(feature.properties.id) ?? {}
    return {
      ...feature,
      properties: {
        ...feature.properties,
        status: 'planned',
        is_built: false,
        kind: row.kind ?? null,
        streets: row.streets ?? null,
        length_km: numberValue(row.length_km) || feature.properties.declared_length_km,
        painted_km: numberValue(row.painted_km),
        protected_km: numberValue(row.protected_km),
        newly_connected: numberValue(row.newly_connected),
        cost_azn: numberValue(row.cost_azn),
        reason: row.reason ?? null
      }
    }
  })

  const hubCoordinates = new Map((data.hubCoordinates.hubs ?? []).map((hub) => [hub.name, hub]))
  // Əsas mənbə: layihənin GIS emalından hubs.geojson (i indeksi + ad uyğunluğu ilə)
  const hubGeo = new Map(data.hubGeo.features.map((f) => [`${f.properties.i}|${f.properties.name}`, f.geometry.coordinates]))
  const maxLines = Math.max(...data.hubs.map((row) => numberValue(row.n_lines)), 1)
  const maxPop = Math.max(...data.hubs.map((row) => numberValue(row.pop)), 1)

  const hubs = data.hubs.map((row) => {
    const selected = booleanValue(row.selected)
    const fromGeo = hubGeo.get(`${numberValue(row.i)}|${row.name}`)
    const fromMap = hubCoordinates.get(row.name)
    const fromName = row.name.match(COORDS_IN_NAME)
    let coordinates = null
    let coordinateSource = null
    if (fromGeo) {
      coordinates = { lat: fromGeo[1], lng: fromGeo[0] }
      coordinateSource = 'hubs.geojson · layihənin GIS emalı (xəritə, OSM metro və dayanacaq koordinatları ilə yoxlanılıb)'
    } else if (fromMap) {
      coordinates = { lat: fromMap.lat, lng: fromMap.lng }
      coordinateSource = 'xerite_after.html · "Optimal hablar" qatı'
    } else if (fromName) {
      coordinates = { lat: Number(fromName[1]), lng: Number(fromName[2]) }
      coordinateSource = 'hubs.csv · dayanacaq adındakı koordinat (4 onluq, ≈10 m)'
    }
    const status = row.status || (selected ? 'proposed' : 'candidate')
    const nLines = numberValue(row.n_lines)
    const pop = numberValue(row.pop)
    const missing = []
    if (!row.address) missing.push('address')
    if (!coordinates) missing.push('coordinates')
    if (!row.metro) missing.push('metro')

    const hub = {
      id: `H${String(numberValue(row.i)).padStart(2, '0')}`,
      name: row.name,
      kind: row.kind,
      status,
      address: row.address || null,
      coordinates,
      coordinate_status: coordinates ? 'verified_source' : 'needs_verification',
      coordinate_source: coordinateSource,
      transit: {
        bus_lines: row.lines ? row.lines.split(/\s+/).filter(Boolean) : [],
        bus_line_count: nLines,
        metro: row.metro ? { name: row.metro, distance_m: numberValue(row.metro_m) } : null
      },
      site: row.site_type ? { type: row.site_type, area_m2: numberValue(row.site_area_m2), distance_m: numberValue(row.site_dist_m) } : null,
      population_500m: pop,
      existing_stations_integrated: numberValue(row.parkings),
      distance_to_network_m: numberValue(row.net_m),
      cost_azn: numberValue(row.cost_azn),
      selection_reason: row.reason || null,
      priority: {
        rank: selected ? numberValue(row.rank) : null,
        index: Math.round(100 * (0.5 * nLines / maxLines + 0.5 * pop / maxPop)),
        index_formula: '100 × (0.5 × avtobus_xətti / max + 0.5 × 500m_sakin / max)'
      },
      nearby_infrastructure: null,
      missing_fields: missing
    }
    if (coordinates) hub.nearby_infrastructure = nearby([coordinates.lng, coordinates.lat], existingLanes, plannedFeatures, stations)
    return hub
  })

  return { data, infrastructure, existingLanes, plannedFeatures, stations, hubs, existingGeometryKm, plannedGeometryKm }
}

function nearby(point, existingLanes, plannedLanes, stations) {
  const nearest = (features) => features.reduce((best, feature) => {
    const distance = pointToLineM(point, feature.geometry.coordinates)
    return distance < best.distance ? { distance, feature } : best
  }, { distance: Infinity, feature: null })
  const lane = nearest(existingLanes)
  const planned = nearest(plannedLanes)
  const close = stations.filter((station) => haversineM(point, station.geometry.coordinates) <= STATION_RADIUS_M)
  return {
    nearest_existing_lane: lane.feature ? { id: lane.feature.properties.id, distance_m: Math.round(lane.distance) } : null,
    nearest_planned_segment: planned.feature ? { id: planned.feature.properties.id, name: planned.feature.properties.name, distance_m: Math.round(planned.distance) } : null,
    stations_within_300m: close.length,
    stations_within_300m_by_status: countBy(close, (f) => f.properties.status)
  }
}

const countBy = (list, key) => list.reduce((acc, item) => {
  const value = key(item)
  acc[value] = (acc[value] ?? 0) + 1
  return acc
}, {})

const hubCounts = (hubs) => ({
  total: hubs.length,
  existing: hubs.filter((h) => h.status === 'existing').length,
  proposed: hubs.filter((h) => h.status === 'proposed').length,
  candidate: hubs.filter((h) => h.status === 'candidate').length,
  with_coordinates: hubs.filter((h) => h.coordinates).length,
  needs_verification: hubs.filter((h) => !h.coordinates).length
})

export function summary(model) {
  const { data, infrastructure, hubs, stations } = model
  const phases = data.summary.phases
  const now = phases['İNDİ']
  const future = phases['GƏLƏCƏK']
  return {
    infrastructure,
    network: {
      coverage_pct: { current: now.coverage_pct, projected: future.coverage_pct },
      coverage_population: { current: now.coverage_pop, projected: future.coverage_pop },
      disconnected_stations: { current: now.disconnected, projected: future.disconnected },
      network_parts: { current: now.network_parts, projected: future.network_parts },
      newly_connected_stations: data.summary.newly_connected
    },
    hubs: hubCounts(hubs),
    stations: { total: stations.length, by_status: countBy(stations, (f) => f.properties.status) },
    finance: {
      capex_azn: data.summary.capex_azn,
      maintenance_azn_year: data.summary.maintenance_azn_year,
      months: data.summary.months
    }
  }
}

export function cyclingExisting(model) {
  const { infrastructure, existingLanes, existingGeometryKm } = model
  return {
    status: 'built',
    length_km: infrastructure.existing_km,
    geometry_length_km: existingGeometryKm,
    segment_count: existingLanes.length,
    baseline_source: infrastructure.baseline_source,
    verification: infrastructure.verification,
    qa_flagged_segments: existingLanes.filter((f) => f.properties.qa?.length).map((f) => ({ id: f.properties.id, name: f.properties.name, qa: f.properties.qa })),
    data_quality: {
      difference_km: round(infrastructure.existing_km - existingGeometryKm, 2),
      note: infrastructure.baseline_source === 'measured'
        ? 'length_km xəritə geometriyasından ölçülür.'
        : 'length_km bəyan edilmiş göstəricidir; geometry_length_km xəritədəki seqmentlərin ölçülmüş uzunluğudur.'
    },
    geojson: { type: 'FeatureCollection', features: existingLanes }
  }
}

export function cyclingPlanned(model) {
  const { infrastructure, plannedFeatures, plannedGeometryKm } = model
  const byKind = countBy(plannedFeatures, (f) => f.properties.kind ?? 'naməlum')
  return {
    status: 'planned',
    is_built: false,
    length_km: infrastructure.planned_addition_km,
    geometry_length_km: plannedGeometryKm,
    segment_count: plannedFeatures.length,
    segments_by_kind: byKind,
    painted_km: round(plannedFeatures.reduce((s, f) => s + f.properties.painted_km, 0), 2),
    protected_km: round(plannedFeatures.reduce((s, f) => s + f.properties.protected_km, 0), 2),
    cost_azn: plannedFeatures.reduce((s, f) => s + f.properties.cost_azn, 0),
    geojson: { type: 'FeatureCollection', features: plannedFeatures }
  }
}

export const cyclingTotal = (model) => model.infrastructure

export function hubList(model, { status, hasCoordinates }) {
  let hubs = model.hubs
  if (status) hubs = hubs.filter((hub) => hub.status === status)
  if (hasCoordinates !== undefined) hubs = hubs.filter((hub) => Boolean(hub.coordinates) === hasCoordinates)
  return {
    counts: hubCounts(model.hubs),
    hubs,
    geojson: {
      type: 'FeatureCollection',
      features: hubs.filter((hub) => hub.coordinates).map((hub) => ({
        type: 'Feature',
        properties: { id: hub.id, name: hub.name, status: hub.status, kind: hub.kind, rank: hub.priority.rank, priority_index: hub.priority.index, bus_line_count: hub.transit.bus_line_count },
        geometry: { type: 'Point', coordinates: [hub.coordinates.lng, hub.coordinates.lat] }
      }))
    }
  }
}

export const hubById = (model, id) => model.hubs.find((hub) => hub.id.toLowerCase() === id.toLowerCase()) ?? null

export const HEATMAP_METRICS = {
  hubs: 'Hub sıxlığı · çəki = avtobus xətti sayı / maksimum (yalnız koordinatı olan hablar)',
  stations: 'Mikromobillik məntəqə sıxlığı · hər məntəqə çəkisi 1'
}

export function heatmap(model, metric) {
  let features
  if (metric === 'stations') {
    features = model.stations.map((station) => ({ type: 'Feature', properties: { id: station.properties.id, weight: 1, status: station.properties.status }, geometry: station.geometry }))
  } else {
    const located = model.hubs.filter((hub) => hub.coordinates)
    const max = Math.max(...located.map((hub) => hub.transit.bus_line_count), 1)
    features = located.map((hub) => ({
      type: 'Feature',
      properties: { id: hub.id, weight: round(hub.transit.bus_line_count / max, 3), status: hub.status },
      geometry: { type: 'Point', coordinates: [hub.coordinates.lng, hub.coordinates.lat] }
    }))
  }
  return {
    metric,
    description: HEATMAP_METRICS[metric],
    point_count: features.length,
    excluded_without_coordinates: metric === 'hubs' ? model.hubs.filter((hub) => !hub.coordinates).length : 0,
    geojson: { type: 'FeatureCollection', features }
  }
}

export function analytics(model) {
  const { data, plannedFeatures, hubs, stations } = model
  const phases = data.summary.phases
  const phaseKeys = ['ƏVVƏL', 'İNDİ', 'GƏLƏCƏK']
  const plannedKm = (kind) => round(plannedFeatures.filter((f) => f.properties.kind === kind).reduce((s, f) => s + f.properties.length_km, 0), 2)
  return {
    coverage_trend: phaseKeys.map((key) => ({ phase: key, label: phases[key].label, coverage_pct: phases[key].coverage_pct, coverage_population: phases[key].coverage_pop, disconnected_stations: phases[key].disconnected })),
    planned_by_kind_km: { corridor: plannedKm('dəhliz'), street: plannedKm('küçə') },
    planned_protection_km: {
      painted: round(plannedFeatures.reduce((s, f) => s + f.properties.painted_km, 0), 2),
      protected: round(plannedFeatures.reduce((s, f) => s + f.properties.protected_km, 0), 2)
    },
    stations_by_status: countBy(stations, (f) => f.properties.status),
    hubs_by_kind: countBy(hubs, (h) => h.kind),
    top_hubs_by_priority: hubs.slice().sort((a, b) => b.priority.index - a.priority.index).slice(0, 8)
      .map((h) => ({ id: h.id, name: h.name, status: h.status, priority_index: h.priority.index, has_coordinates: Boolean(h.coordinates) })),
    finance_items: data.finance.map((row) => ({ item: row['maddə'], quantity: numberValue(row.miqdar), unit: row.vahid, total_azn: numberValue(row['cəmi_azn']) }))
  }
}

export function comparison(model) {
  const { infrastructure, data, existingGeometryKm, plannedGeometryKm } = model
  const now = data.summary.phases['İNDİ']
  const future = data.summary.phases['GƏLƏCƏK']
  const delta = (before, after) => ({ before, after, change: round(after - before, 2) })
  return {
    infrastructure: {
      before_km: infrastructure.existing_km,
      addition_km: infrastructure.planned_addition_km,
      projected_total_km: infrastructure.projected_total_km,
      growth_pct: infrastructure.growth_pct,
      note: 'Əlavə hissə planlaşdırılır, hələ tikilməyib.'
    },
    network: {
      coverage_pct: delta(now.coverage_pct, future.coverage_pct),
      coverage_population: delta(now.coverage_pop, future.coverage_pop),
      disconnected_stations: delta(now.disconnected, future.disconnected),
      network_parts: delta(now.network_parts, future.network_parts)
    },
    geometry_check: { existing_geometry_km: existingGeometryKm, planned_geometry_km: plannedGeometryKm }
  }
}

// --- HUB şəbəkəsi: ulduz topologiyası, əhatə radiusları, kəsişmələr və hub-a aid obyektlər ---
// Bütün məsafələr real koordinatlardan hesablanır; parametrlər server/data/hub-network.json-dadır.
const lensArea = (r, d) => 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d)

function lensPolygon(a, b, r) {
  const ringA = circleRing(a, r, 96).slice(0, -1)
  const ringB = circleRing(b, r, 96).slice(0, -1)
  const inside = (p, c) => haversineM(p, c) <= r
  const points = [...ringA.filter((p) => inside(p, b)), ...ringB.filter((p) => inside(p, a))]
  if (points.length < 3) return null
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length
  points.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx))
  return [...points, points[0]]
}

// Prim alqoritmi: mərkəzi hub-lar arasında minimal örtücü ağac
function minimumSpanningTree(nodes) {
  if (nodes.length < 2) return []
  const inTree = new Set([0])
  const edges = []
  while (inTree.size < nodes.length) {
    let best = null
    for (const i of inTree) {
      nodes.forEach((node, j) => {
        if (inTree.has(j)) return
        const distance = haversineM(nodes[i].point, node.point)
        if (!best || distance < best.distance) best = { from: nodes[i], to: node, distance, j }
      })
    }
    inTree.add(best.j)
    edges.push(best)
  }
  return edges
}

export function hubNetwork(model) {
  if (model.network) return model.network
  const config = model.data.hubNetwork
  const r = config.coverage_radius_m
  const located = model.hubs.filter((hub) => hub.coordinates).map((hub) => ({ hub, point: [hub.coordinates.lng, hub.coordinates.lat] }))
  const central = located.filter(({ hub }) => hub.status === (config.central_status ?? 'proposed'))
  const satellites = located.filter(({ hub }) => hub.status !== (config.central_status ?? 'proposed'))

  const link = (type, from, to, distance) => ({
    type: 'Feature',
    properties: { id: `${from.hub.id}-${to.hub.id}`, type, from: from.hub.id, to: to.hub.id, distance_m: Math.round(distance) },
    geometry: { type: 'LineString', coordinates: [from.point, to.point] }
  })
  const links = minimumSpanningTree(central).map((e) => link('backbone', e.from, e.to, e.distance))
  const unlinked = []
  for (const sat of satellites) {
    const nearest = central.reduce((best, c) => {
      const distance = haversineM(sat.point, c.point)
      return distance < best.distance ? { c, distance } : best
    }, { c: null, distance: Infinity })
    if (nearest.c && nearest.distance <= config.link_max_m) links.push(link('spoke', nearest.c, sat, nearest.distance))
    else unlinked.push({ id: sat.hub.id, name: sat.hub.name, nearest_central_m: Math.round(nearest.distance) })
  }

  const overlaps = []
  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const distance = haversineM(located[i].point, located[j].point)
      if (distance >= 2 * r) continue
      const ring = lensPolygon(located[i].point, located[j].point, r)
      if (!ring) continue
      overlaps.push({
        type: 'Feature',
        properties: { id: `${located[i].hub.id}-${located[j].hub.id}`, hubs: [located[i].hub.id, located[j].hub.id], distance_m: Math.round(distance), overlap_area_m2: Math.round(lensArea(r, distance)) },
        geometry: { type: 'Polygon', coordinates: [ring] }
      })
    }
  }

  const lanes = [...model.existingLanes.map((f) => ({ f, kind: 'existing' })), ...model.plannedFeatures.map((f) => ({ f, kind: 'planned' }))]
  const members = {}
  const circles = located.map(({ hub, point }) => {
    const stations = model.stations.filter((s) => haversineM(point, s.geometry.coordinates) <= r).map((s) => s.properties.id)
    const laneIds = lanes.filter(({ f }) => pointToLineM(point, f.geometry.coordinates) <= r)
    const hubLinks = links.filter((l) => l.properties.from === hub.id || l.properties.to === hub.id).map((l) => l.properties.id)
    members[hub.id] = {
      stations,
      existing_lanes: laneIds.filter((l) => l.kind === 'existing').map((l) => l.f.properties.id),
      planned_lanes: laneIds.filter((l) => l.kind === 'planned').map((l) => l.f.properties.id),
      links: hubLinks,
      overlaps_with: overlaps.filter((o) => o.properties.hubs.includes(hub.id)).map((o) => o.properties.hubs.find((id) => id !== hub.id))
    }
    return {
      type: 'Feature',
      properties: { id: hub.id, name: hub.name, status: hub.status, role: hub.status === (config.central_status ?? 'proposed') ? 'central' : 'satellite', radius_m: r, stations: stations.length },
      geometry: { type: 'Polygon', coordinates: [circleRing(point, r)] }
    }
  })

  model.network = {
    config,
    counts: {
      hubs: located.length,
      central: central.length,
      satellites_linked: links.filter((l) => l.properties.type === 'spoke').length,
      satellites_unlinked: unlinked.length,
      backbone_links: links.filter((l) => l.properties.type === 'backbone').length,
      overlaps: overlaps.length,
      stations_covered: new Set(Object.values(members).flatMap((m) => m.stations)).size,
      stations_total: model.stations.length
    },
    unlinked,
    members,
    links: { type: 'FeatureCollection', features: links },
    circles: { type: 'FeatureCollection', features: circles },
    overlaps: { type: 'FeatureCollection', features: overlaps }
  }
  return model.network
}
