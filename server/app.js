// REST API + Server-Sent Events. Həm Vite dev serverinə middleware kimi qoşulur
// (vite.config.js), həm də server/index.js ilə ayrıca işə salınır.
import express from 'express'
import { store } from './store.js'
import * as dashboard from './services/dashboard.js'

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    Object.assign(this, { status, code, details })
  }
}

const meta = (snapshot) => ({ version: snapshot.version, data_loaded_at: snapshot.loadedAt, generated_at: new Date().toISOString() })

// Hər handler snapshot-dan hesablanmış model alır; cavab vahid formatda qaytarılır.
const route = (handler) => (req, res, next) => {
  try {
    const snapshot = store.get()
    const data = handler(dashboard.getModel(snapshot), req)
    res.set('Cache-Control', 'no-store').json({ success: true, data, meta: meta(snapshot) })
  } catch (error) {
    next(error)
  }
}

const oneOf = (value, allowed, name) => {
  if (value === undefined) return undefined
  if (!allowed.includes(value)) throw new ApiError(400, 'VALIDATION_ERROR', `"${name}" parametri bunlardan biri olmalıdır: ${allowed.join(', ')}`, { parameter: name, received: value })
  return value
}

const booleanParam = (value, name) => {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ApiError(400, 'VALIDATION_ERROR', `"${name}" parametri true və ya false olmalıdır`, { parameter: name, received: value })
}

export function createApiRouter() {
  const api = express.Router()

  api.get('/dashboard/summary', route((model) => dashboard.summary(model)))
  api.get('/dashboard/analytics', route((model) => dashboard.analytics(model)))
  api.get('/dashboard/comparison', route((model) => dashboard.comparison(model)))
  api.get('/cycling/existing', route((model) => dashboard.cyclingExisting(model)))
  api.get('/cycling/planned', route((model) => dashboard.cyclingPlanned(model)))
  api.get('/cycling/total', route((model) => dashboard.cyclingTotal(model)))

  api.get('/hubs', route((model, req) => dashboard.hubList(model, {
    status: oneOf(req.query.status, ['existing', 'proposed', 'candidate'], 'status'),
    hasCoordinates: booleanParam(req.query.has_coordinates, 'has_coordinates')
  })))
  // /hubs/heatmap /hubs/:id-dən əvvəl gəlməlidir
  api.get('/hubs/heatmap', route((model, req) => dashboard.heatmap(model, oneOf(req.query.metric, Object.keys(dashboard.HEATMAP_METRICS), 'metric') ?? 'hubs')))
  api.get('/hubs/:id', route((model, req) => {
    if (!/^H\d{1,3}$/i.test(req.params.id)) throw new ApiError(400, 'VALIDATION_ERROR', 'Hub ID formatı "H" + rəqəm olmalıdır (məs. H19)', { parameter: 'id', received: req.params.id })
    const hub = dashboard.hubById(model, req.params.id)
    if (!hub) throw new ApiError(404, 'NOT_FOUND', `${req.params.id} ID-li hub tapılmadı`)
    return hub
  }))

  // Mövcud dashboard bölmələrinin istifadə etdiyi cədvəllər (əvvəllər birbaşa CSV-dən oxunurdu)
  api.get('/dataset', route((model) => ({ summary: model.data.summary, connections: model.data.connections, hubs: model.data.hubs, finance: model.data.finance })))

  api.get('/health',(_req, res) => {
    const snapshot = store.snapshot
    res.status(snapshot ? 200 : 503).json({ success: Boolean(snapshot), data: { status: snapshot ? 'ok' : 'loading', version: snapshot?.version ?? null, last_data_error: store.lastError, sse_clients: clients.size } })
  })

  api.get('/stream', stream)

  api.use((req, _res, next) => next(new ApiError(404, 'NOT_FOUND', `Endpoint tapılmadı: ${req.method} ${req.baseUrl}${req.path}`)))
  api.use((error, _req, res, _next) => {
    const status = error.status ?? 500
    if (status >= 500) console.error('[api]', error)
    res.status(status).json({ success: false, error: { code: error.code ?? 'INTERNAL_ERROR', message: status >= 500 ? 'Serverdə gözlənilməz xəta baş verdi' : error.message, details: error.details ?? null } })
  })
  return api
}

// --- Server-Sent Events: data store dəyişəndə bütün klientlərə bildiriş göndərilir ---
const clients = new Set()

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// Vercel serverless: fayl sistemi yalnız oxunur (data yeni deploy ilə dəyişir) və
// funksiyanın icra müddəti məhduddur — axın vaxtaşırı bağlanır, klient dərhal yenidən qoşulur.
const SERVERLESS = Boolean(process.env.VERCEL)
const SERVERLESS_STREAM_MS = 50000

function stream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write('retry: 3000\n\n')
  send(res, 'hello', { version: store.snapshot?.version ?? null, last_data_error: store.lastError, live_file_updates: !SERVERLESS })
  clients.add(res)
  let timer = null
  if (SERVERLESS) {
    timer = setTimeout(() => {
      send(res, 'reconnect', { reason: 'serverless-timeout' })
      res.end()
    }, SERVERLESS_STREAM_MS)
  }
  req.on('close', () => {
    clearTimeout(timer)
    clients.delete(res)
  })
}

let started = null
export function startDataLayer() {
  started ??= initDataLayer().catch((error) => {
    started = null
    throw error
  })
  return started
}

async function initDataLayer() {
  await store.load()
  if (!SERVERLESS) store.watch()
  store.on('change', (payload) => {
    console.log(`[data] yeniləndi → ${payload.version} (${payload.files.join(', ')})`)
    clients.forEach((res) => send(res, 'data-updated', payload))
  })
  store.on('data-error', (payload) => {
    console.warn(`[data] xəta: ${payload.message}`)
    clients.forEach((res) => send(res, 'data-error', payload))
  })
  setInterval(() => clients.forEach((res) => res.write(`: ping ${Date.now()}\n\n`)), 25000).unref()
}
