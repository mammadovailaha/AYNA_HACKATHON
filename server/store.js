// Fayl əsaslı data store. Bütün API cavabları buradakı snapshot-dan hesablanır,
// heç bir rəqəm kodda saxlanmır. Mənbə fayllar dəyişəndə snapshot yenidən yüklənir
// və 'change' hadisəsi yayımlanır (SSE bu hadisəni frontend-ə ötürür).
// Gələcəkdə real verilənlər bazasına keçid üçün yalnız readSources() dəyişməlidir.
import { readFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../src/lib/csv.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serverData = resolve(root, 'server/data')
const processed = resolve(root, 'public/processed')

const SOURCES = {
  infrastructure: { path: resolve(serverData, 'infrastructure.json'), type: 'json' },
  // Yoxlanılmış mövcud şəbəkə: scripts/gis/recalculate_lanes.py xam KMZ-dən yaradır
  lanesExisting: { path: resolve(serverData, 'lanes-existing-verified.geojson'), type: 'json' },
  laneReport: { path: resolve(serverData, 'lane-recalculation.json'), type: 'json' },
  lanesPlanned: { path: resolve(serverData, 'lanes-planned.geojson'), type: 'json' },
  stations: { path: resolve(serverData, 'stations.geojson'), type: 'json' },
  hubCoordinates: { path: resolve(serverData, 'hub-coordinates.json'), type: 'json' },
  hubGeo: { path: resolve(serverData, 'hubs.geojson'), type: 'json' },
  hubNetwork: { path: resolve(serverData, 'hub-network.json'), type: 'json' },
  summary: { path: resolve(processed, 'summary.json'), type: 'json' },
  connections: { path: resolve(processed, 'connections.csv'), type: 'csv' },
  hubs: { path: resolve(processed, 'hubs.csv'), type: 'csv' },
  finance: { path: resolve(processed, 'finance.csv'), type: 'csv' }
}
const WATCHED_FILES = new Set(Object.values(SOURCES).map((source) => basename(source.path)))

export class DataValidationError extends Error {}

function validate(data) {
  const infra = data.infrastructure
  for (const key of ['existing_km', 'planned_addition_km']) {
    if (typeof infra[key] !== 'number' || !Number.isFinite(infra[key]) || infra[key] < 0) {
      throw new DataValidationError(`infrastructure.json: "${key}" mənfi olmayan rəqəm olmalıdır`)
    }
  }
  if (infra.baseline_source !== undefined && !['declared', 'measured'].includes(infra.baseline_source)) {
    throw new DataValidationError('infrastructure.json: "baseline_source" "declared" və ya "measured" olmalıdır')
  }
  for (const key of ['coverage_radius_m', 'link_max_m']) {
    const value = data.hubNetwork?.[key]
    if (typeof value !== 'number' || !(value > 0)) throw new DataValidationError(`hub-network.json: "${key}" müsbət rəqəm olmalıdır`)
  }
  if (infra.existing_km === 0) throw new DataValidationError('infrastructure.json: "existing_km" sıfır ola bilməz (artım faizi hesablanmır)')
  for (const key of ['lanesExisting', 'lanesPlanned', 'stations', 'hubGeo']) {
    if (data[key]?.type !== 'FeatureCollection' || !Array.isArray(data[key].features)) {
      throw new DataValidationError(`${basename(SOURCES[key].path)}: GeoJSON FeatureCollection gözlənilir`)
    }
  }
}

async function readSources() {
  const raw = {}
  const data = {}
  await Promise.all(Object.entries(SOURCES).map(async ([key, source]) => {
    const text = await readFile(source.path, 'utf8')
    raw[key] = text
    try {
      data[key] = source.type === 'csv' ? parseCsv(text) : JSON.parse(text.replace(/^﻿/, ''))
    } catch (error) {
      throw new DataValidationError(`${basename(source.path)} oxuna bilmədi: ${error.message}`)
    }
  }))
  validate(data)
  const hash = createHash('sha1')
  Object.keys(SOURCES).sort().forEach((key) => hash.update(raw[key]))
  return { data, version: hash.digest('hex').slice(0, 12) }
}

class DataStore extends EventEmitter {
  snapshot = null
  lastError = null

  async load() {
    const { data, version } = await readSources()
    const changed = this.snapshot?.version !== version
    if (changed) this.snapshot = { data, version, loadedAt: new Date().toISOString() }
    this.lastError = null
    return changed
  }

  async reload(files) {
    try {
      if (await this.load()) this.emit('change', { version: this.snapshot.version, files, loadedAt: this.snapshot.loadedAt })
    } catch (error) {
      // Səhv yazılmış fayl serveri dayandırmır: köhnə snapshot qalır, xəta isə status-da görünür.
      this.lastError = { message: error.message, at: new Date().toISOString() }
      this.emit('data-error', this.lastError)
    }
  }

  watch() {
    let timer = null
    const pending = new Set()
    const onEvent = (_event, filename) => {
      if (!filename || !WATCHED_FILES.has(basename(filename))) return
      pending.add(basename(filename))
      clearTimeout(timer)
      timer = setTimeout(() => {
        const files = [...pending]
        pending.clear()
        this.reload(files)
      }, 250)
    }
    this.watchers = [serverData, processed].map((dir) => watch(dir, onEvent))
  }

  get() {
    if (!this.snapshot) throw new Error('Data store hələ yüklənməyib')
    return this.snapshot
  }
}

export const store = new DataStore()
