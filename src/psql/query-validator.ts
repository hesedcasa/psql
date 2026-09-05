type BlacklistCheckResult = {
  allowed: boolean
  reason?: string
}

type ConfirmationCheckResult = {
  message?: string
  required: boolean
}

type QueryWarning = {
  level: 'info' | 'warning'
  message: string
  suggestion: string
}

/**
 * Builds a matcher for a configured operation such as `DROP DATABASE`. The
 * keywords are matched as whole words with any run of whitespace between them,
 * so a comment blanked out by stripNoise no longer hides the operation and an
 * identifier like `deleted_items` no longer fakes one.
 *
 * @param operation The configured operation, one or more whitespace-separated keywords.
 * @param anchored True to require the operation at the start of the statement.
 * @returns A case-insensitive matcher for the normalized query.
 */
function operationPattern(operation: string, anchored: boolean): RegExp {
  const body = operation
    .trim()
    .split(/\s+/u)
    .map((word) => word.replaceAll(/[\\^$.|?*+()[\]{}]/gu, String.raw`\$&`))
    .join(String.raw`\s+`)

  return anchored
    ? new RegExp(String.raw`^${body}(?![\w$])`, 'iu')
    : new RegExp(String.raw`(?<![\w$])${body}(?![\w$])`, 'iu')
}

export function checkBlacklist(query: string, blacklistedOperations: string[]): BlacklistCheckResult {
  const stripped = stripNoise(query)

  for (const operation of blacklistedOperations) {
    if (operationPattern(operation, false).test(stripped)) {
      return {
        allowed: false,
        reason: `Operation "${operation}" is blacklisted and not allowed`,
      }
    }
  }

  return {allowed: true}
}

// A statement's leading keyword decides how requiresConfirmation reads it:
// most operations only ever hide behind their own leading word, but EXPLAIN,
// WITH, MERGE and PREPARE can carry a destructive statement past that first
// word, and DO hides its body entirely.
const LEADING_KEYWORD = /^\s*([A-Za-z_]\w*)/u
const UNANCHORED_FALLBACK_KEYWORDS = new Set(['EXPLAIN', 'MERGE', 'PREPARE', 'WITH'])

// CREATE/ALTER FUNCTION and PROCEDURE carry an executable body that stripNoise
// has already masked — a dollar-quoted block, or a plain string literal when
// the routine is written the older way. Nothing can inspect it, and unlike a DO
// block the body does not run until something calls the routine, which may be
// an innocuous-looking SELECT later in the same batch. The definition is
// therefore the only place the gate can catch it.
const ROUTINE_DEFINITION = /^(?:CREATE|ALTER)(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|PROCEDURE)(?![\w$])/iu

/**
 * Locates each statement in a query that stripNoise has already blanked out.
 * Semicolons inside strings, quoted identifiers and dollar-quoted bodies are
 * already masked at that point, so splitting on `;` here really does find
 * statement boundaries. The returned offsets exclude surrounding whitespace and line up
 * with the original query, so a position found here can be applied to it.
 *
 * @param stripped The output of stripNoise.
 * @returns One `{start, end}` pair per non-empty statement, in source order.
 */
function splitStatements(stripped: string): Array<{end: number; start: number}> {
  const statements: Array<{end: number; start: number}> = []
  let from = 0

  for (let i = 0; i <= stripped.length; i += 1) {
    if (i < stripped.length && stripped[i] !== ';') continue

    let start = from
    let end = i
    while (start < end && /\s/u.test(stripped[start])) start += 1
    while (end > start && /\s/u.test(stripped[end - 1])) end -= 1
    if (end > start) statements.push({end, start})
    from = i + 1
  }

  return statements
}

function leadingKeywordOf(statement: string): string | undefined {
  return LEADING_KEYWORD.exec(statement)?.[1]?.toUpperCase()
}

