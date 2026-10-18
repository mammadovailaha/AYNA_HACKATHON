// Ayrıca (production) server: API + build olunmuş frontend (dist).
// İşə salmaq: npm run build && npm start
import express from 'express'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiRouter, startDataLayer } from './app.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT) || 4000

await startDataLayer()
const app = express()
app.use('/api', createApiRouter())
app.use(express.static(resolve(root, 'dist')))
app.get(/.*/, (_req, res) => res.sendFile(resolve(root, 'dist/index.html')))
app.listen(port, () => console.log(`ROUTORA server: http://localhost:${port}`))
