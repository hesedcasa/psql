import {expect} from 'chai'

describe('psql:auth:test', () => {
  // Auth:test command is a thin wrapper around @hesed/plugin-lib's createAuthTestCommand.
  // The detailed functionality is tested in plugin-lib's own test suite.
  // Here we only test the PostgreSQL-specific integration points.
  it('exports correct integration points', async () => {
    const {default: AuthTest} = await import('../../../../src/commands/psql/auth/test.js')
    const {closeConnections, testDirectConnection} = await import('../../../../src/psql/index.js')

    expect(AuthTest).to.be.a('function')
    expect(closeConnections).to.be.a('function')
    expect(testDirectConnection).to.be.a('function')
  })
})
