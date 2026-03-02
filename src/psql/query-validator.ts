/**
 * Query Validation and Safety Module
 * Provides SQL query analysis and safety checks
 */

interface BlacklistCheckResult {
  allowed: boolean
  reason?: string
}

interface ConfirmationCheckResult {
  message?: string
  required: boolean
}

interface QueryWarning {
  level: 'info' | 'warning'
  message: string
  suggestion: string
}

/**
 * Check if query contains blacklisted operations
 */
export function checkBlacklist(query: string, blacklistedOperations: string[]): BlacklistCheckResult {
  const normalizedQuery = query.trim().toUpperCase()

  for (const operation of blacklistedOperations) {
    const normalizedOp = operation.toUpperCase()
    if (normalizedQuery.includes(normalizedOp)) {
      return {
        allowed: false,
        reason: `Operation "${operation}" is blacklisted and not allowed`,
      }
    }
  }

  return {allowed: true}
}

/**
 * Check if query requires user confirmation
 */
export function requiresConfirmation(query: string, confirmationOperations: string[]): ConfirmationCheckResult {
  const normalizedQuery = query.trim().toUpperCase()

  for (const operation of confirmationOperations) {
    const normalizedOp = operation.toUpperCase()
    if (normalizedQuery.startsWith(normalizedOp) || normalizedQuery.includes(` ${normalizedOp} `)) {
      return {
        message: `This query contains a destructive operation: ${operation}`,
        required: true,
      }
    }
  }

  return {required: false}
}

/**
 * Get query type (SELECT, INSERT, UPDATE, etc.)
 */
export function getQueryType(query: string): string {
  const normalizedQuery = query.trim().toUpperCase()
  const firstWord = normalizedQuery.split(/\s+/)[0]

  const knownTypes = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'EXPLAIN']

  if (knownTypes.includes(firstWord)) {
    return firstWord
  }

  return 'UNKNOWN'
}

/**
 * Analyze query for potential issues and provide warnings
 */
export function analyzeQuery(query: string): QueryWarning[] {
  const warnings: QueryWarning[] = []
  const normalizedQuery = query.trim().toUpperCase()

  // Check for missing WHERE clause in UPDATE/DELETE
  if (
    (normalizedQuery.startsWith('UPDATE') || normalizedQuery.startsWith('DELETE')) &&
    !normalizedQuery.includes('WHERE')
  ) {
    warnings.push({
      level: 'warning',
      message: 'Missing WHERE clause in UPDATE/DELETE query',
      suggestion: 'This will affect all rows in the table. Add a WHERE clause to limit scope.',
    })
  }

  // Check for SELECT * (potential performance issue)
  if (normalizedQuery.includes('SELECT *')) {
    warnings.push({
      level: 'info',
      message: 'Using SELECT * may impact performance',
      suggestion: 'Consider selecting only the columns you need.',
    })
  }

  // Check for missing LIMIT in SELECT
  if (normalizedQuery.startsWith('SELECT') && !normalizedQuery.includes('LIMIT')) {
    warnings.push({
      level: 'info',
      message: 'SELECT query without LIMIT',
      suggestion: 'Consider adding a LIMIT clause to prevent large result sets.',
    })
  }

  return warnings
}

/**
 * Apply default LIMIT to SELECT queries if not present
 */
export function applyDefaultLimit(query: string, defaultLimit: number): string {
  const normalizedQuery = query.trim().toUpperCase()

  if (normalizedQuery.startsWith('SELECT') && !normalizedQuery.includes('LIMIT')) {
    return `${query.trim()} LIMIT ${defaultLimit}`
  }

  return query
}
