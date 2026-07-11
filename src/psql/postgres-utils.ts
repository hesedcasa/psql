import pg from 'pg'

import type {PgConfig} from './config-loader.js'
import type {
  ConnectionTestResult,
  DatabaseListResult,
  DatabaseUtil,
  ExplainResult,
  IndexResult,
  OutputFormat,
  QueryResult,
  TableListResult,
  TableStructureResult,
} from './database.js'
import type {PgField, PgRow} from './formatters.js'

import {getPgConnectionOptions} from './config-loader.js'
import {FORMATTERS} from './formatters.js'
import {analyzeQuery, applyDefaultLimit, checkBlacklist, getQueryType, requiresConfirmation} from './query-validator.js'

const DEFAULT_MAX_CONCURRENT_QUERIES = 5
const DEFAULT_QUEUE_TIMEOUT_MS = 60_000

interface QueryWaiter {
  grant: () => void
  reject: (error: Error) => void
}

interface QuerySlotState {
  active: number
  waiting: QueryWaiter[]
}

export class PostgreSQLUtil implements DatabaseUtil {
  private config: PgConfig
  private pools: Map<string, pg.Pool>
  private querySlots: Map<string, QuerySlotState>

  constructor(config: PgConfig) {
    this.config = config
    this.pools = new Map()
    this.querySlots = new Map()
  }

  async closeAll(): Promise<void> {
    // Reject queued queries first so nothing waits forever on a closed util.
    for (const slot of this.querySlots.values()) {
      for (const waiter of slot.waiting.splice(0)) {
        waiter.reject(new Error('Connections were closed while the query was waiting for a free slot'))
      }
    }

    this.querySlots.clear()

    const pools = [...this.pools.values()]
    this.pools.clear()
    await Promise.allSettled(pools.map((pool) => pool.end()))
  }

