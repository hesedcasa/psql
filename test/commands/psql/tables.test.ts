/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:list-tables', () => {
  let PostgresListTables: any
  let listTablesStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {
    data: {result: 'Tables in database:\n  • users\n  • orders', tables: ['users', 'orders']},
    success: true,
  }

  beforeEach(async () => {
    listTablesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/psql/tables.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        listTables: listTablesStub,
      },
    })
    PostgresListTables = imported.default
  })

  it('lists tables using default profile and logs result', async () => {
    const cmd = new PostgresListTables([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    const result = await cmd.run()

    expect(listTablesStub.calledOnce).to.be.true
    expect(listTablesStub.firstCall.args[1]).to.be.undefined
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(result).to.deep.equal(mockResult)
  })

  it('uses provided --profile flag', async () => {
    const cmd = new PostgresListTables(['--profile', 'prod'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(listTablesStub.firstCall.args[1]).to.equal('prod')
  })

  it('throws error when listing fails', async () => {
    listTablesStub.resolves({error: 'no database selected', success: false})

    const cmd = new PostgresListTables([], {
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
