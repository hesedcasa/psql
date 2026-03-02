/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:show-indexes', () => {
  let PostgresShowIndexes: any
  let showIndexesStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getPgConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {indexes: [], result: '┌──────────────┐\n│ PRIMARY (id) │\n└──────────────┘', success: true}

  beforeEach(async () => {
    showIndexesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getPgConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/psql/indexes.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        getPgConfig: getPgConfigStub,
        setConfigDir: setConfigDirStub,
        showIndexes: showIndexesStub,
      },
    })
    PostgresShowIndexes = imported.default
  })

  it('shows indexes using default profile and logs result', async () => {
    const cmd = new PostgresShowIndexes(['users'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(getPgConfigStub.calledOnce).to.be.true
    expect(showIndexesStub.calledOnce).to.be.true
    expect(showIndexesStub.firstCall.args).to.deep.equal(['local', 'users', 'table'])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.result)
  })

  it('uses provided flags', async () => {
    const cmd = new PostgresShowIndexes(['orders', '--profile', 'staging', '--format', 'json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(getPgConfigStub.called).to.be.false
    expect(showIndexesStub.firstCall.args).to.deep.equal(['staging', 'orders', 'json'])
  })

  it('throws error when show indexes fails', async () => {
    showIndexesStub.resolves({error: "ERROR: Table 'nope' doesn't exist", success: false})

    const cmd = new PostgresShowIndexes(['nope'], {
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
