// npm run gis:recalc → .venv-gis daxilindəki Python ilə yenidən hesablama (Windows və Unix)
// Mühit: python -m venv .venv-gis && .venv-gis/<bin>/python -m pip install -r scripts/gis/requirements.txt
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const python = resolve(root, '.venv-gis', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python)) {
  console.error('.venv-gis tapılmadı. Quraşdırın: python -m venv .venv-gis && .venv-gis python -m pip install -r scripts/gis/requirements.txt')
  process.exit(1)
}
const result = spawnSync(python, ['-I', resolve(root, 'scripts/gis/recalculate_lanes.py')], { stdio: 'inherit' })
process.exit(result.status ?? 1)
