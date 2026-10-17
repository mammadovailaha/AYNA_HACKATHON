import { useEffect, useState } from 'react'
import { booleanValue, numberValue, parseCsv } from '../lib/csv'

const DATA_ROOT = '/processed'

async function readJson(path) {
  const response = await fetch(`${DATA_ROOT}/${path}`)
  if (!response.ok) throw new Error(`${path} yüklənmədi`)
  return response.json()
}

async function readCsv(path) {
  const response = await fetch(`${DATA_ROOT}/${path}`)
  if (!response.ok) throw new Error(`${path} yüklənmədi`)
  return parseCsv(await response.text())
}

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

export function useDashboardData() {
  const [state, setState] = useState({ data: null, loading: true, error: '' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      readJson('summary.json'),
      readCsv('connections.csv'),
      readCsv('hubs.csv'),
      readCsv('finance.csv')
    ]).then(([summary, connections, hubs, finance]) => {
      if (!cancelled) setState({
        data: { summary, connections: normalizeConnections(connections), hubs: normalizeHubs(hubs), finance: normalizeFinance(finance) },
        loading: false,
        error: ''
      })
    }).catch((error) => {
      if (!cancelled) setState({ data: null, loading: false, error: error.message })
    })
    return () => { cancelled = true }
  }, [])

  return state
}
