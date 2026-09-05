import {expect} from 'chai'

import {createConfigDir, removeConfigDir, runCli, runCliJson, runCliOk} from './helpers.js'

type Row = Record<string, unknown>

describe('e2e: query execution', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('returns rows for a SELECT as JSON', async () => {
    const payload = await runCliJson<{data: {result: Row[]}; success: boolean}>(
      ['psql', 'query', "SELECT id, email, name FROM users WHERE status = 'active' ORDER BY id"],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.result).to.deep.equal([
      {email: 'ada@example.com', id: 1, name: 'Ada Lovelace'},
      {email: 'grace@example.com', id: 2, name: 'Grace Hopper'},
      {email: 'katherine@example.com', id: 4, name: 'Katherine Johnson'},
    ])
  })

  it('joins across tables', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(
      [
        'psql',
        'query',
        'SELECT u.name, COUNT(o.id)::int AS orders FROM users u JOIN orders o ON o.user_id = u.id ' +
          'GROUP BY u.id, u.name ORDER BY orders DESC, u.name LIMIT 2',
      ],
      configDir,
    )

    expect(payload.data.result).to.deep.equal([
      {name: 'Ada Lovelace', orders: 2},
      {name: 'Katherine Johnson', orders: 2},
    ])
  })

  it('returns an empty result set without failing', async () => {
    const payload = await runCliJson<{data: {result: Row[]}; success: boolean}>(
      ['psql', 'query', "SELECT id FROM users WHERE email = 'nobody@example.com'"],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.result).to.deep.equal([])
  })

  it('applies the default LIMIT of 100 to an unbounded SELECT', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(['psql', 'query', 'SELECT id FROM metrics'], configDir)

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('applies the default LIMIT even when a column alias contains "limit"', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['psql', 'query', 'SELECT id AS limit_reached FROM metrics'],
      configDir,
    )

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('applies the default LIMIT when a string literal reads as a LIMIT clause', async () => {
    // The literal is not a clause: without the cap this returns all 150 rows.
    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['psql', 'query', "SELECT id, 'LIMIT 5' AS tag FROM metrics"],
      configDir,
    )

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('applies the default LIMIT when a quoted identifier is named "limit"', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['psql', 'query', 'SELECT id AS "limit" FROM metrics'],
      configDir,
    )

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('applies the default LIMIT to a semicolon-terminated SELECT', async () => {
    // The appended LIMIT has to land in front of the `;`. Behind it,
    // PostgreSQL parses `LIMIT 100` as a second statement and rejects it.
    const payload = await runCliJson<{data: {result: Row[]}}>(['psql', 'query', 'SELECT id FROM metrics;'], configDir)

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('applies the default LIMIT when a comment trails the semicolon', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['psql', 'query', 'SELECT id FROM metrics; -- every row'],
      configDir,
    )

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('applies the default LIMIT when a leading comment precedes the SELECT', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['psql', 'query', '/* report 12 */ SELECT id FROM metrics'],
      configDir,
    )

    expect(payload.data.result).to.have.lengthOf(100)
  })

  it('leaves an explicit LIMIT alone', async () => {
    const payload = await runCliJson<{data: {result: Row[]}}>(
      ['psql', 'query', 'SELECT id FROM metrics LIMIT 120'],
      configDir,
    )

    expect(payload.data.result).to.have.lengthOf(120)
  })

  it('reports analysis warnings and the applied limit', async () => {
    const {stderr, stdout} = await runCliOk(['psql', 'query', 'SELECT * FROM metrics'], configDir)

    // Without --json the notices are part of stdout, alongside the table.
    const combined = stdout + stderr
    expect(combined).to.include('Using SELECT * may impact performance')
    expect(combined).to.include('SELECT query without LIMIT')
    expect(combined).to.include('Applied default LIMIT 100')
    expect(combined).to.include('Rows returned: 100')
  })

  it('keeps notices off stdout for machine formats', async () => {
    const {stderr, stdout} = await runCliOk(['psql', 'query', 'SELECT id FROM metrics', '--toon'], configDir)

    expect(stderr).to.include('Applied default LIMIT 100')
    expect(stdout).to.not.include('Applied default LIMIT 100')
  })

  it('formats results as toon with --toon', async () => {
    const {stdout} = await runCliOk(
      ['psql', 'query', 'SELECT id, name FROM users ORDER BY id LIMIT 2', '--toon'],
      configDir,
    )

    expect(stdout.trim()).to.equal(['[2]{id,name}:', '  1,Ada Lovelace', '  2,Grace Hopper'].join('\n'))
  })

  it('serialises timestamps, NULLs and binary payloads in toon output', async () => {
    const {stdout} = await runCliOk(
      ['psql', 'query', 'SELECT id, note, payload, recorded FROM quirky ORDER BY id', '--toon'],
      configDir,
    )

    expect(stdout).to.include('2024-03-01T09:00:00.000Z')
    // 0x00FF10 base64-encoded.
    expect(stdout).to.include('AP8Q')
  })

  it('renders a box table for human output', async () => {
    const {stdout} = await runCliOk(['psql', 'query', 'SELECT id, name FROM users ORDER BY id LIMIT 1'], configDir)

    expect(stdout).to.include('┌')
    expect(stdout).to.include('│ id')
    expect(stdout).to.include('Ada Lovelace')
    expect(stdout).to.include('└')
  })

  it('surfaces PostgreSQL syntax errors', async () => {
    const {code, stderr} = await runCli(['psql', 'query', 'SELCT 1'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr).to.match(/syntax error/iu)
  })
})