export function requiresConfirmation(query: string, confirmationOperations: string[]): ConfirmationCheckResult {
  // Every statement is judged on its own leading keyword, so a destructive one
  // cannot hide behind a harmless first statement, and a keyword appearing
  // mid-statement (in a column name, say) no longer trips the gate.
  const stripped = stripNoise(query)

  for (const {end, start} of splitStatements(stripped)) {
    const statement = stripped.slice(start, end)
    const leadingKeyword = leadingKeywordOf(statement)

    // A DO block runs arbitrary PL/pgSQL in a dollar-quoted body that
    // stripNoise has already masked to OPAQUE_FILL, so nothing can inspect it
    // for destructive operations. Treat it as unconditionally destructive
    // rather than un-masking the body to work around this.
    if (leadingKeyword === 'DO') {
      return {
        message: 'This query runs a DO block, whose body cannot be inspected for destructive operations',
        required: true,
      }
    }

    if (ROUTINE_DEFINITION.test(statement)) {
      return {
        message: 'This query defines a routine, whose body cannot be inspected for destructive operations',
        required: true,
      }
    }

    for (const operation of confirmationOperations) {
      if (operationPattern(operation, true).test(statement)) {
        return {
          message: `This query contains a destructive operation: ${operation}`,
          required: true,
        }
      }

      // EXPLAIN ANALYZE actually executes the statement it explains, a
      // data-modifying CTE runs its DELETE/UPDATE as part of a leading WITH,
      // a MERGE's destructive action sits behind WHEN [NOT] MATCHED, and
      // PREPARE's destructive statement sits behind its AS. Each hides the
      // destructive keyword past the statement's own leading word, so these
      // shapes alone fall back to an unanchored scan.
      if (
        leadingKeyword &&
        UNANCHORED_FALLBACK_KEYWORDS.has(leadingKeyword) &&
        operationPattern(operation, false).test(statement)
      ) {
        return {
          message: `This query contains a destructive operation: ${operation}`,
          required: true,
        }
      }
    }
  }

  return {required: false}
}

const WHERE_CLAUSE = /(?<![\w$])WHERE(?![\w$])/iu
const LIMIT_CLAUSE = /(?<![\w$])LIMIT(?![\w$])/iu
const SELECT_STAR = /(?<![\w$])SELECT\s+\*/iu

// PostgreSQL block comments nest, unlike most dialects.
function scanBlockComment(query: string, start: number): number {
  let depth = 1
  let j = start + 2
  while (j < query.length && depth > 0) {
    if (query.startsWith('/*', j)) {
      depth += 1
      j += 2
    } else if (query.startsWith('*/', j)) {
      depth -= 1
      j += 2
    } else {
      j += 1
    }
  }

  return j
}

// 'string' escapes a quote by doubling it; E'string' also honours a backslash.
// Extracted to its own function (rather than nested in stripNoise's loop) so
// its break/continue apply to a single, non-nested loop.
function scanSingleQuotedString(query: string, start: number): number {
  const isEscapeString = /[eE]/u.test(query[start - 1] ?? '') && !/[\w$]/u.test(query[start - 2] ?? ' ')
  let j = start + 1
  while (j < query.length) {
    if (isEscapeString && query[j] === '\\') {
      j += 2
      continue
    }

    if (query[j] === "'") {
      if (query[j + 1] === "'") {
        j += 2
        continue
      }

      j += 1
      break
    }

    j += 1
  }

  return j
}

// "quoted identifier" escapes a quote by doubling it. Extracted for the same
// reason as scanSingleQuotedString above.
function scanQuotedIdentifier(query: string, start: number): number {
  let j = start + 1
  while (j < query.length) {
    if (query[j] === '"') {
      if (query[j + 1] === '"') {
        j += 2
        continue
      }

      j += 1
      break
    }

    j += 1
  }

  return j
}

// Comments are real trailing noise: applyDefaultLimit's insertion-point search
// treats blanked-out whitespace as skippable, and a comment genuinely is. A
// string literal, quoted identifier or dollar-quoted body is not — it is live
// query content that just happens to sit at the very end of the statement
// (e.g. `WHERE email = 'x@example.com'`) — so it is blanked with OPAQUE_FILL
// instead, a character that is neither whitespace nor a word character. That
// keeps it invisible to the WHERE/LIMIT/SELECT-star keyword checks (as noise
// should be) while still halting the trailing-whitespace walk, rather than
// being skipped over as if it were part of a trailing comment.
const OPAQUE_FILL = '#'

/**
 * Blanks out everything that is not SQL structure — comments, string literals,
 * quoted identifiers and dollar-quoted bodies — replacing each character with a
 * space (comments) or `#` (opaque content) and preserving newlines. Offsets in
 * the result line up with the original query, so a position found here can be
 * applied to the original text.
 *
 * Matching against the raw query is what made these checks wrong in both
 * directions: `SELECT id AS limit_reached` looked like it carried a LIMIT
 * clause, and a comment wedged between two keywords hid the operation entirely.
 *
 * @param query The raw SQL.
 * @returns The query with every non-structural span blanked out.
 */
