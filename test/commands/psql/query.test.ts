/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:query', () => {
  let PostgresQuery: any
  let executeQueryStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {
    data: {result: 'Query executed successfully. Rows returned: 2\n\nid | name\n1  | Alice'},
    success: true,
  }

  beforeEach(async () => {
    executeQueryStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/psql/query.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        executeQuery: executeQueryStub,
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

    expect(executeQueryStub.calledOnce).to.be.true
    expect(executeQueryStub.firstCall.args.slice(1)).to.deep.equal(['SELECT * FROM users', undefined, 'table', false])
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal(mockResult.data.result)
  })

  it('uses provided --profile and --json flag', async () => {
    executeQueryStub.resolves({data: {result: '[{"1":1}]'}, success: true})

    const cmd = new PostgresQuery(['SELECT 1', '--profile', 'prod', '--json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    await cmd.run()

    expect(executeQueryStub.firstCall.args.slice(1)).to.deep.equal(['SELECT 1', 'prod', 'json', false])
    expect(logStub.calledOnce).to.be.true
    expect(logStub.firstCall.args[0]).to.equal('[{"1":1}]')
  })

  it('enables JSON mode only for --json', async () => {
    const jsonCmd = new PostgresQuery(['SELECT 1', '--json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const toonCmd = new PostgresQuery(['SELECT 1', '--toon'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const defaultCmd = new PostgresQuery(['SELECT 1'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const passthroughCmd = new PostgresQuery(['SELECT 1', '--', '--json'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    expect(jsonCmd.jsonEnabled()).to.be.true
    expect(toonCmd.jsonEnabled()).to.be.false
    expect(defaultCmd.jsonEnabled()).to.be.false
    expect(passthroughCmd.jsonEnabled()).to.be.false
  })

  it('passes --skip-confirmation flag to executeQuery', async () => {
    const cmd = new PostgresQuery(['DELETE FROM sessions', '--skip-confirmation'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(executeQueryStub.firstCall.args[4]).to.be.true
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
