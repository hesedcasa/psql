/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:list-databases', () => {
  let PostgresListDatabases: any
  let listDatabasesStub: SinonStub
  let closeConnectionsStub: SinonStub

  const mockResult = {
    data: {databases: ['mydb', 'testdb'], result: 'Databases:\n  • mydb\n  • testdb'},
    success: true,
  }

  beforeEach(async () => {
    listDatabasesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()

    const imported = await esmock('../../../src/commands/psql/databases.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        listDatabases: listDatabasesStub,
      },
    })
    PostgresListDatabases = imported.default
  })

  it('lists databases using default profile and logs result', async () => {
    const cmd = new PostgresListDatabases([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logStub = stub(cmd, 'log')

    const result = await cmd.run()

    expect(listDatabasesStub.calledOnce).to.be.true
    expect(listDatabasesStub.firstCall.args[1]).to.be.undefined
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logStub.calledOnce).to.be.true
    expect(result).to.deep.equal(mockResult)
  })

  it('uses provided --profile flag', async () => {
    const cmd = new PostgresListDatabases(['--profile', 'staging'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'log')

    await cmd.run()

    expect(listDatabasesStub.firstCall.args[1]).to.equal('staging')
  })

  it('throws error when listing fails', async () => {
    listDatabasesStub.resolves({error: 'access denied', success: false})

    const cmd = new PostgresListDatabases([], {
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
