import {expect} from 'chai'

import {createConfigDir, removeConfigDir, runCli, runCliJson, runCliOk} from './helpers.js'

type Column = {
  character_maximum_length: null | number
  column_default: null | string
  column_name: string
  data_type: string
  is_nullable: string
}
type Index = {indexdef: string; indexname: string}
type PlanRow = {'QUERY PLAN': string}

describe('e2e: schema inspection', () => {
  let configDir: string

  before(async () => {
    configDir = await createConfigDir()
  })

  after(async () => {
    await removeConfigDir(configDir)
  })

  it('lists the seeded tables', async () => {
    const payload = await runCliJson<{data: {tables: string[]}}>(['psql', 'tables'], configDir)

    // The safety spec runs before this one alphabetically and drops its own
    // tables in `after`. Filtering keeps this assertion exact without making it
    // hostage to that cleanup having completed.
    const fixtures = payload.data.tables.filter((table) => !table.startsWith('scratch_'))
    expect(fixtures).to.deep.equal(['metrics', 'orders', 'quirky', 'users', 'wide_orders'])
  })

  it('reports an empty database without failing', async () => {
    const payload = await runCliJson<{data: {tables: string[]}; success: boolean}>(
      ['psql', 'tables', '-p', 'empty'],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.tables).to.deep.equal([])
  })

  it('prints the empty-database heading for a human', async () => {
    const {stdout} = await runCliOk(['psql', 'tables', '-p', 'empty'], configDir)

    expect(stdout).to.include('Tables in database:')
    expect(stdout).to.not.include('•')
  })

  it('describes a table down to column types and nullability', async () => {
    const payload = await runCliJson<{data: {structure: Column[]}}>(['psql', 'describe-table', 'orders'], configDir)

    const byName = new Map(payload.data.structure.map((c) => [c.column_name, c]))
    expect(payload.data.structure.map((c) => c.column_name)).to.deep.equal([
      'id',
      'user_id',
      'total',
      'status',
      'created_at',
    ])
    expect(byName.get('total')?.data_type).to.equal('numeric')
    expect(byName.get('status')?.data_type).to.equal('character varying')
    expect(byName.get('status')?.character_maximum_length).to.equal(32)
    expect(byName.get('created_at')?.data_type).to.equal('timestamp with time zone')
    expect(byName.get('user_id')?.is_nullable).to.equal('NO')
  })

  it('reports a user-defined enum column as USER-DEFINED', async () => {
    const payload = await runCliJson<{data: {structure: Column[]}}>(['psql', 'describe-table', 'users'], configDir)

    const status = payload.data.structure.find((c) => c.column_name === 'status')
    expect(status?.data_type).to.equal('USER-DEFINED')
  })

  it('shows every index on a table, including the unique one', async () => {
    const payload = await runCliJson<{data: {indexes: Index[]}}>(['psql', 'indexes', 'users'], configDir)

    const byName = new Map(payload.data.indexes.map((i) => [i.indexname, i]))
    // eslint-disable-next-line unicorn/prefer-iterator-to-array
    expect([...byName.keys()]).to.have.members(['users_pkey', 'uniq_users_email', 'idx_users_status'])
    expect(byName.get('uniq_users_email')?.indexdef).to.include('CREATE UNIQUE INDEX')
    expect(byName.get('idx_users_status')?.indexdef).to.include('CREATE INDEX')
    expect(byName.get('idx_users_status')?.indexdef).to.include('(status)')
  })

  it('explains a query and reports the index it will use', async () => {
    const payload = await runCliJson<{data: {plan: PlanRow[]}}>(
      ['psql', 'explain', 'SELECT * FROM wide_orders WHERE user_id = 3'],
      configDir,
    )

    const plan = payload.data.plan.map((row) => row['QUERY PLAN']).join('\n')
    expect(payload.data.plan.length).to.be.greaterThan(0)
    expect(plan).to.include('idx_wide_orders_user_id')
  })

  it('renders describe-table as a box table for humans', async () => {
    const {stdout} = await runCliOk(['psql', 'describe-table', 'users'], configDir)

    expect(stdout).to.include('┌')
    expect(stdout).to.include('column_name')
    expect(stdout).to.include('email')
    expect(stdout).to.include('└')
  })

  it('renders describe-table as toon with --toon', async () => {
    const {stdout} = await runCliOk(['psql', 'describe-table', 'users', '--toon'], configDir)

    expect(stdout.trim()).to.match(/^\[\d+\]\{/u)
    expect(stdout).to.include('email')
  })

  // Decision B in the spec: unlike MySQL, the catalog query simply matches no
  // rows, so a typo'd table name is a successful empty result rather than an
  // error. Pinned here so a future change to that is a deliberate one.
  it('returns an empty structure for a table that does not exist', async () => {
    const payload = await runCliJson<{data: {structure: Column[]}; success: boolean}>(
      ['psql', 'describe-table', 'no_such_table'],
      configDir,
    )

    expect(payload.success).to.be.true
    expect(payload.data.structure).to.deep.equal([])
  })

  it('returns no indexes for a table that does not exist', async () => {
    const {code, stdout} = await runCli(['psql', 'indexes', 'no_such_table'], configDir)

    expect(code).to.equal(0)
    expect(stdout).to.include('No results')
  })
})
