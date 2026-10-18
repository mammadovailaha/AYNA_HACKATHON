// API service layer: bütün backend çağırışları buradan keçir.
const API_ROOT = '/api'
const TIMEOUT_MS = 15000

export class ApiRequestError extends Error {
  constructor(message, { status, code, path } = {}) {
    super(message)
    Object.assign(this, { status, code, path })
  }
}

async function get(path, params) {
  const query = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined))}` : ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${API_ROOT}${path}${query}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    throw new ApiRequestError(error.name === 'AbortError' ? `${path}: sorğunun vaxtı bitdi` : `${path}: serverə qoşulmaq mümkün olmadı`, { path })
  } finally {
    clearTimeout(timer)
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw new ApiRequestError(`${path}: JSON cavab gözlənilirdi (HTTP ${response.status})`, { status: response.status, path })
  }
  if (!response.ok || !body.success) {
    throw new ApiRequestError(body?.error?.message ?? `${path}: HTTP ${response.status}`, { status: response.status, code: body?.error?.code, path })
  }
  return { data: body.data, meta: body.meta }
}

export const api = {
  dataset: () => get('/dataset'),
  summary: () => get('/dashboard/summary'),
  analytics: () => get('/dashboard/analytics'),
  comparison: () => get('/dashboard/comparison'),
  cyclingExisting: () => get('/cycling/existing'),
  cyclingPlanned: () => get('/cycling/planned'),
  cyclingTotal: () => get('/cycling/total'),
  hubs: (params) => get('/hubs', params),
  hub: (id) => get(`/hubs/${encodeURIComponent(id)}`),
  heatmap: (metric) => get('/hubs/heatmap', { metric }),
  hubNetwork: () => get('/hubs/network')
}

// SSE bağlantısı: kəsiləndə eksponensial gecikmə ilə (1s → 30s) yenidən qoşulur.
export function openDataStream({ onStatus, onUpdate, onDataError }) {
  let source = null
  let attempt = 0
  let retryTimer = null
  let closed = false

  // quiet: serverin planlı bağlantı yeniləməsi (serverless limit) — status dəyişmir
  const connect = (quiet = false) => {
    if (!quiet) onStatus(attempt === 0 ? 'connecting' : 'reconnecting', { attempt })
    source = new EventSource(`${API_ROOT}/stream`)
    source.addEventListener('hello', (event) => {
      attempt = 0
      onStatus('live', JSON.parse(event.data))
    })
    source.addEventListener('reconnect', () => {
      source.close()
      if (!closed) connect(true)
    })
    source.addEventListener('data-updated', (event) => onUpdate(JSON.parse(event.data)))
    source.addEventListener('data-error', (event) => onDataError?.(JSON.parse(event.data)))
    source.onerror = () => {
      source.close()
      if (closed) return
      attempt += 1
      const delay = Math.min(30000, 1000 * 2 ** (attempt - 1))
      onStatus('reconnecting', { attempt, retryInMs: delay })
      retryTimer = setTimeout(connect, delay)
    }
  }

  const onOnline = () => { if (source?.readyState === EventSource.CLOSED) { clearTimeout(retryTimer); connect() } }
  window.addEventListener('online', onOnline)
  connect()
  return () => {
    closed = true
    clearTimeout(retryTimer)
    window.removeEventListener('online', onOnline)
    source?.close()
  }
}
