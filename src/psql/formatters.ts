import {encode} from '@toon-format/toon'

import type {OutputFormat} from './database.js'

export type PgRow = Record<string, unknown>
export type PgField = {name: string}

type Formatter = (rows: PgRow[], fields: PgField[]) => string

function formatAsCsv(rows: PgRow[], fields: PgField[]): string {
  if (!rows || rows.length === 0) {
    return ''
  }

  const columnNames = fields.map((f) => f.name)
  let csv = columnNames.join(',') + '\n'

  for (const row of rows) {
    const values = columnNames.map((name) => {
      const value = row[name] ?? ''
      const str = String(value)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replaceAll('"', '""') + '"'
      }

      return str
    })
    csv += values.join(',') + '\n'
  }

  return csv
}

function formatAsJson(rows: PgRow[]): string {
  return JSON.stringify(rows, null, 2)
}

function formatAsTable(rows: PgRow[], fields: PgField[]): string {
  if (!rows || rows.length === 0) {
    return 'No results'
  }

  const columnNames = fields.map((f) => f.name)
  const columnWidths = columnNames.map((name) => {
    const dataWidth = Math.max(...rows.map((row) => String(row[name] ?? '').length))
    return Math.max(name.length, dataWidth, 3)
  })

  let table = '┌' + columnWidths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐\n'
  table += '│ ' + columnNames.map((name, i) => name.padEnd(columnWidths[i])).join(' │ ') + ' │\n'
  table += '├' + columnWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤\n'

  for (const row of rows) {
    table +=
      '│ ' +
      columnNames
        .map((name, i) => {
          const value = row[name] ?? 'NULL'
          return String(value).padEnd(columnWidths[i])
        })
        .join(' │ ') +
      ' │\n'
  }

  table += '└' + columnWidths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘'

  return table
}

function formatAsToon(rows: PgRow[]): string {
  if (!rows || rows.length === 0) {
    return ''
  }

  const serializedRows = rows.map((row) => {
    const serialized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        serialized[key] = Number.isNaN(value.getTime()) ? null : value.toISOString()
      } else if (Buffer.isBuffer(value)) {
        serialized[key] = value.toString('base64')
      } else {
        serialized[key] = value
      }
    }

    return serialized
  })

  return encode(serializedRows)
}

export const FORMATTERS: Record<OutputFormat, Formatter> = {
  csv: formatAsCsv,
  json: formatAsJson,
  table: formatAsTable,
  toon: formatAsToon,
}
