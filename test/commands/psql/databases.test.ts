/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('psql:list-databases', () => {
  let PostgresListDatabases: any
  let listDatabasesStub: SinonStub
  let closeConnectionsStub: SinonStub
  let getPgConfigStub: SinonStub
  let setConfigDirStub: SinonStub

  const mockConfig = {defaultFormat: 'table', defaultProfile: 'local'}
  const mockResult = {databases: ['mydb', 'testdb'], result: 'Databases:\n  • mydb\n  • testdb', success: true}

  beforeEach(async () => {
    listDatabasesStub = stub().resolves(mockResult)
    closeConnectionsStub = stub().resolves()
    getPgConfigStub = stub().resolves(mockConfig)
    setConfigDirStub = stub()

    const imported = await esmock('../../../src/commands/psql/list-databases.js', {
      '../../../src/psql/index.js': {
        closeConnections: closeConnectionsStub,
        getPgConfig: getPgConfigStub,
        listDatabases: listDatabasesStub,
        setConfigDir: setConfigDirStub,
      },
    })
    PostgresListDatabases = imported.default
  })

  it('lists databases using default profile and logs result', async () => {
    const cmd = new PostgresListDatabases([], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    const logJsonStub = stub(cmd, 'logJson')

    await cmd.run()

    expect(getPgConfigStub.calledOnce).to.be.true
    expect(listDatabasesStub.calledOnce).to.be.true
    expect(listDatabasesStub.firstCall.args[0]).to.equal('local')
    expect(closeConnectionsStub.calledOnce).to.be.true
    expect(logJsonStub.calledOnce).to.be.true
    expect(logJsonStub.firstCall.args[0]).to.deep.equal(mockResult.databases)
  })

  it('uses provided --profile flag', async () => {
    const cmd = new PostgresListDatabases(['--profile', 'staging'], {
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    stub(cmd, 'logJson')

    await cmd.run()

    expect(getPgConfigStub.called).to.be.false
    expect(listDatabasesStub.firstCall.args[0]).to.equal('staging')
  })

  it('throws error when listing fails', async () => {
    listDatabasesStub.resolves({error: 'ERROR: access denied', success: false})

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
