import { useMemo } from 'react'
import { booleanValue, numberValue } from '../lib/csv'
import { useLiveDashboard } from './useLiveDashboard'

function normalizeConnections(rows) {
  return rows.map((row) => ({
    ...row,
    length_km: numberValue(row.length_km),
    cost_azn: numberValue(row.cost_azn),
    benefit: numberValue(row.benefit),
    azn_per_benefit: numberValue(row.azn_per_benefit),
    newly_connected: numberValue(row.newly_connected),
    selected: booleanValue(row.selected),
    merges_network: booleanValue(row.merges_network),
    links_transit_hub: booleanValue(row.links_transit_hub)
  }))
}

function normalizeHubs(rows) {
  return rows.map((row) => ({
    ...row,
    n_lines: numberValue(row.n_lines),
    parkings: numberValue(row.parkings),
    pop: numberValue(row.pop),
    net_m: numberValue(row.net_m),
    cost_azn: numberValue(row.cost_azn),
    selected: booleanValue(row.selected),
    rank: numberValue(row.rank)
  }))
}

function normalizeFinance(rows) {
  return rows.map((row) => ({
    ...row,
    miqdar: numberValue(row.miqdar),
    vahid_qiymət_azn: numberValue(row.vahid_qiymət_azn),
    cəmi_azn: numberValue(row.cəmi_azn)
  }))
}

// Mövcud bölmələr üçün cədvəllər — indi /api/dataset-dən gəlir və real-time yenilənir.
export function useDashboardData() {
  const { data: live, loading, error } = useLiveDashboard()
  const data = useMemo(() => {
    if (!live) return null
    const { summary, connections, hubs, finance } = live.dataset
    return { summary, connections: normalizeConnections(connections), hubs: normalizeHubs(hubs), finance: normalizeFinance(finance) }
  }, [live])
  return { data, loading, error: data ? '' : error }
}
