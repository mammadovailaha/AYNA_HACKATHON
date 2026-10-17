export function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '').trim()
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    const next = clean[i + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(value)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }

  const headers = rows.shift()?.map((header) => header.trim()) ?? []
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ''])))
}

export const numberValue = (value) => {
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export const booleanValue = (value) => ['true', '1', 'yes', 'bəli'].includes(String(value).toLowerCase())
