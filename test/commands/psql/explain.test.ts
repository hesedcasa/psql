/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:explain', () => {
  let PostgresExplain: any
  let explainQueryStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {
    data: {plan: [], result: '┌──────┬────────────┐\n│ type │ table      │\n└──────┴────────────┘'},
    success: true,
  }

  beforeEach(async () => {
    explainQueryStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/psql/explain.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        explainQuery: explainQueryStub,
      },
    })
    PostgresExplain = imported.default
  })

  it('explains query using default profile and logs result', async () => {
    const cmd = new PostgresExplain(['SELECT * FROM users WHERE id = 1'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')
    const expectedResult = mockResult.data.result

    await cmd.run()

    expect(explainQueryStub.calledOnce).to.be.true
    expect(explainQueryStub.firstCall.args.slice(1)).to.deep.equal([
      'SELECT * FROM users WHERE id = 1',
      undefined,
      'table',
    ])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(expectedResult)
  })

  it('uses provided flags', async () => {
    const cmd = new PostgresExplain(['SELECT 1', '--profile', 'prod', '--json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(explainQueryStub.firstCall.args.slice(1)).to.deep.equal(['SELECT 1', 'prod', 'json'])
  })

  it('throws error when explain fails', async () => {
    explainQueryStub.resolves({error: 'ERROR: You have an error in your SQL syntax', success: false})

    const cmd = new PostgresExplain(['INVALID SQL'], {
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
