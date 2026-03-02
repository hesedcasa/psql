import {confirm, input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

import type {ConnectionTestResult, PgJsonConfig} from '../../../psql/index.js'

import {testDirectConnection} from '../../../psql/index.js'

export default class AuthUpdate extends Command {
  static override args = {}
  static override description = 'Update an existing PostgreSQL connection profile'
  static override enableJsonFlag = true
  static override examples = [
    '<%= config.bin %> <%= command.id %> --ssl',
    '<%= config.bin %> <%= command.id %> --profile staging',
  ]
  static override flags = {
    database: Flags.string({char: 'd', description: 'Database name', required: !process.stdout.isTTY}),
    host: Flags.string({description: 'PostgreSQL host', required: !process.stdout.isTTY}),
    password: Flags.string({char: 'p', description: 'Password', required: !process.stdout.isTTY}),
    port: Flags.integer({char: 'P', description: 'PostgreSQL port', required: !process.stdout.isTTY}),
    profile: Flags.string({description: 'Profile name to update', required: false}),
    ssl: Flags.boolean({allowNo: true, default: false, description: 'Use SSL', required: false}),
    user: Flags.string({char: 'u', description: 'Username', required: !process.stdout.isTTY}),
  }

  public async run(): Promise<ConnectionTestResult | void> {
    const {flags} = await this.parse(AuthUpdate)
    const configPath = path.join(this.config.configDir, 'pg-config.json')
    let config: PgJsonConfig
    try {
      config = await fs.readJSON(configPath)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.toLowerCase().includes('no such file or directory')) {
        this.log('Run auth:add instead')
      } else {
        this.log(msg)
      }

      return
    }

    const profileName = flags.profile ?? config.defaultProfile
    const existingProfile = config.profiles[profileName]
    if (!existingProfile) {
      this.error(`Profile "${profileName}" not found. Available: ${Object.keys(config.profiles).join(', ')}`)
    }

    const host =
      flags.host ??
      (await input({default: existingProfile.host, message: 'PostgreSQL host:', prefill: 'tab', required: true}))
    const port =
      flags.port ??
      Number(await input({default: String(existingProfile.port), message: 'Port:', prefill: 'tab', required: true}))
    const user =
      flags.user ?? (await input({default: existingProfile.user, message: 'Username:', prefill: 'tab', required: true}))
    const password =
      flags.password ??
      (await input({default: existingProfile.password, message: 'Password:', prefill: 'tab', required: true}))
    const database =
      flags.database ??
      (await input({default: existingProfile.database, message: 'Database:', prefill: 'tab', required: true}))

    const answer = await confirm({message: `Override profile "${profileName}"?`})
    if (!answer) {
      return
    }

    config.profiles[profileName] = {database, host, password, port, ssl: flags.ssl, user}
    await fs.writeJSON(configPath, config, {mode: 0o600})

    action.start('Testing connection')
    const updatedConfig: PgJsonConfig = await fs.readJSON(configPath)
    const result = await testDirectConnection(updatedConfig.profiles[profileName])

    if (result.success) {
      action.stop('✓ successful')
      this.log(`Profile "${profileName}" updated successfully`)
    } else {
      action.stop('✗ failed')
      this.error('Connection failed. Please check your configuration.')
    }

    return result
  }
}
