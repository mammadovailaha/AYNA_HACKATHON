import { useMemo } from 'react'
import { booleanValue, numberValue } from '../lib/csv'
import { useLiveDashboard } from './useLiveDashboard'

function normalizeConnections(rows) {
  return rows.map(({ cost_azn: _cost, azn_per_benefit: _costPerBenefit, ...row }) => ({
    ...row,
    length_km: numberValue(row.length_km),
    benefit: numberValue(row.benefit),
    newly_connected: numberValue(row.newly_connected),
    selected: booleanValue(row.selected),
    merges_network: booleanValue(row.merges_network),
    links_transit_hub: booleanValue(row.links_transit_hub)
  }))
}

function normalizeHubs(rows) {
  return rows.map(({ cost_azn: _cost, ...row }) => ({
    ...row,
    n_lines: numberValue(row.n_lines),
    parkings: numberValue(row.parkings),
    pop: numberValue(row.pop),
    net_m: numberValue(row.net_m),
    selected: booleanValue(row.selected),
    rank: numberValue(row.rank)
  }))
}

// Mövcud bölmələr üçün cədvəllər — indi /api/dataset-dən gəlir və real-time yenilənir.
export function useDashboardData() {
  const { data: live, loading, error } = useLiveDashboard()
  const data = useMemo(() => {
    if (!live) return null
    const { summary, connections, hubs } = live.dataset
    return { summary, connections: normalizeConnections(connections), hubs: normalizeHubs(hubs) }
  }, [live])
  return { data, loading, error: data ? '' : error }
}
