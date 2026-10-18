import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev rejimində API eyni Vite serverində /api altında işləyir (ayrıca proses lazım deyil).
const axinApi = () => ({
  name: 'axin-api',
  async configureServer(server) {
    const { default: express } = await import('express')
    const { createApiRouter, startDataLayer } = await import('./server/app.js')
    await startDataLayer()
    const app = express()
    app.use('/api', createApiRouter())
    server.middlewares.use(app)
  }
})

export default defineConfig({
  plugins: [react(), axinApi()],
  // Vercel yalnız frontend qovluğunu deploy etdiyi üçün bütün runtime
  // dataları frontend/public/processed daxilində saxlanılır.
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
