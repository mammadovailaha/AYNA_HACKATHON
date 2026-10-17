import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL('../data', import.meta.url)),
  server: {
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))]
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
