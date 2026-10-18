import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, openDataStream } from '../services/api'

// Bütün dashboard (kartlar, qrafiklər, xəritə, heatmap) bu vahid data mənbəyindən oxuyur.
const LiveDataContext = createContext(null)

async function loadAll() {
  const [dataset, summary, analytics, comparison, existing, planned, hubs, heatHubs, heatStations, network] = await Promise.all([
    api.dataset(), api.summary(), api.analytics(), api.comparison(), api.cyclingExisting(), api.cyclingPlanned(), api.hubs(), api.heatmap('hubs'), api.heatmap('stations'), api.hubNetwork()
  ])
  return {
    version: summary.meta.version,
    dataLoadedAt: summary.meta.data_loaded_at,
    dataset: dataset.data,
    summary: summary.data,
    analytics: analytics.data,
    comparison: comparison.data,
    cycling: { existing: existing.data, planned: planned.data },
    hubs: hubs.data,
    heatmap: { hubs: heatHubs.data, stations: heatStations.data },
    hubNetwork: network.data
  }
}

export function LiveDataProvider({ children }) {
  const [state, setState] = useState({ data: null, loading: true, error: '', refreshing: false })
  const [connection, setConnection] = useState({ status: 'connecting', info: null, lastUpdateAt: null, updates: 0, dataError: null })
  const versionRef = useRef(null)
  const inflight = useRef(null)

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current
    setState((s) => ({ ...s, refreshing: Boolean(s.data) }))
    inflight.current = loadAll().then((data) => {
      versionRef.current = data.version
      setState({ data, loading: false, error: '', refreshing: false })
      return data
    }).catch((error) => {
      setState((s) => ({ ...s, loading: false, refreshing: false, error: error.message }))
    }).finally(() => { inflight.current = null })
    return inflight.current
  }, [])

  useEffect(() => {
    refresh()
    return openDataStream({
      onStatus: (status, info) => {
        setConnection((c) => ({ ...c, status, info }))
        // Bağlantı bərpa olunanda arada dəyişiklik olubsa, yenidən yüklə
        if (status === 'live' && info?.version && versionRef.current && info.version !== versionRef.current) refresh()
      },
      onUpdate: async (payload) => {
        await refresh()
        setConnection((c) => ({ ...c, lastUpdateAt: new Date().toISOString(), updates: c.updates + 1, lastFiles: payload.files, dataError: null }))
      },
      onDataError: (payload) => setConnection((c) => ({ ...c, dataError: payload }))
    })
  }, [refresh])

  return <LiveDataContext.Provider value={{ ...state, connection, refresh }}>{children}</LiveDataContext.Provider>
}

export function useLiveDashboard() {
  const value = useContext(LiveDataContext)
  if (!value) throw new Error('useLiveDashboard LiveDataProvider daxilində istifadə olunmalıdır')
  return value
}
