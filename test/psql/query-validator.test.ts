import {expect} from 'chai'

import {analyzeQuery, applyDefaultLimit, getQueryType} from '../../src/psql/query-validator.js'

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
})