function stripNoise(query: string): string {
  const parts: string[] = []
  let plainFrom = 0

  const blank = (from: number, to: number, fill = ' '): void => {
    parts.push(
      query.slice(plainFrom, from),
      query.slice(from, to).replaceAll(/[^\n]/gu, () => fill),
    )
    plainFrom = to
  }

  let i = 0
  while (i < query.length) {
    if (query.startsWith('--', i)) {
      const newline = query.indexOf('\n', i)
      const end = newline === -1 ? query.length : newline
      blank(i, end)
      i = end
      continue
    }

    if (query.startsWith('/*', i)) {
      const end = scanBlockComment(query, i)
      blank(i, end)
      i = end
      continue
    }

    // $$ ... $$ and $tag$ ... $tag$. PostgreSQL allows `$` as a non-initial
    // identifier character (`a$$b` is one identifier), so this only opens a
    // dollar-quote when it isn't preceded by an identifier character —
    // symmetric with the E-string guard above.
    if (query[i] === '$' && !/[\w$]/u.test(query[i - 1] ?? ' ')) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/u.exec(query.slice(i))
      if (tag) {
        const closing = query.indexOf(tag[0], i + tag[0].length)
        const end = closing === -1 ? query.length : closing + tag[0].length
        blank(i, end, OPAQUE_FILL)
        i = end
        continue
      }
    }

    if (query[i] === "'") {
      const end = scanSingleQuotedString(query, i)
      blank(i, end, OPAQUE_FILL)
      i = end
      continue
    }

    if (query[i] === '"') {
      const end = scanQuotedIdentifier(query, i)
      blank(i, end, OPAQUE_FILL)
      i = end
      continue
    }

    i += 1
  }

  parts.push(query.slice(plainFrom))
  return parts.join('')
}

export function getQueryType(query: string): string {
  const firstWord = LEADING_KEYWORD.exec(stripNoise(query))?.[1].toUpperCase() ?? ''

  const knownTypes = new Set([
    'ALTER',
    'CREATE',
    'DELETE',
    'DESCRIBE',
    'DROP',
    'EXPLAIN',
    'INSERT',
    'SELECT',
    'SHOW',
    'TRUNCATE',
    'UPDATE',
  ])

  return knownTypes.has(firstWord) ? firstWord : 'UNKNOWN'
}

export function analyzeQuery(query: string): QueryWarning[] {
  const warnings: QueryWarning[] = []
  const stripped = stripNoise(query)
  const queryType = getQueryType(query)

  // Check for missing WHERE clause in UPDATE/DELETE
  if ((queryType === 'UPDATE' || queryType === 'DELETE') && !WHERE_CLAUSE.test(stripped)) {
    warnings.push({
      level: 'warning',
      message: 'Missing WHERE clause in UPDATE/DELETE query',
      suggestion: 'This will affect all rows in the table. Add a WHERE clause to limit scope.',
    })
  }

  // Check for SELECT * (potential performance issue)
  if (SELECT_STAR.test(stripped)) {
    warnings.push({
      level: 'info',
      message: 'Using SELECT * may impact performance',
      suggestion: 'Consider selecting only the columns you need.',
    })
  }

  // Check for missing LIMIT in SELECT
  if (queryType === 'SELECT' && !LIMIT_CLAUSE.test(stripped)) {
    warnings.push({
      level: 'info',
      message: 'SELECT query without LIMIT',
      suggestion: 'Consider adding a LIMIT clause to prevent large result sets.',
    })
  }

  return warnings
}

export function applyDefaultLimit(query: string, defaultLimit: number): string {
  const stripped = stripNoise(query)

  // Each statement is judged on its own. Reading the whole batch at once got
  // this wrong in both directions: `SELECT 1 LIMIT 1; SELECT * FROM metrics`
  // left the second query unbounded because the first one carried a LIMIT, and
  // `SELECT 1; UPDATE metrics ...` appended `LIMIT 100` after the UPDATE, where
  // PostgreSQL rejects it outright.
  //
  // splitStatements already excludes the trailing semicolon and any whitespace
  // or comment after it, so each `end` is exactly where the clause belongs:
  // behind the semicolon PostgreSQL reads `LIMIT 100` as a statement of its own.
  const insertAt = splitStatements(stripped)
    .filter(({end, start}) => {
      const statement = stripped.slice(start, end)
      return leadingKeywordOf(statement) === 'SELECT' && !LIMIT_CLAUSE.test(statement)
    })
    .map(({end}) => end)

  if (insertAt.length === 0) return query

  let result = ''
  let from = 0
  for (const at of insertAt) {
    result += `${query.slice(from, at)} LIMIT ${defaultLimit}`
    from = at
  }

  return result + query.slice(from)
}
