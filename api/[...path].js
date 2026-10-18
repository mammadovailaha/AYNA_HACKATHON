// Vercel serverless entry: bütün /api/* sorğuları eyni Express API-yə ötürülür.
// Lokal işləmə üçün vite.config.js (dev) və server/index.js (production) istifadə olunur.
import express from 'express'
import { createApiRouter, startDataLayer } from '../server/app.js'

const app = express()
const ready = startDataLayer()

app.use(async (req, _res, next) => {
  try {
    await ready
    // Vercel rewrite/catch-all marşrutlamasından asılı olmayaraq yolu /api ilə saxla
    if (!req.url.startsWith('/api')) req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`
    next()
  } catch (error) {
    next(error)
  }
})
app.use('/api', createApiRouter())

export default app
