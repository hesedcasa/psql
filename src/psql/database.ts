/**
 * Database abstraction interface
 * Defines the contract for the PostgreSQL utility implementation
 */

/**
 * Query execution result for SELECT/EXPLAIN queries
 */
export interface QueryResult {
  error?: string
  message?: string
  requiresConfirmation?: boolean
  result?: string
  success: boolean
}

/**
 * Database list result
 */
export interface DatabaseListResult {
  databases?: string[]
  error?: string
  result?: string
  success: boolean
}

/**
 * Table list result
 */
export interface TableListResult {
  error?: string
  result?: string
  success: boolean
  tables?: string[]
}

/**
 * Table structure result
 */
export interface TableStructureResult {
  error?: string
  result?: string
  structure?: Record<string, unknown>[]
  success: boolean
}

/**
 * Index information result
 */
export interface IndexResult {
  error?: string
  indexes?: Record<string, unknown>[]
  result?: string
  success: boolean
}

/**
 * Query plan result
 */
export interface ExplainResult {
  error?: string
  plan?: Record<string, unknown>[]
  result?: string
  success: boolean
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  database?: string
  error?: string
  result?: string
  success: boolean
  version?: string
}

/**
 * Output format type
 */
export type OutputFormat = 'csv' | 'json' | 'table' | 'toon'

/**
 * Database utility interface
 */
export interface DatabaseUtil {
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
