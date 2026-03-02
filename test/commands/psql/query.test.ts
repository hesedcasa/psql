/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:query', () => {
  let PostgresQuery: any
  let executeQueryStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getPgConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {result: 'Query executed successfully. Rows returned: 2\n\nid | name\n1  | Alice', success: true}

  beforeEach(async () => {
    executeQueryStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getPgConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/psql/query.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        executeQuery: executeQueryStub,
        getPgConfig: getPgConfigStub,
        setConfigDir: setConfigDirStub,
      },
    })
    PostgresQuery = imported.default
  })

  it('executes query with default profile and logs result', async () => {
    const cmd = new PostgresQuery(['SELECT * FROM users'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(getPgConfigStub.calledOnce).to.be.true
    expect(executeQueryStub.calledOnce).to.be.true
    expect(executeQueryStub.firstCall.args).to.deep.equal(['SELECT * FROM users', 'local', 'table', false])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.result)
  })

  it('uses provided --profile and --format flags', async () => {
    const cmd = new PostgresQuery(['SELECT 1', '--profile', 'prod', '--format', 'json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(getPgConfigStub.called).to.be.false
    expect(executeQueryStub.firstCall.args).to.deep.equal(['SELECT 1', 'prod', 'json', false])
    expect(logStub.calledOnce).to.be.true
  })

  it('passes --skip-confirmation flag to executeQuery', async () => {
    const cmd = new PostgresQuery(['DELETE FROM sessions', '--skip-confirmation'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(executeQueryStub.firstCall.args[3]).to.be.true
  })

  it('throws error when query fails', async () => {
    executeQueryStub.resolves({error: 'ERROR: table not found', success: false})

    const cmd = new PostgresQuery(['SELECT * FROM nonexistent'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    try {
      await cmd.run()
      expect.fail('Should have thrown')
    } catch {
      // expected
    }

    expect(closeConnectionsStub.calledOnce).to.be.true
  })
})
