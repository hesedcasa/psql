/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:list-tables', () => {
  let PostgresListTables: any
  let listTablesStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getPgConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {result: 'Tables in database:\n  • users\n  • orders', success: true, tables: ['users', 'orders']}

  beforeEach(async () => {
    listTablesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getPgConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/psql/list-tables.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        getPgConfig: getPgConfigStub,
        listTables: listTablesStub,
        setConfigDir: setConfigDirStub,
      },
    })
    PostgresListTables = imported.default
  })

  it('lists tables using default profile and logs result', async () => {
    const cmd = new PostgresListTables([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logJsonStub = stub(cmd, 'logJson')

    await cmd.run()

    expect(getPgConfigStub.calledOnce).to.be.true
    expect(listTablesStub.calledOnce).to.be.true
    expect(listTablesStub.firstCall.args[0]).to.equal('local')
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logJsonStub.calledOnce).to.be.true
    expect(logJsonStub.firstCall.args[0]).to.deep.equal(mockResult.tables)
  })

  it('uses provided --profile flag', async () => {
    const cmd = new PostgresListTables(['--profile', 'prod'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'logJson')

    await cmd.run()

    expect(getPgConfigStub.called).to.be.false
    expect(listTablesStub.firstCall.args[0]).to.equal('prod')
  })

  it('throws error when listing fails', async () => {
    listTablesStub.resolves({error: 'ERROR: no database selected', success: false})

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
