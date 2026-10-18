import React from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import App from './App'
import { LiveDataProvider } from './hooks/useLiveDashboard'
import './styles.css'
import './theme-light.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LiveDataProvider>
      <App />
    </LiveDataProvider>
  </React.StrictMode>
)
