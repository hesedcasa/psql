/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect} from 'chai'
import esmock from 'esmock'
import {type SinonStub, stub} from 'sinon'

const flushMicrotasks = async () =>
  new Promise((resolve) => {
    setImmediate(resolve)
  })

describe('postgres-utils: PostgreSQLUtil', () => {
  let PostgreSQLUtil: any
  let MockPool: SinonStub
  let mockPool: {end: SinonStub; on: SinonStub; query: SinonStub}

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
    mockPool = {
      end: stub().resolves(),
      on: stub(),
      query: stub(),
    }
    MockPool = stub().returns(mockPool)

    const imported = await esmock('../../src/psql/postgres-utils.js', {
      pg: {default: {Pool: MockPool}},
    })
    PostgreSQLUtil = imported.PostgreSQLUtil
  })

  describe('listDatabases', () => {
    it('returns list of databases', async () => {
      mockPool.query.resolves({
        command: 'SELECT',
        fields: [{name: 'datname'}],
        rowCount: 2,
        rows: [{datname: 'mydb'}, {datname: 'testdb'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.listDatabases('local')

      expect(result.success).to.be.true
      expect(result.data?.databases).to.deep.equal(['mydb', 'testdb'])
      expect(result.data?.result).to.include('mydb')
    })

    it('returns error on query failure', async () => {
      mockPool.query.rejects(new Error('Access denied'))

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
      expect(result.data?.requiresConfirmation).to.be.true
    })

    it('executes SELECT with auto LIMIT applied', async () => {
      mockPool.query.resolves({
        command: 'SELECT',
        fields: [{name: 'id'}, {name: 'name'}],
        rowCount: 1,
        rows: [{id: 1, name: 'Alice'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'SELECT * FROM users')

      expect(result.success).to.be.true
      expect(result.data?.result).to.include('Rows returned: 1')
    })

    it('skips confirmation when skipConfirmation is true', async () => {
      mockPool.query.resolves({
        command: 'DELETE',
        fields: [],
        rowCount: 3,
        rows: [],
      })

      const util = new PostgreSQLUtil(mockConfig)
      const result = await util.executeQuery('local', 'DELETE FROM sessions', 'table', true)

      expect(result.success).to.be.true
      expect(result.data?.result).to.include('Affected rows: 3')
    })
  })

  describe('concurrency limit', () => {
    const limitedConfig = {
      ...mockConfig,
      safety: {...mockConfig.safety, maxConcurrentQueries: 2},
    }

    it('sizes the connection pool to the effective query limit', async () => {
      mockPool.query.resolves({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})

      const util = new PostgreSQLUtil(limitedConfig)
      await util.listDatabases('local')

      expect(MockPool.calledOnce).to.be.true
      expect(MockPool.firstCall.args[0].max).to.equal(2)
    })

    it('registers an error listener so idle pool errors do not crash the process', async () => {
      mockPool.query.resolves({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      const stderr = stub(process.stderr, 'write')

      try {
        const util = new PostgreSQLUtil(mockConfig)
        await util.listDatabases('local')

        const errorHandler = mockPool.on.getCalls().find((call) => call.args[0] === 'error')?.args[1]
        expect(errorHandler, 'pool should register an "error" listener').to.be.a('function')

        // Emitting an idle-client error must be handled (logged), not rethrown.
        expect(() => errorHandler(new Error('server closed the connection unexpectedly'))).to.not.throw()
        expect(stderr.calledWithMatch('server closed the connection unexpectedly')).to.be.true
      } finally {
        stderr.restore()
      }
    })

    it('queues queries beyond the limit until a running query finishes', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const util = new PostgreSQLUtil(limitedConfig)
      const first = util.listDatabases('local')
      const second = util.listDatabases('local')
      const third = util.listDatabases('local')

      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(2)

      resolvers[0]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      await first
      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(3)

      resolvers[1]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      resolvers[2]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      const [secondResult, thirdResult] = await Promise.all([second, third])
      expect(secondResult.success).to.be.true
      expect(thirdResult.success).to.be.true
    })

    it('frees the slot when a query fails so waiting queries still run', async () => {
      mockPool.query.onFirstCall().rejects(new Error('boom'))
      mockPool.query
        .onSecondCall()
        .resolves({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})

      const util = new PostgreSQLUtil({...mockConfig, safety: {...mockConfig.safety, maxConcurrentQueries: 1}})
      const [failed, succeeded] = await Promise.all([util.listDatabases('local'), util.listDatabases('local')])

      expect(failed.success).to.be.false
      expect(failed.error).to.include('boom')
      expect(succeeded.success).to.be.true
    })

    it('rejects queued queries when closeAll is called', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const util = new PostgreSQLUtil({...mockConfig, safety: {...mockConfig.safety, maxConcurrentQueries: 1}})
      const running = util.listDatabases('local')
      const queued = util.listDatabases('local')

      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(1)

      await util.closeAll()

      const queuedResult = await queued
      expect(queuedResult.success).to.be.false
      expect(queuedResult.error).to.include('closed while the query was waiting')

      resolvers[0]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      const runningResult = await running
      expect(runningResult.success).to.be.true
    })

    it('fails a queued query that waits longer than queryQueueTimeoutMs', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const util = new PostgreSQLUtil({
        ...mockConfig,
        safety: {...mockConfig.safety, maxConcurrentQueries: 1, queryQueueTimeoutMs: 20},
      })
      const running = util.listDatabases('local')
      const queued = util.listDatabases('local')

      const queuedResult = await queued
      expect(queuedResult.success).to.be.false
      expect(queuedResult.error).to.include('Timed out after 0.02s waiting for a free query slot')

      // The slot itself is unaffected: the running query still completes,
      // and its release must not grant a slot to the timed-out waiter.
      resolvers[0]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      const runningResult = await running
      expect(runningResult.success).to.be.true

      // A fresh query can still acquire the freed slot afterwards.
      const after = util.listDatabases('local')
      await flushMicrotasks()
      resolvers[1]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      const afterResult = await after
      expect(afterResult.success).to.be.true
    })

    it('prefers the profile-level queryQueueTimeoutMs over the safety default', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      // Safety allows a long wait, but the profile times out almost immediately.
      const util = new PostgreSQLUtil({
        ...mockConfig,
        profiles: {
          local: {...mockConfig.profiles.local, maxConcurrentQueries: 1, queryQueueTimeoutMs: 20},
        },
        safety: {...mockConfig.safety, queryQueueTimeoutMs: 60_000},
      })
      const running = util.listDatabases('local')
      const queued = await util.listDatabases('local')

      expect(queued.success).to.be.false
      expect(queued.error).to.include('Timed out after 0.02s')

      resolvers[0]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      const runningResult = await running
      expect(runningResult.success).to.be.true
    })

    it('prefers the profile-level maxConcurrentQueries over the safety default', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      // Safety allows 2, but the profile itself only allows 1.
      const config = {
        ...limitedConfig,
        profiles: {
          local: {...limitedConfig.profiles.local, maxConcurrentQueries: 1},
        },
      }
      const util = new PostgreSQLUtil(config)
      const first = util.listDatabases('local')
      const second = util.listDatabases('local')

      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(1)

      resolvers[0]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      await first
      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(2)

      resolvers[1]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      await second
    })

    it('tracks limits per profile independently', async () => {
      const resolvers: Array<(value: unknown) => void> = []
      mockPool.query.callsFake(
        async () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      )

      const config = {
        ...limitedConfig,
        profiles: {
          ...limitedConfig.profiles,
          other: {database: 'otherdb', host: 'localhost', password: 'secret', port: 5432, user: 'postgres'},
        },
        safety: {...limitedConfig.safety, maxConcurrentQueries: 1},
      }
      const util = new PostgreSQLUtil(config)
      const local1 = util.listDatabases('local')
      const local2 = util.listDatabases('local')
      const other = util.listDatabases('other')

      await flushMicrotasks()
      // One slot per profile: local1 and other run, local2 waits.
      expect(mockPool.query.callCount).to.equal(2)

      for (const resolve of resolvers)
        resolve({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      await Promise.all([local1, other])
      await flushMicrotasks()
      expect(mockPool.query.callCount).to.equal(3)

      resolvers[2]({command: 'SELECT', fields: [{name: 'datname'}], rowCount: 1, rows: [{datname: 'mydb'}]})
      await local2
    })
  })

  describe('closeAll', () => {
    it('closes all pooled connections', async () => {
      mockPool.query.resolves({
        command: 'SELECT',
        fields: [{name: 'version'}, {name: 'current_database'}],
        rowCount: 1,
        rows: [{current_database: 'mydb', version: 'PostgreSQL 15.4'}],
      })

      const util = new PostgreSQLUtil(mockConfig)
      await util.testConnection('local') // creates a connection
      await util.closeAll()

      expect(mockPool.end.calledOnce).to.be.true
    })

    it('closes all connections even if one end() rejects', async () => {
      const twoProfileConfig = {
        ...mockConfig,
        profiles: {
          ...mockConfig.profiles,
          remote: {database: 'remotedb', host: 'remote.host', password: 'pass', port: 5432, user: 'admin'},
        },
      }

      mockPool.query.resolves({
        command: 'SELECT',
        fields: [{name: 'version'}, {name: 'current_database'}],
        rowCount: 1,
        rows: [{current_database: 'mydb', version: 'PostgreSQL 15.4'}],
      })
      mockPool.end.onFirstCall().rejects(new Error('socket hang up'))

      const util = new PostgreSQLUtil(twoProfileConfig)
      await util.testConnection('local')
      await util.testConnection('remote')

      await util.closeAll() // should not throw
      expect(mockPool.end.callCount).to.equal(2)
    })
  })
})
