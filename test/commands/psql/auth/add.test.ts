/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable new-cap */
import {expect} from 'chai'
import esmock from 'esmock'
import {stub} from 'sinon'

describe('psql:auth:add', () => {
  let AuthAdd: any
  let mockFs: any
  let mockTestDirectConnection: any
  let mockAction: any
  let mockInput: any
  let logMessages: string[]

  const mockResult = {result: '✅ Connection successful!', success: true}
  const existingConfig = {
    defaultProfile: 'default',
    profiles: {default: {database: 'testdb', host: 'localhost', password: 'secret', port: 5432, user: 'postgres'}},
  }

  beforeEach(async () => {
    logMessages = []

    mockFs = {
      async createFile() {},
      async pathExists() {
        return false
      },
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

    mockInput = async ({message}: {message: string}) => {
      if (message.includes('Profile name')) return 'default'
      if (message.includes('PostgreSQL host')) return 'localhost'
      if (message.includes('Port')) return '5432'
      if (message.includes('Username')) return 'postgres'
      if (message.includes('Password')) return 'secret'
      if (message.includes('Database')) return 'testdb'
      return ''
    }

    AuthAdd = await esmock('../../../../src/commands/psql/auth/add.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {input: mockInput},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })
  })

  it('adds profile successfully with flags', async () => {
    const cmd = new AuthAdd.default(
      [
        '--host',
        'localhost',
        '--port',
        '5432',
        '--user',
        'postgres',
        '--password',
        'secret',
        '--database',
        'testdb',
        '--profile',
        'default',
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

    const result = await cmd.run()

    expect(result.success).to.be.true
    expect(logMessages).to.include('Profile "default" added successfully')
  })

  it('adds profile with custom name via --profile flag', async () => {
    const cmd = new AuthAdd.default(
      [
        '--host',
        'staging-host',
        '--port',
        '5432',
        '--user',
        'admin',
        '--password',
        'secret',
        '--database',
        'app',
        '--profile',
        'staging',
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

    expect(logMessages).to.include('Profile "staging" added successfully')
  })

  it('handles connection failure', async () => {
    mockTestDirectConnection = async () => ({error: 'Connection refused', success: false})

    AuthAdd = await esmock('../../../../src/commands/psql/auth/add.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {input: mockInput},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthAdd.default(
      [
        '--host',
        'localhost',
        '--port',
        '5432',
        '--user',
        'postgres',
        '--password',
        'bad',
        '--database',
        'testdb',
        '--profile',
        'default',
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

    let errorThrown = false
    cmd.error = (msg: string) => {
      errorThrown = true
      expect(msg).to.include('Connection failed')
    }

    await cmd.run()

    expect(errorThrown).to.be.true
  })

  it('creates config file if it does not exist', async () => {
    let createFileCalled = false

    mockFs = {
      ...mockFs,
      async createFile() {
        createFileCalled = true
      },
      async pathExists() {
        return false
      },
    }

    AuthAdd = await esmock('../../../../src/commands/psql/auth/add.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {input: mockInput},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthAdd.default(
      [
        '--host',
        'localhost',
        '--port',
        '5432',
        '--user',
        'postgres',
        '--password',
        'secret',
        '--database',
        'testdb',
        '--profile',
        'default',
      ],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = () => {}

    await cmd.run()

    expect(createFileCalled).to.be.true
  })

  it('reads existing config when file already exists', async () => {
    let readJSONCalled = false

    mockFs = {
      ...mockFs,
      async pathExists() {
        return true
      },
      async readJSON() {
        readJSONCalled = true
        return existingConfig
      },
    }

    AuthAdd = await esmock('../../../../src/commands/psql/auth/add.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {input: mockInput},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthAdd.default(
      [
        '--host',
        'localhost',
        '--port',
        '5432',
        '--user',
        'postgres',
        '--password',
        'secret',
        '--database',
        'testdb',
        '--profile',
        'default',
      ],
      {
        configDir: '/tmp/test-config',
        root: process.cwd(),
        runHook: stub().resolves({failures: [], successes: []}),
      } as any,
    )
    cmd.log = () => {}

    await cmd.run()

    expect(readJSONCalled).to.be.true
  })

  it('calls testDirectConnection after writing config', async () => {
    let testCalled = false

    mockTestDirectConnection = async () => {
      testCalled = true
      return mockResult
    }

    AuthAdd = await esmock('../../../../src/commands/psql/auth/add.js', {
      '../../../../src/psql/index.js': {testDirectConnection: mockTestDirectConnection},
      '@inquirer/prompts': {input: mockInput},
      '@oclif/core/ux': {action: mockAction},
      'fs-extra': mockFs,
    })

    const cmd = new AuthAdd.default(
      [
        '--host',
        'localhost',
        '--port',
        '5432',
        '--user',
        'postgres',
        '--password',
        'secret',
        '--database',
        'testdb',
        '--profile',
        'default',
      ],
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
