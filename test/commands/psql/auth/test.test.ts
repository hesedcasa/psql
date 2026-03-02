/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable new-cap */
import {expect} from 'chai'
import esmock from 'esmock'
import {stub} from 'sinon'

describe('psql:auth:test', () => {
  let AuthTest: any
  let mockReadConfig: any
  let mockTestDirectConnection: any
  let mockAction: any
  let logOutput: string[]
  let errorOutput: null | string
  let actionStarted: null | string
  let actionStopped: null | string

  const mockProfile = {database: 'testdb', host: 'localhost', password: 'secret', port: 5432, user: 'postgres'}
  const mockJsonConfig = {defaultProfile: 'local', profiles: {local: mockProfile}}

  beforeEach(async () => {
    logOutput = []
    errorOutput = null
    actionStarted = null
    actionStopped = null

    mockReadConfig = async () => mockJsonConfig

    mockTestDirectConnection = async () => ({result: '✅ Connection successful!', success: true})

    mockAction = {
      start(message: string) {
        actionStarted = message
      },
      stop(message: string) {
        actionStopped = message
      },
    }

    AuthTest = await esmock('../../../../src/commands/psql/auth/test.js', {
      '../../../../src/config.js': {readConfig: mockReadConfig},
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@oclif/core/ux': {action: mockAction},
    })
  })

  it('successfully tests connection with valid config', async () => {
    const cmd = new AuthTest.default([], {
      configDir: '/tmp/test-config',
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)
    cmd.log = (output: string) => {
      logOutput.push(output)
    }

    const result = await cmd.run()

    expect(result.success).to.be.true
    expect(actionStarted).to.equal('Testing connection')
    expect(actionStopped).to.equal('✓ successful')
    expect(logOutput).to.include('Successfully connected to PostgreSQL')
  })

  it('returns error when config is not available', async () => {
    mockReadConfig = async () => null

    AuthTest = await esmock('../../../../src/commands/psql/auth/test.js', {
      '../../../../src/config.js': {readConfig: mockReadConfig},
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@oclif/core/ux': {action: mockAction},
    })

    const cmd = new AuthTest.default([], {
      configDir: '/tmp/test-config',
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    const result = await cmd.run()

    expect(result.success).to.be.false
    expect(result.error).to.equal('Missing connection config')
  })

  it('handles connection failure gracefully', async () => {
    mockTestDirectConnection = async () => ({error: 'Connection refused', success: false})

    AuthTest = await esmock('../../../../src/commands/psql/auth/test.js', {
      '../../../../src/config.js': {readConfig: mockReadConfig},
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@oclif/core/ux': {action: mockAction},
    })

    const cmd = new AuthTest.default([], {
      configDir: '/tmp/test-config',
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    cmd.error = (message: string) => {
      errorOutput = message
      throw new Error(message)
    }

    try {
      await cmd.run()
    } catch {
      // Expected to throw
    }

    expect(actionStarted).to.equal('Testing connection')
    expect(actionStopped).to.equal('✗ failed')
    expect(errorOutput).to.include('Failed to connect to PostgreSQL')
  })

  it('does not call testDirectConnection when config is missing', async () => {
    mockReadConfig = async () => null
    let testCalled = false

    mockTestDirectConnection = async () => {
      testCalled = true
      return {success: true}
    }

    AuthTest = await esmock('../../../../src/commands/psql/auth/test.js', {
      '../../../../src/config.js': {readConfig: mockReadConfig},
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@oclif/core/ux': {action: mockAction},
    })

    const cmd = new AuthTest.default([], {
      configDir: '/tmp/test-config',
      root: process.cwd(),
      runHook: stub().resolves({failures: [], successes: []}),
    } as any)

    await cmd.run()

    expect(testCalled).to.be.false
  })
})
