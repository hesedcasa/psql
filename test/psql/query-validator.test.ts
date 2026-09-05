import {expect} from 'chai'

import {
  analyzeQuery,
  applyDefaultLimit,
  checkBlacklist,
  getQueryType,
  requiresConfirmation,
} from '../../src/psql/query-validator.js'

describe('query-validator', () => {
  describe('getQueryType', () => {
    it('reads the leading keyword', () => {
      expect(getQueryType('SELECT 1')).to.equal('SELECT')
      expect(getQueryType('  delete from users  ')).to.equal('DELETE')
    })

    it('sees past a leading block comment', () => {
      expect(getQueryType('/* report 12 */ SELECT 1')).to.equal('SELECT')
    })

    it('sees past a leading line comment', () => {
      expect(getQueryType('-- report 12\nUPDATE users SET name = 1')).to.equal('UPDATE')
    })

    it('returns UNKNOWN for an unrecognised keyword', () => {
      expect(getQueryType('VACUUM users')).to.equal('UNKNOWN')
    })
  })

  describe('applyDefaultLimit', () => {
    it('appends a LIMIT to an unbounded SELECT', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics', 100)).to.equal('SELECT id FROM metrics LIMIT 100')
    })

    it('inserts the LIMIT before a trailing semicolon', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics;', 100)).to.equal('SELECT id FROM metrics LIMIT 100;')
    })

    it('inserts the LIMIT before a semicolon that trails a comment', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics; -- all of them', 100)).to.equal(
        'SELECT id FROM metrics LIMIT 100; -- all of them',
      )
    })

    it('leaves an explicit LIMIT alone', () => {
      expect(applyDefaultLimit('SELECT id FROM metrics LIMIT 5', 100)).to.equal('SELECT id FROM metrics LIMIT 5')
    })

    it('is not fooled by an identifier containing "limit"', () => {
      expect(applyDefaultLimit('SELECT id AS limit_reached FROM metrics', 100)).to.equal(
        'SELECT id AS limit_reached FROM metrics LIMIT 100',
      )
    })

    it('is not fooled by a string literal reading as a LIMIT clause', () => {
      expect(applyDefaultLimit("SELECT id, 'LIMIT 5' AS tag FROM metrics", 100)).to.equal(
        "SELECT id, 'LIMIT 5' AS tag FROM metrics LIMIT 100",
      )
    })

    it('is not fooled by a quoted identifier named "limit"', () => {
      expect(applyDefaultLimit('SELECT id AS "limit" FROM metrics', 100)).to.equal(
        'SELECT id AS "limit" FROM metrics LIMIT 100',
      )
    })

    it('is not fooled by a dollar-quoted body containing LIMIT', () => {
      expect(applyDefaultLimit('SELECT $$ LIMIT 5 $$ AS tag FROM metrics', 100)).to.equal(
        'SELECT $$ LIMIT 5 $$ AS tag FROM metrics LIMIT 100',
      )
    })

    it('does not treat "$$" inside an identifier as a dollar-quote opener', () => {
      // PostgreSQL allows `$` as a non-initial identifier character, so
      // `a$$b` is one identifier, not the start of a dollar-quoted body.
      // Misreading it as an opener would mask everything after it -
      // including a real trailing LIMIT clause - as unclosed dollar-quote
      // content, and applyDefaultLimit would then append a second LIMIT.
      expect(applyDefaultLimit('SELECT id AS a$$b FROM metrics LIMIT 5', 100)).to.equal(
        'SELECT id AS a$$b FROM metrics LIMIT 5',
      )
    })

    it('appends a LIMIT after an identifier containing "$$" when none is present', () => {
      expect(applyDefaultLimit('SELECT id AS a$$b FROM metrics', 100)).to.equal(
        'SELECT id AS a$$b FROM metrics LIMIT 100',
      )
    })

    it('leaves a non-SELECT alone', () => {
      expect(applyDefaultLimit('UPDATE users SET name = 1', 100)).to.equal('UPDATE users SET name = 1')
    })
  })

  describe('analyzeQuery', () => {
    const messages = (query: string) => analyzeQuery(query).map((w) => w.message)

    it('warns about an UPDATE with no WHERE clause', () => {
      expect(messages('UPDATE users SET name = 1')).to.include('Missing WHERE clause in UPDATE/DELETE query')
    })

    it('does not warn when a WHERE clause is present', () => {
      expect(messages('UPDATE users SET name = 1 WHERE id = 2')).to.not.include(
        'Missing WHERE clause in UPDATE/DELETE query',
      )
    })

    it('still warns when the table name contains "where"', () => {
      expect(messages('UPDATE nowhere_stats SET value = 1')).to.include('Missing WHERE clause in UPDATE/DELETE query')
    })

    it('flags SELECT *', () => {
      expect(messages('SELECT * FROM users')).to.include('Using SELECT * may impact performance')
    })

    it('flags a SELECT with no LIMIT', () => {
      expect(messages('SELECT id FROM users')).to.include('SELECT query without LIMIT')
    })

    it('does not flag a SELECT whose alias merely contains "limit"', () => {
      expect(messages('SELECT id AS limit_reached FROM metrics')).to.include('SELECT query without LIMIT')
    })
  })

  describe('checkBlacklist', () => {
    const blacklist = ['DROP DATABASE']

    it('blocks the operation', () => {
      expect(checkBlacklist('DROP DATABASE app', blacklist).allowed).to.be.false
    })

    it('blocks it through extra whitespace', () => {
      expect(checkBlacklist('DROP  DATABASE app', blacklist).allowed).to.be.false
    })

    it('blocks it through a newline', () => {
      expect(checkBlacklist('DROP\n  DATABASE app', blacklist).allowed).to.be.false
    })

    it('blocks it through a comment', () => {
      expect(checkBlacklist('DROP/* sneaky */DATABASE app', blacklist).allowed).to.be.false
    })

    it('blocks it regardless of case', () => {
      expect(checkBlacklist('drop database app', blacklist).allowed).to.be.false
    })

    it('allows an unrelated statement', () => {
      expect(checkBlacklist('SELECT * FROM databases', blacklist).allowed).to.be.true
    })

    it('allows a string literal that merely reads like the operation', () => {
      expect(checkBlacklist("SELECT 'DROP DATABASE' AS note", blacklist).allowed).to.be.true
    })

    it('reports which operation was blocked', () => {
      expect(checkBlacklist('DROP DATABASE app', blacklist).reason).to.equal(
        'Operation "DROP DATABASE" is blacklisted and not allowed',
      )
    })
  })

  describe('requiresConfirmation', () => {
    const destructive = ['DELETE', 'UPDATE', 'DROP', 'TRUNCATE', 'ALTER']

    it('requires confirmation for a leading DELETE', () => {
      expect(requiresConfirmation('DELETE FROM users', destructive).required).to.be.true
    })

    it('requires confirmation past a leading block comment and newline', () => {
      expect(requiresConfirmation('/* migration 12 */\nDELETE FROM users', destructive).required).to.be.true
    })

    it('requires confirmation for a destructive second statement', () => {
      // Already caught today by the legacy substring fallback — kept so the rewrite cannot regress it.
      expect(requiresConfirmation('SELECT 1; DELETE FROM users', destructive).required).to.be.true
    })

    it('requires confirmation for a destructive second statement with no space after the semicolon', () => {
      expect(requiresConfirmation('SELECT 1;DELETE FROM users', destructive).required).to.be.true
    })

    it('requires confirmation for EXPLAIN ANALYZE, which actually executes the statement', () => {
      expect(requiresConfirmation('EXPLAIN ANALYZE DELETE FROM users', destructive).required).to.be.true
    })

    it('requires confirmation for EXPLAIN with options wrapping a destructive statement', () => {
      expect(requiresConfirmation('EXPLAIN (ANALYZE, BUFFERS) UPDATE u SET a = 1', destructive).required).to.be.true
    })

    it('requires confirmation for a destructive statement inside a CTE', () => {
      expect(requiresConfirmation('WITH d AS ( DELETE FROM users RETURNING * ) SELECT 1', destructive).required).to.be
        .true
    })

    it('requires confirmation for a destructive statement inside a CTE with no inner spaces', () => {
      expect(requiresConfirmation('WITH d AS (DELETE FROM users RETURNING *) SELECT 1', destructive).required).to.be
        .true
    })

    it('requires confirmation for a DO block, whose body cannot be inspected', () => {
      expect(requiresConfirmation('DO $$ BEGIN DELETE FROM users; END $$', destructive).required).to.be.true
    })

    it('requires confirmation for a MERGE whose matched action is destructive', () => {
      expect(
        requiresConfirmation(
          'MERGE INTO users u USING s ON s.id = u.id WHEN MATCHED THEN UPDATE SET a = 1',
          destructive,
        ).required,
      ).to.be.true
    })

    it('requires confirmation for a MERGE whose matched action is DELETE', () => {
      expect(
        requiresConfirmation('MERGE INTO users u USING s ON s.id = u.id WHEN MATCHED THEN DELETE', destructive)
          .required,
      ).to.be.true
    })

    it('requires confirmation for a PREPARE wrapping a destructive statement', () => {
      expect(requiresConfirmation('PREPARE p AS DELETE FROM users', destructive).required).to.be.true
    })

    it('does not fire on a MERGE whose matched action is harmless', () => {
      expect(
        requiresConfirmation('MERGE INTO t USING s ON s.id = t.id WHEN NOT MATCHED THEN INSERT VALUES (1)', destructive)
          .required,
      ).to.be.false
    })

    it('does not fire on a PREPARE wrapping a harmless statement', () => {
      expect(requiresConfirmation('PREPARE p AS SELECT * FROM users', destructive).required).to.be.false
    })

    it('does not fire on a harmless EXPLAIN', () => {
      expect(requiresConfirmation('EXPLAIN SELECT * FROM users', destructive).required).to.be.false
    })

    it('does not fire on a harmless CTE', () => {
      expect(requiresConfirmation('WITH u AS (SELECT 1) SELECT * FROM u', destructive).required).to.be.false
    })

    it('does not fire on INSERT ... ON CONFLICT DO UPDATE, which is not a configured operation', () => {
      expect(
        requiresConfirmation('INSERT INTO t (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 2', destructive).required,
      ).to.be.false
    })

    it('does not over-match on an unanchored scan of an unrelated SELECT', () => {
      expect(requiresConfirmation('SELECT * FROM deleted_items', destructive).required).to.be.false
    })

    it('names the operation in the message', () => {
      expect(requiresConfirmation('TRUNCATE users', destructive).message).to.equal(
        'This query contains a destructive operation: TRUNCATE',
      )
    })

    it('does not fire on a plain SELECT', () => {
      expect(requiresConfirmation('SELECT * FROM users', destructive).required).to.be.false
    })

    it('does not fire on a string literal containing a destructive keyword', () => {
      expect(requiresConfirmation("SELECT 'please delete me' AS note", destructive).required).to.be.false
    })

    it('does not fire on an identifier containing a destructive keyword', () => {
      expect(requiresConfirmation('SELECT id FROM deleted_items', destructive).required).to.be.false
    })
  })
})
