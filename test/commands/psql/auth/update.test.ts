/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable new-cap */
import {expect} from 'chai'
import esmock from 'esmock'
import {stub} from 'sinon'

describe('psql:auth:update', () => {
  let AuthUpdate: any
  let mockFs: any
  let mockTestDirectConnection: any
  let mockAction: any
  let mockConfirm: any
  let logMessages: string[]

  const mockResult = {result: '✅ Connection successful!', success: true}
  const existingProfile = {database: 'olddb', host: 'old-host', password: 'old-secret', port: 5432, user: 'old-user'}
  const existingConfig = {defaultProfile: 'default', profiles: {default: existingProfile}}

  beforeEach(async () => {
    logMessages = []

    mockFs = {
      async readJSON() {
        return existingConfig
      },
      async writeJSON() {},
    }

    mockTestDirectConnection = async () => mockResult

    mockAction = {
      start() {},
      stop() {},
    }

    mockConfirm = async () => true

    AuthUpdate = await esmock('../../../../src/commands/psql/auth/update.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {confirm: mockConfirm},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })
  })

  it('updates default profile successfully with flags', async () => {
    const cmd = new AuthUpdate.default(
      ['--host', 'new-host', '--port', '5432', '--user', 'new-user', '--password', 'new-secret', '--database', 'newdb'],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = (msg: string) => {
      logMessages.push(msg)
    }

    const result = await cmd.run()

    expect(result.success).to.be.true
    expect(logMessages).to.include('Profile "default" updated successfully')
  })

  it('updates named profile with --profile flag', async () => {
    const configWithStaging = {
      defaultProfile: 'default',
      profiles: {
        default: existingProfile,
        staging: {database: 'stagingdb', host: 'staging-host', password: 'stag-pass', port: 5432, user: 'stag-user'},
      },
    }

    mockFs = {
      ...mockFs,
      async readJSON() {
        return configWithStaging
      },
    }

    AuthUpdate = await esmock('../../../../src/commands/psql/auth/update.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {confirm: mockConfirm},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthUpdate.default(
      [
        '--profile',
        'staging',
        '--host',
        'new-staging',
        '--port',
        '5432',
        '--user',
        'admin',
        '--password',
        'pass',
        '--database',
        'newdb',
      ],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = (msg: string) => {
      logMessages.push(msg)
    }

    await cmd.run()

    expect(logMessages).to.include('Profile "staging" updated successfully')
  })

  it('handles connection failure', async () => {
    mockTestDirectConnection = async () => ({error: 'Connection refused', success: false})

    AuthUpdate = await esmock('../../../../src/commands/psql/auth/update.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {confirm: mockConfirm},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthUpdate.default(
      ['--host', 'new-host', '--port', '5432', '--user', 'new-user', '--password', 'bad', '--database', 'newdb'],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = (msg: string) => {
      logMessages.push(msg)
    }

    let errorThrown = false
    cmd.error = (msg: string) => {
      errorThrown = true
      expect(msg).to.include('Connection failed')
    }

    await cmd.run()

    expect(errorThrown).to.be.true
  })

  it('exits when config file does not exist', async () => {
    mockFs = {
      async readJSON() {
        const error: any = new Error('no such file or directory')
        error.message = 'no such file or directory'
        throw error
      },
    }

    AuthUpdate = await esmock('../../../../src/commands/psql/auth/update.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {confirm: mockConfirm},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthUpdate.default(
      ['--host', 'new-host', '--port', '5432', '--user', 'new-user', '--password', 'secret', '--database', 'newdb'],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = (msg: string) => {
      logMessages.push(msg)
    }

    await cmd.run()

    expect(logMessages).to.include('Run auth:add instead')
  })

  it('exits when user cancels confirmation', async () => {
    mockConfirm = async () => false

    AuthUpdate = await esmock('../../../../src/commands/psql/auth/update.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {confirm: mockConfirm},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthUpdate.default(
      ['--host', 'new-host', '--port', '5432', '--user', 'new-user', '--password', 'secret', '--database', 'newdb'],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = (msg: string) => {
      logMessages.push(msg)
    }

    const result = await cmd.run()

    expect(result).to.be.undefined
    expect(logMessages).to.not.include('Profile "default" updated successfully')
  })

  it('calls testDirectConnection after writing config', async () => {
    let testCalled = false

    mockTestDirectConnection = async () => {
      testCalled = true
      return mockResult
    }

    AuthUpdate = await esmock('../../../../src/commands/psql/auth/update.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {confirm: mockConfirm},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthUpdate.default(
      ['--host', 'new-host', '--port', '5432', '--user', 'new-user', '--password', 'secret', '--database', 'newdb'],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = () => {}

    await cmd.run()

    expect(testCalled).to.be.true
  })
})
