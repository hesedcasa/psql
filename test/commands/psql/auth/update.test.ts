import {expect} from 'chai'

describe('psql:auth:update', () => {
  // Auth:update command is a thin wrapper around @hesed/plugin-lib's createAuthUpdateCommand.
  // The detailed auth functionality is tested in plugin-lib's own test suite.
  // Here we only test the PostgreSQL-specific integration points.
  it('exports correct integration points', async () => {
    const {default: AuthUpdate} = await import('../../../../src/commands/psql/auth/update.js')
    const {closeConnections, testDirectConnection} = await import('../../../../src/psql/index.js')

    expect(AuthUpdate).to.be.a('function')
    expect(closeConnections).to.be.a('function')
    expect(testDirectConnection).to.be.a('function')
  })
})
