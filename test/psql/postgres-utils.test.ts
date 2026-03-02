/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

describe('postgres-utils: PostgreSQLUtil', () => {
  let PostgreSQLUtil: any
  let MockClient: SinonStub
  let mockClient: {connect: SinonStub; end: SinonStub; query: SinonStub}

  const mockConfig = {
    defaultFormat: 'table' as const,
    defaultProfile: 'local',
    profiles: {
      local: {database: 'mydb', host: 'localhost', password: 'secret', port: 5432, user: 'postgres'},
    },
    safety: {
      blacklistedOperations: ['DROP DATABASE'],
      defaultLimit: 100,
      requireConfirmationFor: ['DELETE', 'UPDATE'],
    },
  }

  beforeEach(async () => {
    mockClient = {
      connect: stub().resolves(),
      end: stub().resolves(),
      query: stub(),
    }
    MockClient = stub().returns(mockClient)

    const imported = await esmock('../../src/psql/postgres-utils.js', {
      pg: {default: {Client: MockClient}},
    })
    PostgreSQLUtil = imported.PostgreSQLUtil
  })

  describe('listDatabases', () => {
    it('returns list of databases', async () => {
      mockClient.query.resolves({
        command: 'SELECT',
        fields: [{name: 'datname'}],
        rowCount: 2,
        rows: [{datname: 'mydb'}, {datname: 'testdb'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.true
      expect(result.databases).to.deep.equal(['mydb', 'testdb'])
      expect(result.result).to.include('mydb')
    })

    it('returns error on query failure', async () => {
      mockClient.query.rejects(new Error('Access denied'))

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.false
      expect(result.error).to.include('Access denied')
    })
  })

  describe('executeQuery', () => {
    it('blocks blacklisted operations', async () => {
      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DROP DATABASE mydb')

      expect(result.success).to.be.false
      expect(result.error).to.include('blacklisted')
    })

    it('requires confirmation for destructive operations', async () => {
      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DELETE FROM users')

      expect(result.success).to.be.false
      expect(result.requiresConfirmation).to.be.true
    })

    it('executes SELECT with auto LIMIT applied', async () => {
      mockClient.query.resolves({
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'name'}],
        rowCount: 1,
        rows: [{id: 1, name: 'Alice'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'SELECT * FROM users')

      expect(result.success).to.be.true
      expect(result.result).to.include('Rows returned: 1')
    })

    it('skips confirmation when skipConfirmation is true', async () => {
      mockClient.query.resolves({
        command: 'DELETE',
        fields: [],
        rowCount: 3,
        rows: [],
      })

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DELETE FROM sessions', 'table', true)

      expect(result.success).to.be.true
      expect(result.result).to.include('Affected rows: 3')
    })
  })

  describe('closeAll', () => {
    it('closes all pooled connections', async () => {
      mockClient.query.resolves({
        command: 'SELECT',
        fields: [{name: 'version'}, {name: 'current_database'}],
        rowCount: 1,
        // eslint-disable-next-line camelcase
        rows: [{current_database: 'mydb', version: 'PostgreSQL 15.4'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      await util.testConnection('local') // creates a connection
      await util.closeAll()

      expect(mockClient.end.calledOnce).to.be.true
    })
  })
})
