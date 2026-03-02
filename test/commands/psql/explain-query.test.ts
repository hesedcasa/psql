/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:explain-query', () => {
  let PostgresExplainQuery: any
  let explainQueryStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getPgConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {
    plan: [],
    result: '┌──────┬────────────┐\n│ type │ table      │\n└──────┴────────────┘',
    success: true,
  }

  beforeEach(async () => {
    explainQueryStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getPgConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/psql/explain-query.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        explainQuery: explainQueryStub,
        getPgConfig: getPgConfigStub,
        setConfigDir: setConfigDirStub,
      },
    })
    PostgresExplainQuery = imported.default
  })

  it('explains query using default profile and logs result', async () => {
    const cmd = new PostgresExplainQuery(['SELECT * FROM users WHERE id = 1'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(getPgConfigStub.calledOnce).to.be.true
    expect(explainQueryStub.calledOnce).to.be.true
    expect(explainQueryStub.firstCall.args).to.deep.equal(['local', 'SELECT * FROM users WHERE id = 1', 'table'])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.result)
  })

  it('uses provided flags', async () => {
    const cmd = new PostgresExplainQuery(['SELECT 1', '--profile', 'prod', '--format', 'json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(getPgConfigStub.called).to.be.false
    expect(explainQueryStub.firstCall.args).to.deep.equal(['prod', 'SELECT 1', 'json'])
  })

  it('throws error when explain fails', async () => {
    explainQueryStub.resolves({error: 'ERROR: You have an error in your SQL syntax', success: false})

    const cmd = new PostgresExplainQuery(['INVALID SQL'], {
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
