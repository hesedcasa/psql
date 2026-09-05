import {expect} from 'chai'

import {createConfigDir, removeConfigDir, runCli, runCliJson, runCliOk} from './helpers.js'

describe('e2e: connection and profiles', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('connects with the default profile', async () => {
    const payload = await runCliJson<{data: {database: string; version: string}; success: boolean}>(
      ['psql', 'auth', 'test'],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.database).to.equal('pg_e2e')
    expect(payload.data.version).to.match(/^PostgreSQL 17\./u)
  })

  it('lists the configured profiles', async () => {
    const payload = await runCliJson<{data: Array<{default?: boolean; name: string}>}>(
      ['psql', 'auth', 'list'],
      configDir,
    )

    const names = payload.data.map((p) => p.name)
    expect(names).to.have.members(['default', 'alt', 'broken', 'empty'])
    expect(payload.data.find((p) => p.default)?.name).to.equal('default')
  })

  it('reports a failed auth test on bad credentials', async () => {
    const {code, stderr} = await runCli(['psql', 'auth', 'test', '-p', 'broken'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr).to.include('Failed to connect to PostgreSQL.')
  })

  it('surfaces the driver error when a query uses bad credentials', async () => {
    const {code, stderr} = await runCli(['psql', 'tables', '-p', 'broken'], configDir)

    expect(code).to.not.equal(0)
    expect(stderr.replaceAll(/\s+/gu, ' ')).to.match(/password authentication failed for user "postgres"/iu)
    // oclif supplies the "Error:" label, so the layer must not add one too.
    expect(stderr).to.not.include('Error: ERROR:')
  })

  it('fails when the config dir holds no profiles', async () => {
    const {code, stderr} = await runCli(['psql', 'tables'], '/nonexistent-pg-config-dir')

    expect(code).to.not.equal(0)
    expect(stderr).to.match(/profile/iu)
  })

  it('lists every database on the server', async () => {
    const payload = await runCliJson<{data: {databases: string[]}}>(['psql', 'databases'], configDir)

    expect(payload.data.databases).to.include.members(['pg_e2e', 'pg_e2e_alt', 'pg_e2e_empty', 'postgres'])
  })

  it('honours --profile when selecting the database', async () => {
    const defaults = await runCliJson<{data: {tables: string[]}}>(['psql', 'tables'], configDir)
    const alt = await runCliJson<{data: {tables: string[]}}>(['psql', 'tables', '-p', 'alt'], configDir)

    expect(defaults.data.tables).to.include('users')
    expect(alt.data.tables).to.deep.equal(['audit_log'])
  })

  it('prints human-readable output without --json', async () => {
    const {stdout} = await runCliOk(['psql', 'databases'], configDir)

    expect(stdout).to.include('Databases:')
    expect(stdout).to.include('• pg_e2e')
  })
})
