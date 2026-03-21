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

  describe('getConnection', () => {
    it('runs SELECT 1 health check when reusing a cached connection', async () => {
      mockClient.query.resolves({
        command: 'SELECT',
        fields: [{name: 'datname'}],
        rowCount: 1,
        rows: [{datname: 'mydb'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      await util.listDatabases('local') // creates connection, 1 query call
      await util.listDatabases('local') // reuses connection: SELECT 1 + actual query = 2 more calls

      expect(MockClient.callCount).to.equal(1)
      expect(mockClient.query.callCount).to.equal(3)
      expect(mockClient.query.firstCall.args[0]).to.not.equal('SELECT 1')
      expect(mockClient.query.secondCall.args[0]).to.equal('SELECT 1')
    })

    it('reconnects when health check fails on cached connection', async () => {
      const dbResult = {
        command: 'SELECT',
        fields: [{name: 'datname'}],
        rowCount: 1,
        rows: [{datname: 'mydb'}],
      }

      mockClient.query
        .onFirstCall()
        .resolves(dbResult) // first listDatabases actual query
        .onSecondCall()
        .rejects(new Error('connection terminated')) // health check on reuse
        .onThirdCall()
        .resolves(dbResult) // second listDatabases actual query after reconnect

      const util = new PostgreSQLUtil(mockConfig)
      await util.listDatabases('local') // creates connection
      const result = await util.listDatabases('local') // health check fails → reconnects

      expect(result.success).to.be.true
      expect(MockClient.callCount).to.equal(2) // new client created after stale connection
    })

    it('removes failed connection promise and throws when connect fails', async () => {
      mockClient.connect.rejects(new Error('ECONNREFUSED'))

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.false
      expect(result.error).to.include('ECONNREFUSED')

      // After failure, a second call should attempt a fresh connection
      mockClient.connect.resolves()
      mockClient.query.resolves({
        command: 'SELECT',
        fields: [{name: 'datname'}],
        rowCount: 1,
        rows: [{datname: 'mydb'}],
      })
      const retryResult = await util.listDatabases('local')
      expect(retryResult.success).to.be.true
      expect(MockClient.callCount).to.equal(2)
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

    it('closes all connections even if one end() rejects', async () => {
      const twoProfileConfig = {
        ...mockConfig,
        profiles: {
          ...mockConfig.profiles,
          remote: {database: 'remotedb', host: 'remote.host', password: 'pass', port: 5432, user: 'admin'},
        },
      }

      mockClient.query.resolves({
        command: 'SELECT',
        fields: [{name: 'version'}, {name: 'current_database'}],
        rowCount: 1,
        // eslint-disable-next-line camelcase
        rows: [{current_database: 'mydb', version: 'PostgreSQL 15.4'}],
      })
      mockClient.end.onFirstCall().rejects(new Error('socket hang up'))

      const util = new PostgreSQLUtil(twoProfileConfig)
      await util.testConnection('local')
      await util.testConnection('remote')

      await util.closeAll() // should not throw
      expect(mockClient.end.callCount).to.equal(2)
    })
  })
})
