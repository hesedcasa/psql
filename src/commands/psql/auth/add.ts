import {input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

import type {ConnectionTestResult, PgJsonConfig} from '../../../psql/index.js'

import {testDirectConnection} from '../../../psql/index.js'

export default class AuthAdd extends Command {
  static override args = {}
  static override description = 'Add a PostgreSQL connection profile'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --no-ssl']
  static override flags = {
    database: Flags.string({char: 'd', description: 'Database name', required: !process.stdout.isTTY}),
    host: Flags.string({description: 'PostgreSQL host', required: !process.stdout.isTTY}),
    password: Flags.string({char: 'p', description: 'Password', required: !process.stdout.isTTY}),
    port: Flags.integer({char: 'P', description: 'PostgreSQL port', required: !process.stdout.isTTY}),
    profile: Flags.string({description: 'Profile name', required: !process.stdout.isTTY}),
    ssl: Flags.boolean({allowNo: true, default: false, description: 'Use SSL', required: false}),
    user: Flags.string({char: 'u', description: 'Username', required: !process.stdout.isTTY}),
  }

  public async run(): Promise<ConnectionTestResult> {
    const {flags} = await this.parse(AuthAdd)

    const profileName = flags.profile ?? (await input({message: 'Profile name:', required: true}))
    const host = flags.host ?? (await input({message: 'PostgreSQL host:', required: true}))
    const port = flags.port ?? Number(await input({default: '5432', message: 'Port:', required: true}))
    const user = flags.user ?? (await input({message: 'Username:', required: true}))
    const password = flags.password ?? (await input({message: 'Password:', required: true}))
    const database = flags.database ?? (await input({message: 'Database:', required: true}))

    const configPath = path.join(this.config.configDir, 'pg-config.json')
    const profileData = {database, host, password, port, ssl: flags.ssl, user}

    const exists = await fs.pathExists(configPath)
    let config: PgJsonConfig
    if (exists) {
      config = await fs.readJSON(configPath)
    } else {
      await fs.createFile(configPath)
      config = {defaultProfile: profileName, profiles: {}}
    }

    config.profiles[profileName] = profileData
    if (Object.keys(config.profiles).length === 1) {
      config.defaultProfile = profileName
    }

    await fs.writeJSON(configPath, config, {mode: 0o600})

    action.start('Testing connection')
    const result = await testDirectConnection(profileData)

    if (result.success) {
      action.stop('✓ successful')
      this.log(`Profile "${profileName}" added successfully`)
    } else {
      action.stop('✗ failed')
      this.error('Connection failed. Please check your configuration.')
    }

    return result
  }
}
