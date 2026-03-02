import {expect} from 'chai'

import type {PgConfig} from '../../src/psql/config-loader.js'

import {getPgConnectionOptions} from '../../src/psql/config-loader.js'

describe('psql/config-loader', () => {
  const mockConfig: PgConfig = {
    defaultFormat: 'table',
    defaultProfile: 'local',
    profiles: {
      local: {database: 'mydb', host: 'localhost', password: 'secret', port: 5432, user: 'postgres'},
      staging: {
        database: 'appdb',
        host: 'staging-db.example.com',
        password: 'apppass',
        port: 5432,
        ssl: true,
        user: 'appuser',
      },
    },
    safety: {
      blacklistedOperations: ['DROP DATABASE'],
      defaultLimit: 100,
      requireConfirmationFor: ['DELETE', 'UPDATE', 'DROP', 'TRUNCATE', 'ALTER'],
    },
  }

  describe('getPgConnectionOptions', () => {
    it('returns connection options for a valid profile', () => {
      const options = getPgConnectionOptions(mockConfig, 'local')

      expect(options.host).to.equal('localhost')
      expect(options.port).to.equal(5432)
      expect(options.user).to.equal('postgres')
      expect(options.password).to.equal('secret')
      expect(options.database).to.equal('mydb')
      expect(options.connectionTimeoutMillis).to.equal(10_000)
    })

    it('includes ssl when profile has ssl: true', () => {
      const options = getPgConnectionOptions(mockConfig, 'staging')

      expect(options.ssl).to.deep.equal({})
    })

    it('throws when profile does not exist', () => {
      expect(() => getPgConnectionOptions(mockConfig, 'nonexistent')).to.throw('nonexistent')
    })
  })
})
