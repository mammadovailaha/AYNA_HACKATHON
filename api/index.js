// Vercel serverless entry: vercel.json bütün /api/* sorğularını bura yönləndirir
// (/api/:path* → /api?__path=:path*). Orijinal yol bərpa olunub eyni Express API-yə ötürülür.
// Lokal işləmə üçün vite.config.js (dev) və server/index.js (production) istifadə olunur.
import express from 'express'
import { createApiRouter, startDataLayer } from '../server/app.js'

const app = express()
const ready = startDataLayer()

export function restoreApiPath(rawUrl) {
  const url = new URL(rawUrl, 'http://localhost')
  const forwarded = url.searchParams.get('__path')
  url.searchParams.delete('__path')
  const query = url.searchParams.toString()
  const path = forwarded !== null ? `/api/${forwarded.replace(/^\/+/, '')}` : url.pathname.startsWith('/api') ? url.pathname : `/api${url.pathname}`
  return `${path}${query ? `?${query}` : ''}`
}

app.use(async (req, _res, next) => {
  try {
    await ready
    req.url = restoreApiPath(req.url)
    next()
  } catch (error) {
    next(error)
  }
})
app.use('/api', createApiRouter())

export default app