  async describeTable(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<TableStructureResult> {
    try {
      const result = await this.runQuery(
        profileName,
        `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public' ORDER BY ordinal_position`,
      )

      return {
        data: {
          result: this.formatRows(result.rows, result.fields, format),
          structure: result.rows,
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  async executeQuery(
    profileName: string,
    query: string,
    format: OutputFormat = 'table',
    skipConfirmation = false,
  ): Promise<QueryResult> {
    const blacklistCheck = checkBlacklist(query, this.config.safety.blacklistedOperations)
    if (!blacklistCheck.allowed) {
      return {
        error: `${blacklistCheck.reason}\n\nThis operation is blocked by safety rules and cannot be executed.`,
        success: false,
      }
    }

    if (!skipConfirmation) {
      const confirmationCheck = requiresConfirmation(query, this.config.safety.requireConfirmationFor)
      if (confirmationCheck.required) {
        return {
          data: {
            message: `${confirmationCheck.message}\nQuery: ${query}`,
            requiresConfirmation: true,
          },
          success: false,
        }
      }
    }

    // Machine-readable formats must emit only the data payload on stdout, so
    // analysis warnings and status lines are collected as notices instead.
    const machineFormat = format === 'json' || format === 'csv' || format === 'toon'
    const notices: string[] = []

    const warnings = analyzeQuery(query)
    if (warnings.length > 0) {
      notices.push(
        'Query Analysis:\n' +
          warnings.map((w) => `  [${w.level.toUpperCase()}] ${w.message}\n  → ${w.suggestion}`).join('\n'),
      )
    }

    let finalQuery = query
    const queryType = getQueryType(query)
    if (queryType === 'SELECT') {
      finalQuery = applyDefaultLimit(query, this.config.safety.defaultLimit)
      if (finalQuery !== query) {
        notices.push(`Applied default LIMIT ${this.config.safety.defaultLimit}`)
      }
    }

    try {
      const result = await this.runQuery(profileName, finalQuery)

      const isRead = result.rows.length > 0 || result.command === 'SELECT' || result.command === 'EXPLAIN'
      let data = isRead
        ? this.formatReadResult(result.rows, result.fields, format, notices)
        : this.formatWriteResult(result.rowCount ?? 0, notices, format)

      if (format === 'json') {
        data = JSON.parse(data)
      }

      const notice = notices.join('\n\n')
      // For human (table) output everything stays on stdout, exactly as before.
      // For machine formats the data is returned alone and notices go to stderr.
      return {
        data: {
          notices: machineFormat ? notice : undefined,
          result: machineFormat ? data : `${notice}\n\n${data}`,
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  async explainQuery(
    profileName: string,
    query: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<ExplainResult> {
    try {
      const result = await this.runQuery(profileName, `EXPLAIN ${query}`)

      return {
        data: {
          plan: result.rows,
          result: this.formatRows(result.rows, result.fields, format),
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  async listDatabases(profileName: string): Promise<DatabaseListResult> {
    try {
      const result = await this.runQuery(
        profileName,
        'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname',
      )
      const databases = result.rows.map((row) => row.datname as string)
      return {
        data: {
          databases,
          result: `Databases:\n${databases.map((db) => `  • ${db}`).join('\n')}`,
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  async listTables(profileName: string): Promise<TableListResult> {
    try {
      const result = await this.runQuery(
        profileName,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
      const tables = result.rows.map((row) => row.tablename as string)

      return {
        data: {
          result: `Tables in database:\n${tables.map((table) => `  • ${table}`).join('\n')}`,
          tables,
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  async showIndexes(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<IndexResult> {
    try {
      const result = await this.runQuery(
        profileName,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${table}' AND schemaname = 'public'`,
      )

      return {
        data: {
          indexes: result.rows,
          result: this.formatRows(result.rows, result.fields, format),
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  async testConnection(profileName: string): Promise<ConnectionTestResult> {
    try {
      const result = await this.runQuery(
        profileName,
        'SELECT version() as version, current_database() as current_database',
      )

      const info = result.rows[0]
      return {
        data: {
          database: info.current_database as string,
          result: `Connection successful!\n\nProfile: ${profileName}\nPostgreSQL Version: ${info.version}\nCurrent Database: ${info.current_database}`,
          version: info.version as string,
        },
        success: true,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        error: `ERROR: ${errorMessage}`,
        success: false,
      }
    }
  }

  // Grants a query slot for the profile, or waits until one frees up. The
  // returned release callback must be invoked exactly once per acquisition.
  private acquireQuerySlot(profileName: string): Promise<() => void> {
    const limit = this.getQueryLimit(profileName)
    let slot = this.querySlots.get(profileName)
    if (!slot) {
      slot = {active: 0, waiting: []}
      this.querySlots.set(profileName, slot)
    }

    const state = slot
    const release = () => {
      const next = state.waiting.shift()
      if (next) {
        next.grant()
      } else {
        state.active -= 1
      }
    }

    if (state.active < limit) {
      state.active += 1
      return Promise.resolve(release)
    }

    const timeoutMs =
      this.config.profiles[profileName]?.queryQueueTimeoutMs ??
      this.config.safety.queryQueueTimeoutMs ??
      DEFAULT_QUEUE_TIMEOUT_MS
    process.stderr.write(`Waiting for a free query slot (${limit}/${limit} in use for profile "${profileName}")...\n`)

    return new Promise((resolve, reject) => {
      const waiter: QueryWaiter = {
        grant() {
          clearTimeout(timer)
          resolve(release)
        },
        reject(error: Error) {
          clearTimeout(timer)
          reject(error)
        },
      }
      const timer = setTimeout(() => {
        const index = state.waiting.indexOf(waiter)
        if (index !== -1) state.waiting.splice(index, 1)
        reject(
          new Error(
            `Timed out after ${timeoutMs / 1000}s waiting for a free query slot ` +
              `(limit: ${limit} concurrent queries for profile "${profileName}")`,
          ),
        )
      }, timeoutMs)
      // Don't let a pending queue timer keep the CLI process alive.
      timer.unref?.()
      state.waiting.push(waiter)
    })
  }

  private formatReadResult(rows: PgRow[], fields: PgField[], format: OutputFormat, notices: string[]): string {
    const rowCount = Array.isArray(rows) ? rows.length : 0
    notices.push(`Query executed successfully. Rows returned: ${rowCount}`)
    return this.formatRows(rows, fields, format)
  }

  private formatRows(rows: PgRow[], fields: PgField[], format: OutputFormat): string {
    return FORMATTERS[format](rows, fields)
  }

  private formatWriteResult(affectedRows: number, notices: string[], format: OutputFormat): string {
    notices.push('Query executed successfully.')
    if (format === 'json') {
      return JSON.stringify({affectedRows}, null, 2)
    }

    return `Affected rows: ${affectedRows}\n`
  }

  // The pool is sized to the profile's query limit so slot holders each get a
  // real physical connection — a single Client would serialize commands on the
  // wire and make the concurrency limit meaningless.
  private getPool(profileName: string): pg.Pool {
    const existing = this.pools.get(profileName)
    if (existing) return existing

    const pool = new pg.Pool({
      ...getPgConnectionOptions(this.config, profileName),
      max: this.getQueryLimit(profileName),
    })
    this.pools.set(profileName, pool)
    return pool
  }

  private getQueryLimit(profileName: string): number {
    const configuredLimit =
      this.config.profiles[profileName]?.maxConcurrentQueries ??
      this.config.safety.maxConcurrentQueries ??
      DEFAULT_MAX_CONCURRENT_QUERIES
    // A limit below 1 would leave every query waiting forever.
    return Math.max(1, configuredLimit)
  }

  // All queries go through here so concurrent load on the same profile is
  // capped at maxConcurrentQueries; excess queries wait for a free slot.
  private async runQuery(profileName: string, sql: string): Promise<pg.QueryResult> {
    const release = await this.acquireQuerySlot(profileName)
    try {
      return await this.getPool(profileName).query(sql)
    } finally {
      release()
    }
  }
}
