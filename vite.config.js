import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Vercel yalnız frontend qovluğunu deploy etdiyi üçün bütün runtime
  // dataları frontend/public/processed daxilində saxlanılır.
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
