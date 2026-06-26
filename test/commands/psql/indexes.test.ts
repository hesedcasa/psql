/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:show-indexes', () => {
  let PostgresShowIndexes: any
  let showIndexesStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {indexes: [], result: '┌──────────────┐\n│ PRIMARY (id) │\n└──────────────┘', success: true}

  beforeEach(async () => {
    showIndexesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/psql/indexes.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
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

    expect(showIndexesStub.calledOnce).to.be.true
    expect(showIndexesStub.firstCall.args.slice(1)).to.deep.equal(['users', undefined, 'table'])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.result)
  })

  it('uses provided flags', async () => {
    const cmd = new PostgresShowIndexes(['orders', '--profile', 'staging', '--json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(showIndexesStub.firstCall.args.slice(1)).to.deep.equal(['orders', 'staging', 'json'])
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
