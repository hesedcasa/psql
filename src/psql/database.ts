/**
 * Database abstraction interface
 * Defines the contract for the PostgreSQL utility implementation
 */
import type {ApiResult} from '@hesed/plugin-lib'

/**
 * Output format type
 */
export type OutputFormat = 'csv' | 'json' | 'table' | 'toon'

/**
 * Query execution payload for SELECT/EXPLAIN/write queries
 */
export type QueryData = {
  message?: string
  // Human-facing chatter (analysis warnings, row counts) kept separate from
  // `result` so machine-readable formats can emit only the data payload.
  notices?: string
  requiresConfirmation?: boolean
  // For machine formats (json), result is the parsed payload (object/array);
  // for human output it is a formatted string. Typed as unknown to cover both.
  result?: unknown
}

/**
 * Database list payload
 */
export type DatabaseListData = {
  databases: string[]
  result?: string
}

/**
 * Table list payload
 */
export type TableListData = {
  result?: string
  tables: string[]
}

/**
 * Table structure payload
 */
export type TableStructureData = {
  result?: string
  structure: Array<Record<string, unknown>>
}

/**
 * Index information payload
 */
export type IndexData = {
  indexes: Array<Record<string, unknown>>
  result?: string
}

/**
 * Query plan payload
 */
export type ExplainData = {
  plan: Array<Record<string, unknown>>
  result?: string
}

/**
 * Connection test payload
 */
type ConnectionTestData = {
  database: string
  result?: string
  version: string
}

export type ConnectionTestResult = ApiResult & {data?: ConnectionTestData}
export type DatabaseListResult = ApiResult & {data?: DatabaseListData}
export type ExplainResult = ApiResult & {data?: ExplainData}
export type IndexResult = ApiResult & {data?: IndexData}
export type QueryResult = ApiResult & {data?: QueryData}
export type TableListResult = ApiResult & {data?: TableListData}
export type TableStructureResult = ApiResult & {data?: TableStructureData}

/**
 * Database utility interface
 */
export type DatabaseUtil = {
  closeAll(): Promise<void>
  describeTable(profileName: string, table: string, format?: OutputFormat): Promise<TableStructureResult>
  executeQuery(
    profileName: string,
    query: string,
    format?: OutputFormat,
    skipConfirmation?: boolean,
  ): Promise<QueryResult>
  explainQuery(profileName: string, query: string, format?: OutputFormat): Promise<ExplainResult>
  listDatabases(profileName: string): Promise<DatabaseListResult>
  listTables(profileName: string): Promise<TableListResult>
  showIndexes(profileName: string, table: string, format?: OutputFormat): Promise<IndexResult>
}
