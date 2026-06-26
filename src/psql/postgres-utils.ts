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

export class PostgreSQLUtil implements DatabaseUtil {
  private config: PgConfig
  private connections: Map<string, Promise<pg.Client>>

  constructor(config: PgConfig) {
    this.config = config
    this.connections = new Map()
  }

  async closeAll(): Promise<void> {
    const entries = [...this.connections.values()]
    this.connections.clear()
    await Promise.allSettled(entries.map(async (clientPromise) => (await clientPromise).end()))
  }

  async describeTable(
    profileName: string,
    table: string,
    format: 'json' | 'table' | 'toon' = 'table',
  ): Promise<TableStructureResult> {
    try {
      const client = await this.getConnection(profileName)
      const result = await client.query(
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
      const client = await this.getConnection(profileName)
      const result = await client.query(finalQuery)

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
      const client = await this.getConnection(profileName)
      const result = await client.query(`EXPLAIN ${query}`)

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
      const client = await this.getConnection(profileName)
      const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname')
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
      const client = await this.getConnection(profileName)
      const result = await client.query(
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
      const client = await this.getConnection(profileName)
      const result = await client.query(
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
      const client = await this.getConnection(profileName)
      const result = await client.query('SELECT version() as version, current_database() as current_database')

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

  private async getConnection(profileName: string): Promise<pg.Client> {
    const existing = this.connections.get(profileName)
    if (existing) {
      try {
        const client = await existing
        await client.query('SELECT 1')
        return client
      } catch {
        this.connections.delete(profileName)
      }
    }

    const clientPromise = (async () => {
      const client = new pg.Client(getPgConnectionOptions(this.config, profileName))
      await client.connect()
      return client
    })()
    this.connections.set(profileName, clientPromise)

    try {
      return await clientPromise
    } catch (error) {
      this.connections.delete(profileName)
      throw error
    }
  }
}
